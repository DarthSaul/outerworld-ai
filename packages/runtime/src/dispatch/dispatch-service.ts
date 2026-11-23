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
 * Dispatch (brief §7, ADR-0024). The `dispatch` tool starts a worker's run in a new session and
 * returns at once. Any agent with dispatch can use it, within its reach and the station's depth,
 * run and spend limits, so a worker may itself dispatch. A dispatch is done when its worker
 * session has gone quiet: its run has ended, nothing it dispatched is still running, and it has
 * reviewed every report it got. Then a report (the session's last reply plus the files it wrote)
 * is posted into the dispatcher's session, level by level up the tree. The Commander's own
 * session reviews reports when `autoReview` is on; a dispatched session always does, since its
 * own report is not finished until it has folded in its workers'.
 */
export class DispatchService {
  readonly #o: {
    home: string;
    runs: RunService;
    sessions: SessionStore;
    events: EventStore;
    dispatches: DispatchStore;
  };
  /** Sessions with a report they have not yet reviewed. */
  readonly #needsReview = new Set<string>();
  /** One `#step` at a time per session, so a dispatch is reported and reviewed once. */
  readonly #advancing = new Map<string, Promise<void>>();

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
    // Any run ending may finish a dispatch, or free a session that has a report to review.
    options.runs.onSettled((run) => {
      void this.#advance(run.sessionId);
    });
  }

  dispatchTool(): ToolImpl {
    return {
      description:
        "Hand a task to a crew member. It runs in their own session in the background and this call returns at once; their result is posted into this session when they finish. Give them everything they need in `task` (and `inputs`), since they cannot see this conversation.",
      inputSchema: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "The crew member's id, from the crew you can hand work to",
          },
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
    const tree = this.#o.runs.tree(ctx.runId);
    const check = checkDispatch({
      from: ctx.agentId,
      to,
      depth: ctx.depth,
      station: loaded.station,
      crew: loaded.agents,
      chain: tree.chain,
      tree,
    });
    if (!check.ok) throw new Error(check.reason);

    const leader = loaded.agents.find((a) => a.id === ctx.agentId)?.config;
    const lead = leader?.name ?? ctx.agentId;
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
      `Task from ${lead}${leader?.role === "overseer" ? ", the Overseer" : ""}:`,
      task,
      ...(inputs !== undefined ? ["", "Inputs:", JSON.stringify(inputs, null, 2)] : []),
      "",
      `When you are done, reply with a short summary of what you did and where any files are. Your reply is sent back to ${lead}.`,
    ].join("\n");
    const depth = ctx.depth + 1;
    let runId: string;
    try {
      ({ runId } = await this.#o.runs.send(worker.id, message, {
        trigger: "dispatch",
        depth,
        dispatchId: dispatch.id,
        parentRunId: ctx.runId,
        rootRunId: tree.rootRunId,
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
      payload: {
        dispatchId: dispatch.id,
        to,
        task,
        workerSessionId: worker.id,
        workerRunId: runId,
        depth,
      },
    });
    return {
      dispatchId: dispatch.id,
      status: "started",
      to,
      workerSessionId: worker.id,
      note: "Started. The result will be posted into this session when it is done; carry on meanwhile.",
    };
  }

  /**
   * On startup, after the runs are marked interrupted: a dispatch still marked running can no
   * longer finish, so its dispatcher gets an interrupted report instead of waiting forever.
   */
  recover(): DispatchRecord[] {
    const stuck = this.#o.dispatches.running();
    for (const d of stuck) {
      this.#report(d, "interrupted", "Interrupted: the daemon stopped while it was working.");
    }
    return stuck;
  }

  /** Re-checks a session once nothing else is checking it (see `#step`). */
  #advance(sessionId: string): Promise<void> {
    const prior = this.#advancing.get(sessionId) ?? Promise.resolve();
    const next = prior.then(() => this.#step(sessionId)).catch(() => undefined);
    this.#advancing.set(sessionId, next);
    void next.then(() => {
      if (this.#advancing.get(sessionId) === next) this.#advancing.delete(sessionId);
    });
    return next;
  }

  /**
   * A free session reviews a report it has not seen yet. A free dispatched session with nothing of
   * its own still out and nothing left to review is done, and reports up.
   */
  async #step(sessionId: string): Promise<void> {
    if (this.#o.runs.hasActiveRun(sessionId)) return;
    const own = this.#o.dispatches.forWorkerSession(sessionId);
    if (this.#needsReview.has(sessionId)) {
      this.#needsReview.delete(sessionId);
      // A review that starts ends in a run that settles, which comes back here.
      if (await this.#review(sessionId, own)) return;
    }
    if (own?.status !== "running") return;
    if (this.#o.dispatches.forLeadSession(sessionId).some((d) => d.status === "running")) return;
    await this.#complete(own);
  }

  /**
   * Starts a review turn in a session with a new report. It continues the tree of the session's
   * latest run, at its depth and under its parent, so it is held to the same limits and chain.
   * Returns whether one started.
   */
  async #review(sessionId: string, own: DispatchRecord | undefined): Promise<boolean> {
    const latest = this.#o.sessions.runs(sessionId)[0];
    if (!latest) return false;
    const station = (await loadStationDir(this.#o.home)).station;
    if (!station) return false;
    // The Commander's session follows the setting; a dispatched one reviews only while its own
    // work is going well (not after it was cancelled, stopped by a budget, or failed).
    if (own ? latest.state !== "completed" : !station.dispatch.autoReview) return false;
    if (this.#overTreeBudget(latest.id, station.budgets.perTreeUsd)) return false;
    try {
      await this.#o.runs.continueSession(sessionId, {
        trigger: "review",
        depth: latest.depth,
        rootRunId: latest.rootRunId,
        ...(latest.parentRunId ? { parentRunId: latest.parentRunId } : {}),
      });
      return true;
    } catch {
      // Kill switch on, session archived, or a run started meanwhile: the report stays put.
      return false;
    }
  }

  #overTreeBudget(runId: string, cap: number | null | undefined): boolean {
    return cap !== null && cap !== undefined && this.#o.runs.tree(runId).spentUsd >= cap;
  }

  /** The worker's session has gone quiet: report how it went to the dispatcher. */
  async #complete(dispatch: DispatchRecord): Promise<void> {
    const last = this.#o.sessions.runs(dispatch.workerSessionId)[0];
    const station = (await loadStationDir(this.#o.home)).station;
    const overTree = last ? this.#overTreeBudget(last.id, station?.budgets.perTreeUsd) : false;
    let status: Exclude<DispatchStatus, "running"> = (last && outcome[last.state]) ?? "failed";
    // A run the tree's spend cap cancelled was stopped by a budget, not by the Commander.
    if (status === "cancelled" && overTree) status = "blocked";
    const messages = this.#o.sessions.messages(dispatch.workerSessionId);
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
        ? overTree
          ? "Stopped: this request reached its budget."
          : "Stopped by a budget before it could finish."
        : status === "interrupted"
          ? "Interrupted: the daemon stopped while it was working."
          : status === "failed"
            ? `Failed: ${last?.error ?? "unknown error"}`
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
    if (!this.#report(dispatch, status, text, why)) return;
    this.#needsReview.add(dispatch.leadSessionId);
    await this.#advance(dispatch.leadSessionId);
  }

  /**
   * Records how a dispatch ended and posts the report into the dispatcher's session. Returns false,
   * changing nothing, when the dispatch had already ended.
   */
  #report(
    dispatch: DispatchRecord,
    status: Exclude<DispatchStatus, "running">,
    text: string,
    why = text,
  ): boolean {
    if (this.#o.dispatches.get(dispatch.id)?.status !== "running") return false;
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
    return true;
  }
}
