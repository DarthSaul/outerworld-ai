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
 * Dispatch (brief §7, ADR-0025). The `dispatch` tool starts a worker's run in a new session and
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
  /**
   * Sessions with reports they have not yet reviewed: the lead run each report answers, oldest
   * first. A review takes its place in the tree from that run, so reports from different
   * requests are reviewed separately, each under its own request's limits.
   */
  readonly #needsReview = new Map<string, string[]>();
  /** One `#step` at a time per session, so a dispatch is reported and reviewed once. */
  readonly #advancing = new Map<string, Promise<void>>();
  /**
   * Dispatches admitted but whose worker run is not yet stored, per root run. They count toward
   * the run cap, so two dispatches in one tree cannot both take its last slot across an await.
   */
  readonly #reserved = new Map<string, number>();

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
    ctx: { agentId: string; sessionId: string; runId: string; depth: number; signal: AbortSignal },
  ): Promise<unknown> {
    const parsed = DispatchInput.safeParse(input);
    if (!parsed.success) throw new Error("invalid input: `to` and `task` are required");
    const { to, task, inputs } = parsed.data;
    const loaded = await loadStationDir(this.#o.home);
    if (!loaded.station) throw new Error("the station has no valid station.json");
    // A dispatcher cancelled while the station loaded starts nothing.
    ctx.signal.throwIfAborted();
    const tree = this.#o.runs.tree(ctx.runId);
    const reserved = this.#reserved.get(tree.rootRunId) ?? 0;
    const check = checkDispatch({
      from: ctx.agentId,
      to,
      depth: ctx.depth,
      station: loaded.station,
      crew: loaded.agents,
      chain: tree.chain,
      tree: { ...tree, dispatchedRuns: tree.dispatchedRuns + reserved },
    });
    if (!check.ok) throw new Error(check.reason);
    // Checked and reserved with no await between, so the run cap holds across concurrent sends.
    this.#reserved.set(tree.rootRunId, reserved + 1);
    try {
      return await this.#admit(ctx, to, task, inputs, loaded, tree.rootRunId);
    } finally {
      const left = (this.#reserved.get(tree.rootRunId) ?? 1) - 1;
      if (left > 0) this.#reserved.set(tree.rootRunId, left);
      else this.#reserved.delete(tree.rootRunId);
    }
  }

  /** Opens the worker's session and starts its run, once the dispatch has been checked. */
  async #admit(
    ctx: { agentId: string; sessionId: string; runId: string; depth: number; signal: AbortSignal },
    to: string,
    task: string,
    inputs: unknown,
    loaded: Awaited<ReturnType<typeof loadStationDir>>,
    rootRunId: string,
  ): Promise<unknown> {
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
        rootRunId,
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
    // The dispatcher was cancelled while its worker was being started: the cascade that ran then
    // could not see this run, so stop it now. It is the dispatcher's child, so later cascades do.
    if (ctx.signal.aborted) await this.#o.runs.cancel(runId);
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

  /**
   * Resolves once no session is being checked: every report posted and every review decision
   * made for what has settled so far. For tests and shutdown; runs still going are not awaited.
   */
  async idle(): Promise<void> {
    while (this.#advancing.size) await Promise.all([...this.#advancing.values()]);
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
    for (let next = this.#needsReview.get(sessionId)?.[0]; next; ) {
      const result = await this.#review(sessionId, own, next);
      // A run got in first: the review stays pending, and that run's end comes back here.
      if (result === "retry") return;
      this.#reviewed(sessionId, next);
      // A review that starts ends in a run that settles, which comes back here.
      if (result === "started") return;
      next = this.#needsReview.get(sessionId)?.[0];
    }
    if (own?.status !== "running") return;
    if (this.#o.dispatches.forLeadSession(sessionId).some((d) => d.status === "running")) return;
    await this.#complete(own);
  }

  /** Drops the pending reports of the same request as `leadRunId`: one review covers them. */
  #reviewed(sessionId: string, leadRunId: string): void {
    const rootOf = (id: string) => this.#o.sessions.getRun(id)?.rootRunId ?? id;
    const root = rootOf(leadRunId);
    const left = (this.#needsReview.get(sessionId) ?? []).filter((id) => rootOf(id) !== root);
    if (left.length) this.#needsReview.set(sessionId, left);
    else this.#needsReview.delete(sessionId);
  }

  /**
   * Starts a review turn for a report. It continues the tree of the lead run the report answers,
   * at its depth and under its parent, so it is held to that request's limits and chain.
   * `retry` when a run started first, so the review must wait rather than be dropped.
   */
  async #review(
    sessionId: string,
    own: DispatchRecord | undefined,
    leadRunId: string,
  ): Promise<"started" | "skipped" | "retry"> {
    const latest = this.#o.sessions.runs(sessionId)[0];
    if (!latest) return "skipped";
    const lead = this.#o.sessions.getRun(leadRunId) ?? latest;
    const station = (await loadStationDir(this.#o.home)).station;
    if (!station) return "skipped";
    if (this.#o.runs.hasActiveRun(sessionId)) return "retry";
    // A cancelled request starts nothing new; its report stays in the session for the Commander.
    // A cancelled run of some other request in the same session does not stop this one's review.
    const cancelledHere = latest.state === "cancelled" && latest.rootRunId === lead.rootRunId;
    if (lead.state === "cancelled" || cancelledHere) return "skipped";
    // The Commander's session follows the setting; a dispatched one reviews only while its own
    // work is going well (not after it was stopped by a budget or failed).
    if (own ? latest.state !== "completed" : !station.dispatch.autoReview) return "skipped";
    if (this.#overTreeBudget(lead.id, station.budgets.perTreeUsd)) return "skipped";
    try {
      await this.#o.runs.continueSession(sessionId, {
        trigger: "review",
        depth: lead.depth,
        rootRunId: lead.rootRunId,
        ...(lead.parentRunId ? { parentRunId: lead.parentRunId } : {}),
        // A nested review belongs to its dispatch, so cancelling the dispatch reaches it.
        ...(own ? { dispatchId: own.id } : {}),
      });
      return "started";
    } catch {
      // A run started meanwhile: try again when it ends. Kill switch or archived: the report stays.
      return this.#o.runs.hasActiveRun(sessionId) ? "retry" : "skipped";
    }
  }

  #overTreeBudget(runId: string, cap: number | null | undefined): boolean {
    return cap !== null && cap !== undefined && this.#o.runs.tree(runId).spentUsd >= cap;
  }

  /** The worker's session has gone quiet: report how it went to the dispatcher. */
  async #complete(dispatch: DispatchRecord): Promise<void> {
    // Everything after this check is synchronous, so no run can start in the worker's session
    // between deciding it is quiet and reporting. A run that got in first reports when it ends.
    if (this.#o.runs.hasActiveRun(dispatch.workerSessionId)) return;
    const last = this.#o.sessions.runs(dispatch.workerSessionId)[0];
    // Why it stopped, as recorded when it did, not as the caps stand now.
    const cancelledBy = last
      ? this.#o.events
          .ofRun(last.id, ["run.cancelled"])
          .flatMap((e) => (e.type === "run.cancelled" ? [e.payload.by] : []))
          .at(-1)
      : undefined;
    const blockedScope = last
      ? this.#o.events
          .ofRun(last.id, ["budget.blocked"])
          .flatMap((e) => (e.type === "budget.blocked" ? [e.payload.scope] : []))
          .at(-1)
      : undefined;
    let status: Exclude<DispatchStatus, "running"> = (last && outcome[last.state]) ?? "failed";
    // A run a spend cap cancelled was stopped by a budget, not by the Commander.
    if (status === "cancelled" && cancelledBy === "budget") status = "blocked";
    const overTree = cancelledBy === "budget" || blockedScope === "tree";
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
    const pending = this.#needsReview.get(dispatch.leadSessionId) ?? [];
    this.#needsReview.set(dispatch.leadSessionId, [...pending, dispatch.leadRunId]);
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
