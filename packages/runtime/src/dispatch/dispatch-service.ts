import { type ChatMessage, checkDispatch } from "@darthsaul/outerworld-ai-core";
import { z } from "zod";
import { NotFoundError } from "../crew/crew-service.js";
import type { RunService, ToolImpl } from "../run/run-service.js";
import type { RunRecord, SessionStore } from "../sessions/session-store.js";
import type { EventStore } from "../storage/event-store.js";
import { loadStationDir } from "../storage/station-dir.js";
import type { DispatchRecord, DispatchStatus, DispatchStore } from "./dispatch-store.js";

/** A worker's summary in the report is cut to this; the full transcript stays in its session. */
const MAX_SUMMARY_CHARS = 4000;
/** read_session returns at most this much transcript. */
const MAX_TRANSCRIPT_CHARS = 20_000;

const DispatchInput = z.strictObject({
  to: z.string().min(1),
  task: z.string().trim().min(1).max(8000),
  inputs: z.unknown().optional(),
});
const ReadSessionInput = z.strictObject({ sessionId: z.string().min(1) });

const outcome: Record<RunRecord["state"], Exclude<DispatchStatus, "running"> | undefined> = {
  queued: undefined,
  running: undefined,
  awaiting_consent: undefined,
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  blocked_budget: "blocked",
  interrupted: "interrupted",
};

const line = (m: ChatMessage, names: (id: string) => string, agent: string): string => {
  if (m.role === "user") return `Commander: ${m.text}`;
  if (m.role === "report") return `Report from ${names(m.from)} (${m.status}): ${m.text}`;
  if (m.role === "tool")
    return `[${m.name} ${m.isError ? "failed" : "returned"}: ${JSON.stringify(m.output)}]`;
  const calls = m.toolCalls?.length ? ` [calls: ${m.toolCalls.map((c) => c.name).join(", ")}]` : "";
  return `${agent}: ${m.text}${calls}`;
};

/**
 * Overseer dispatch at depth 1 (brief §7). The `dispatch` tool starts a worker's run in a new
 * session and returns at once; when the worker's run ends, a report (summary plus files it wrote)
 * is posted into the lead's session and, with auto review on, the lead reviews it as soon as its
 * session is free. Workers never message each other.
 */
