import {
  assemblePrompt,
  type ChatMessage,
  historyBudget,
  isTerminal,
  resolveGrants,
  roleBriefing,
  SUPPORTED_MODELS,
  type ToolCallRecord,
  type ToolClass,
} from "@darthsaul/outerworld-ai-core";
import { APICallError, jsonSchema, type LanguageModel, streamText, type ToolSet, tool } from "ai";
import { ConflictError, NotFoundError } from "../crew/crew-service.js";
import type {
  RunRecord,
  RunTrigger,
  SessionRecord,
  SessionStore,
} from "../sessions/session-store.js";
import type { EventStore } from "../storage/event-store.js";
import { loadStationDir } from "../storage/station-dir.js";
import { toModelMessages } from "./model-messages.js";

/** A tool the runtime can execute. It is offered only when the agent is also granted it. */
export interface ToolImpl {
  readonly description: string;
  /** JSON Schema for the input the model must send. */
  readonly inputSchema: Record<string, unknown>;
  readonly class: ToolClass;
  execute(
    input: unknown,
    context: { agentId: string; sessionId: string; runId: string; signal: AbortSignal },
  ): Promise<unknown>;
}

export interface RetryPolicy {
  /** Retries after the first attempt. */
  readonly attempts: number;
  readonly baseMs: number;
  readonly maxMs: number;
}

export interface RunServiceOptions {
  readonly home: string;
  readonly events: EventStore;
  readonly sessions: SessionStore;
  /** The model for an id; throws (e.g. no API key) to fail the run with that message. */
  readonly models: (modelId: string) => LanguageModel | Promise<LanguageModel>;
  readonly tools?: Readonly<Record<string, ToolImpl>>;
  readonly maxSteps?: number;
  /** Runs executing at once against the provider; the rest wait queued. */
  readonly concurrency?: number;
  readonly retry?: RetryPolicy;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseMs: 2000, maxMs: 60_000 };
const DEFAULT_CONTEXT = 128_000;

class Cancelled extends Error {
  constructor(readonly by: "user" | "kill_switch" | "budget") {
    super("cancelled");
  }
}

/** A step's model call failed after it had already streamed text: retrying would repeat it. */
class StreamBroken extends Error {}

/** A counting semaphore: at most `limit` holders; others wait in order. */
class Slots {
  #free: number;
  readonly #waiting: Array<() => void> = [];
  constructor(limit: number) {
    this.#free = limit;
  }
  async acquire(signal: AbortSignal): Promise<void> {
    if (this.#free > 0) {
      this.#free--;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const i = this.#waiting.indexOf(grant);
        if (i >= 0) this.#waiting.splice(i, 1);
        reject(new Cancelled("user"));
      };
      signal.addEventListener("abort", abort, { once: true });
      this.#waiting.push(grant);
    });
  }
  release(): void {
    const next = this.#waiting.shift();
    if (next) next();
    else this.#free++;
  }
}

const retryable = (error: unknown): error is APICallError =>
  APICallError.isInstance(error) &&
  error.statusCode !== 402 &&
  (error.isRetryable ||
    [408, 409, 429].includes(error.statusCode ?? 0) ||
    (error.statusCode ?? 0) >= 500);

/** `retry-after` (seconds or HTTP date) or `retry-after-ms`, when the server sent one. */
const retryAfterMs = (error: APICallError): number | undefined => {
  const h = error.responseHeaders ?? {};
  const ms = Number(h["retry-after-ms"]);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const raw = h["retry-after"];
  if (raw === undefined) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

const describeError = (error: unknown): string => {
  if (APICallError.isInstance(error) && error.statusCode === 402) {
    return "OpenRouter says the account is out of credits (HTTP 402)";
  }
  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    return `the model provider returned HTTP ${error.statusCode}`;
  }
  return error instanceof Error ? error.message : String(error);
};

/**
 * The agent loop (brief §8) and the sessions it runs in. One `streamText` call per step, tools
 * declared without `execute`: the runtime checks each call against the agent's grants, executes
 * it, and calls the model again (ADR-0011). Every state change goes through core's state machine
 * and is logged; text deltas are streamed live but only the final message is stored (D18).
 */
export class RunService {
  readonly #o: RunServiceOptions;
  readonly #slots: Slots;
  readonly #active = new Map<string, AbortController>();
  readonly #done = new Map<string, Promise<RunRecord>>();
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: RunServiceOptions) {
    this.#o = options;
    this.#slots = new Slots(options.concurrency ?? 4);
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** On startup: every run a crash left unfinished becomes interrupted (never resumed). */
  recover(): RunRecord[] {
    const runs = this.#o.sessions.interruptUnfinished();
    for (const r of runs) {
      this.#o.events.append({
        type: "run.interrupted",
        agentId: r.agentId,
        sessionId: r.sessionId,
        runId: r.id,
        payload: {},
      });
    }
    return runs;
  }

  createSession(agentId: string, title = "New session"): SessionRecord {
    const s = this.#o.sessions.createSession(agentId, title);
    this.#o.events.append({
      type: "session.created",
      agentId,
      sessionId: s.id,
      payload: { title },
    });
    return s;
  }

  renameSession(sessionId: string, title: string): SessionRecord {
    const s = this.#session(sessionId);
    const renamed = this.#o.sessions.renameSession(sessionId, title);
    this.#o.events.append({
      type: "session.renamed",
      agentId: s.agentId,
      sessionId,
      payload: { title },
    });
    return renamed;
  }

  archiveSession(sessionId: string): SessionRecord {
    const s = this.#session(sessionId);
    const archived = this.#o.sessions.archiveSession(sessionId);
    this.#o.events.append({ type: "session.archived", agentId: s.agentId, sessionId, payload: {} });
    return archived;
  }

  /** Stores the Commander's message and starts a run for it. Returns at once (non-blocking). */
  async send(
    sessionId: string,
    text: string,
    trigger: RunTrigger = "user",
  ): Promise<{ runId: string }> {
    const session = this.#session(sessionId);
    if (session.archivedAt) throw new ConflictError("this session is archived");
    if (this.#o.sessions.runs(sessionId).some((r) => !isTerminal(r.state))) {
      throw new ConflictError("a run is already running in this session");
    }
    const loaded = await loadStationDir(this.#o.home);
    const model = loaded.agents.find((a) => a.id === session.agentId)?.config.model ?? "unknown";
    const run = this.#o.sessions.createRun({ sessionId, agentId: session.agentId, trigger, model });
    this.#o.sessions.appendMessage(sessionId, run.id, { role: "user", text });
    this.#o.events.append({
      type: "run.queued",
      agentId: session.agentId,
      sessionId,
      runId: run.id,
      payload: { trigger },
    });
    const controller = new AbortController();
    this.#active.set(run.id, controller);
    this.#done.set(run.id, this.#execute(run, controller));
    return { runId: run.id };
  }

  /** Cancels a queued or running run. A finished run is left as it is. */
  async cancel(runId: string, by: "user" | "kill_switch" = "user"): Promise<void> {
    const controller = this.#active.get(runId);
    if (!controller) {
      if (!this.#o.sessions.getRun(runId)) throw new NotFoundError(`no run "${runId}"`);
      return;
    }
    controller.abort(new Cancelled(by));
  }

  /** Resolves with the run once it reaches a terminal state (tests, dispatch in Phase 5). */
  async settled(runId: string): Promise<RunRecord> {
    const pending = this.#done.get(runId);
    if (pending) return pending;
    const run = this.#o.sessions.getRun(runId);
    if (!run) throw new NotFoundError(`no run "${runId}"`);
    return run;
  }

  #session(id: string): SessionRecord {
    const s = this.#o.sessions.getSession(id);
    if (!s) throw new NotFoundError(`no session "${id}"`);
    return s;
  }

  async #execute(run: RunRecord, controller: AbortController): Promise<RunRecord> {
    const { events, sessions } = this.#o;
    const ids = { agentId: run.agentId, sessionId: run.sessionId, runId: run.id };
    const signal = controller.signal;
    let holding = false;
    try {
      await this.#slots.acquire(signal);
      holding = true;
      const loaded = await loadStationDir(this.#o.home);
      const agent = loaded.agents.find((a) => a.id === run.agentId);
      sessions.transition(run.id, "start");
      events.append({ type: "run.started", ...ids, payload: { model: run.model } });
      if (!agent || !loaded.station) throw new Error(`no agent "${run.agentId}"`);
      const station = loaded.station;
      const model = await this.#o.models(agent.config.model);

      const registry = this.#o.tools ?? {};
      const granted = resolveGrants(agent.config, station, {});
      const offered = granted.filter((t) => registry[t.name] !== undefined);
      const tools: ToolSet = Object.fromEntries(
        offered.map((t) => [
          t.name,
          tool({
            description: registry[t.name]?.description ?? t.name,
            inputSchema: jsonSchema(registry[t.name]?.inputSchema ?? { type: "object" }),
          }),
        ]),
      ) as ToolSet;
      const context =
        SUPPORTED_MODELS.find((m) => m.id === agent.config.model)?.contextTokens ?? DEFAULT_CONTEXT;
      const briefing = roleBriefing(agent.id, station, loaded.agents);

      const maxSteps = this.#o.maxSteps ?? 12;
      for (let step = 1; step <= maxSteps; step++) {
        const history = sessions.messages(run.sessionId).map((m) => m.message);
        const prompt = assemblePrompt({
          documents: agent.documents,
          roleBriefing: briefing,
          history,
          budgetTokens: historyBudget(context),
        });
        const result = await this.#callWithRetry(ids, signal, () =>
          streamText({
            model,
            instructions: prompt.system,
            messages: toModelMessages(prompt.messages),
            ...(offered.length ? { tools } : {}),
            abortSignal: signal,
            maxRetries: 0,
          }),
        );
        sessions.countStep(run.id);
        if (result.text || result.toolCalls.length) {
          sessions.appendMessage(run.sessionId, run.id, {
            role: "assistant",
            text: result.text,
            ...(result.toolCalls.length ? { toolCalls: result.toolCalls } : {}),
          });
        }
        if (result.toolCalls.length === 0) {
          sessions.transition(run.id, "complete");
          events.append({ type: "run.completed", ...ids, payload: {} });
          return sessions.getRun(run.id) as RunRecord;
        }
        for (const call of result.toolCalls) {
          signal.throwIfAborted();
          await this.#runTool(call, offered, registry, ids, signal);
        }
      }
      sessions.transition(run.id, "complete");
      events.append({ type: "run.completed", ...ids, payload: { reason: "max_steps" } });
      return sessions.getRun(run.id) as RunRecord;
    } catch (error) {
      const reason = signal.aborted ? signal.reason : error;
      if (reason instanceof Cancelled) {
        sessions.transition(run.id, "cancel");
        events.append({ type: "run.cancelled", ...ids, payload: { by: reason.by } });
      } else {
        const message = describeError(error instanceof StreamBroken ? error.cause : error);
        const current = sessions.getRun(run.id);
        if (current?.state === "queued") sessions.transition(run.id, "start");
        sessions.transition(run.id, "fail", { error: message });
        events.append({ type: "run.failed", ...ids, payload: { error: message } });
      }
      return sessions.getRun(run.id) as RunRecord;
    } finally {
      if (holding) this.#slots.release();
      this.#active.delete(run.id);
    }
  }

  /** One model call: streams deltas live; retries transient failures that happened before any text. */
  async #callWithRetry(
    ids: { agentId: string; sessionId: string; runId: string },
    signal: AbortSignal,
    call: () => ReturnType<typeof streamText>,
  ): Promise<{ text: string; toolCalls: ToolCallRecord[] }> {
    const policy = this.#o.retry ?? DEFAULT_RETRY;
    for (let attempt = 0; ; attempt++) {
      let text = "";
      const toolCalls: ToolCallRecord[] = [];
      try {
        for await (const part of call().stream) {
          if (part.type === "text-delta") {
            text += part.text;
            this.#o.events.publish({ type: "run.delta", ...ids, payload: { text: part.text } });
          } else if (part.type === "tool-call") {
            toolCalls.push({ id: part.toolCallId, name: part.toolName, input: part.input });
          } else if (part.type === "error") {
            throw part.error;
          }
        }
        signal.throwIfAborted();
        return { text, toolCalls };
      } catch (error) {
        if (signal.aborted) {
          if (text) {
            this.#o.sessions.appendMessage(ids.sessionId, ids.runId, { role: "assistant", text });
          }
          throw signal.reason;
        }
        if (text)
          throw new StreamBroken("the model stream broke after it started", { cause: error });
        if (!retryable(error) || attempt >= policy.attempts) throw error;
        const delayMs = Math.min(retryAfterMs(error) ?? policy.baseMs * 2 ** attempt, policy.maxMs);
        this.#o.events.append({
          type: "run.retrying",
          ...ids,
          payload: {
            attempt: attempt + 1,
            delayMs,
            ...(error.statusCode !== undefined ? { status: error.statusCode } : {}),
          },
        });
        await this.#sleep(delayMs);
        signal.throwIfAborted();
      }
    }
  }

  /** Double enforcement: a call to anything not offered is rejected here and never executed. */
  async #runTool(
    call: ToolCallRecord,
    offered: readonly { name: string; class: ToolClass }[],
    registry: Readonly<Record<string, ToolImpl>>,
    ids: { agentId: string; sessionId: string; runId: string },
    signal: AbortSignal,
  ) {
    const { events, sessions } = this.#o;
    const grant = offered.find((t) => t.name === call.name);
    const impl = registry[call.name];
    const toolMessage = (output: unknown, isError: boolean): ChatMessage => ({
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      output,
      ...(isError ? { isError: true } : {}),
    });
    if (!grant || !impl) {
      const rejected = `the tool "${call.name}" is not granted to this crew member`;
      events.append({
        type: "run.tool_call",
        ...ids,
        payload: {
          toolCallId: call.id,
          tool: call.name,
          input: call.input,
          class: "write",
          rejected,
        },
      });
      sessions.appendMessage(ids.sessionId, ids.runId, toolMessage(rejected, true));
      return;
    }
    events.append({
      type: "run.tool_call",
      ...ids,
      payload: { toolCallId: call.id, tool: call.name, input: call.input, class: grant.class },
    });
    try {
      const output = await impl.execute(call.input, { ...ids, signal });
      events.append({
        type: "run.tool_result",
        ...ids,
        payload: { toolCallId: call.id, tool: call.name, ok: true },
      });
      sessions.appendMessage(ids.sessionId, ids.runId, toolMessage(output, false));
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const summary = error instanceof Error ? error.message : String(error);
      events.append({
        type: "run.tool_result",
        ...ids,
        payload: { toolCallId: call.id, tool: call.name, ok: false, summary },
      });
      sessions.appendMessage(ids.sessionId, ids.runId, toolMessage(summary, true));
    }
  }
}