export class DispatchService {
  readonly #o: {
    home: string;
    runs: RunService;
    sessions: SessionStore;
    events: EventStore;
    dispatches: DispatchStore;
  };
  /** Lead sessions with a report the lead has not yet reviewed. */
  readonly #needsReview = new Set<string>();

  constructor(options: {
    home: string;
    runs: RunService;
    sessions: SessionStore;
    events: EventStore;
    dispatches: DispatchStore;
  }) {
    this.#o = options;
    options.runs.registerTool("dispatch", this.dispatchTool());
    options.runs.registerTool("read_session", this.readSessionTool());
    // A lead that was busy when a report arrived reviews it once its run ends.
    options.runs.onSettled((run) => {
      if (this.#needsReview.has(run.sessionId)) void this.#review(run.sessionId);
    });
  }

  dispatchTool(): ToolImpl {
    return {
      description:
        "Hand a task to a crew member. It runs in their own session in the background and this call returns at once; their result is posted into this session when they finish. Give them everything they need in `task` (and `inputs`), since they cannot see this conversation.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "The crew member's id, from your crew roster" },
          task: { type: "string", description: "What to do, with enough context to do it" },
          inputs: { type: "object", description: "Optional structured inputs for the task" },
        },
        required: ["to", "task"],
        additionalProperties: false,
      },
      class: "read",
      execute: (input, ctx) => this.#dispatch(input, ctx),
    };
  }

  readSessionTool(): ToolImpl {
    return {
      description:
        "Read the transcript of any session on the station (for example a crew member's dispatched work). Read-only; long transcripts are cut from the start.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
      class: "read",
      execute: async (input) => {
        const parsed = ReadSessionInput.safeParse(input);
        if (!parsed.success) throw new Error("invalid input: a sessionId is required");
        const session = this.#o.sessions.getSession(parsed.data.sessionId);
        if (!session) throw new NotFoundError(`no session "${parsed.data.sessionId}"`);
        const loaded = await loadStationDir(this.#o.home);
        const names = (id: string) => loaded.agents.find((a) => a.id === id)?.config.name ?? id;
        const full = this.#o.sessions
          .messages(session.id)
          .map((m) => line(m.message, names, names(session.agentId)))
          .join("\n");
        const truncated = full.length > MAX_TRANSCRIPT_CHARS;
        return {
          session: { id: session.id, agentId: session.agentId, title: session.title },
          transcript: truncated ? full.slice(0, MAX_TRANSCRIPT_CHARS) : full,
          truncated,
        };
      },
    };
  }

  async #dispatch(
    input: unknown,
    ctx: { agentId: string; sessionId: string; runId: string; depth: number },
  ): Promise<unknown> {
    const parsed = DispatchInput.safeParse(input);
    if (!parsed.success) throw new Error("invalid input: `to` and `task` are required");
    const { to, task, inputs } = parsed.data;
    const loaded = await loadStationDir(this.#o.home);
    if (!loaded.station) throw new Error("the station has no valid station.json");
    const check = checkDispatch({
      from: ctx.agentId,
      to,
      depth: ctx.depth,
      station: loaded.station,
      crew: loaded.agents,
    });
    if (!check.ok) throw new Error(check.reason);

    const lead = loaded.agents.find((a) => a.id === ctx.agentId)?.config.name ?? ctx.agentId;
    const worker = this.#o.runs.createSession(to, `From ${lead}: ${task.slice(0, 60)}`);
    const dispatch = this.#o.dispatches.create({
      leadAgentId: ctx.agentId,
      leadSessionId: ctx.sessionId,
      leadRunId: ctx.runId,
      workerAgentId: to,
      workerSessionId: worker.id,
      task,
      ...(inputs !== undefined ? { inputs } : {}),
    });
    const message = [
      `Task from ${lead}, the Overseer:`,
      task,
      ...(inputs !== undefined ? ["", "Inputs:", JSON.stringify(inputs, null, 2)] : []),
      "",
      "When you are done, reply with a short summary of what you did and where any files are. Your reply is sent back to the Overseer.",
    ].join("\n");
    let runId: string;
    try {
      ({ runId } = await this.#o.runs.send(worker.id, message, {
        trigger: "dispatch",
        depth: ctx.depth + 1,
        dispatchId: dispatch.id,
      }));
    } catch (error) {
      this.#o.dispatches.finish(
        dispatch.id,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
    this.#o.dispatches.setWorkerRun(dispatch.id, runId);
    this.#o.events.append({
      type: "dispatch.started",
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
      runId: ctx.runId,
      payload: { dispatchId: dispatch.id, to, task },
    });
    void this.#o.runs.settled(runId).then((run) => this.#complete(dispatch, run));
    return {
      dispatchId: dispatch.id,
      status: "started",
      to,
      workerSessionId: worker.id,
      note: "Started. The result will be posted into this session when it is done; carry on meanwhile.",
    };
  }

  /** Posts the worker's result into the lead's session and asks for a review. */
  async #complete(dispatch: DispatchRecord, run: RunRecord): Promise<void> {
    const status = outcome[run.state] ?? "failed";
    const messages = this.#o.sessions
      .messages(dispatch.workerSessionId)
      .filter((m) => m.runId === run.id);
    const lastReply = [...messages]
      .reverse()
      .find((m) => m.message.role === "assistant" && m.message.text)?.message;
    const summary =
      lastReply?.role === "assistant" ? lastReply.text.slice(0, MAX_SUMMARY_CHARS) : "";
    const files = messages.flatMap((m) =>
      m.message.role === "tool" && m.message.name === "write_file" && !m.message.isError
        ? [String((m.message.output as { path?: unknown })?.path ?? "")].filter(Boolean)
        : [],
    );
    const why =
      status === "blocked"
        ? "Stopped by a budget before it could finish."
        : status === "interrupted"
          ? "Interrupted: the daemon stopped while it was working."
          : status === "failed"
            ? `Failed: ${run.error ?? "unknown error"}`
            : status === "cancelled"
              ? "Cancelled by the Commander."
              : "";
    const text = [
      summary || (status === "completed" ? "(finished without a written summary)" : ""),
      files.length ? `Files in ${dispatch.workerAgentId}'s workspace: ${files.join(", ")}` : "",
      why,
    ]
      .filter(Boolean)
      .join("\n\n");

    this.#o.dispatches.finish(dispatch.id, status, text);
    this.#o.sessions.appendMessage(dispatch.leadSessionId, undefined, {
      role: "report",
      dispatchId: dispatch.id,
      from: dispatch.workerAgentId,
      status,
      text,
    });
    const ids = {
      agentId: dispatch.leadAgentId,
      sessionId: dispatch.leadSessionId,
      runId: dispatch.leadRunId,
    };
    if (status === "completed") {
      this.#o.events.append({
        type: "dispatch.completed",
        ...ids,
        payload: { dispatchId: dispatch.id, summary: text },
      });
    } else if (status === "cancelled") {
      this.#o.events.append({
        type: "dispatch.cancelled",
        ...ids,
        payload: { dispatchId: dispatch.id },
      });
    } else {
      this.#o.events.append({
        type: "dispatch.failed",
        ...ids,
        payload: { dispatchId: dispatch.id, error: why },
      });
    }

    const loaded = await loadStationDir(this.#o.home);
    if (loaded.station?.dispatch.autoReview) {
      this.#needsReview.add(dispatch.leadSessionId);
      await this.#review(dispatch.leadSessionId);
    }
  }

  /** Starts the lead's review turn if its session is free; otherwise waits for its run to end. */
  async #review(sessionId: string): Promise<void> {
    if (this.#o.runs.hasActiveRun(sessionId)) return;
    this.#needsReview.delete(sessionId);
    try {
      await this.#o.runs.continueSession(sessionId, { trigger: "review", depth: 0 });
    } catch {
      // Kill switch on or session archived: the report stays in the session for the Commander.
    }
  }
}
