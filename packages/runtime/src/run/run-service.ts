import {
  type AgentConfig,
  type ApprovalMode,
  assemblePrompt,
  type BudgetLine,
  type Budgets,
  type ChatMessage,
  type ConnectorToolCatalog,
  checkBudget,
  cleanTitle,
  DEFAULT_SESSION_TITLE,
  type EffectiveTool,
  effectiveApprovalMode,
  estimateCostUsd,
  fallbackTitle,
  findModel,
  historyBudget,
  isTerminal,
  type ModelSettings,
  needsConsent,
  type PromptSkills,
  type ProviderChoice,
  type ReasoningLevel,
  resolveGrants,
  resolveModelSettings,
  roleBriefing,
  SKILL_VIEW_TOOL,
  type Skill,
  selectSkills,
  type ToolCallRecord,
  type ToolClass,
  titlePrompt,
  utcDay,
  withSkillTool,
} from "@darthsaul/outerworld-ai-core";
import { APICallError, jsonSchema, type LanguageModel, streamText, type ToolSet, tool } from "ai";
import type { ConsentRecord, ConsentStore } from "../controls/consent-store.js";
import type { KillSwitch } from "../controls/kill-switch.js";
import type { SpendStore } from "../controls/spend-store.js";
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
    context: {
      agentId: string;
      sessionId: string;
      runId: string;
      /** 0 for a top-level run, 1 for a dispatched worker's run. */
      depth: number;
      signal: AbortSignal;
      /** Ids of the skills this run offered when it was set up (ADR-0023); `skill_view` stays inside them. */
      skills?: readonly string[];
    },
  ): Promise<unknown>;
}

/** What the loop needs from connected MCP servers (the ConnectorManager provides it). */
export interface ConnectorBridge {
  catalog(): ConnectorToolCatalog;
  describe(
    connectorId: string,
    tool: string,
  ): { description: string; inputSchema: Record<string, unknown> } | undefined;
  call(connectorId: string, tool: string, input: unknown, signal: AbortSignal): Promise<unknown>;
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
  /** Pending consent requests (brief §6). */
  readonly consents: ConsentStore;
  /** Spend per model call, for budgets and totals (brief §15). */
  readonly spend: SpendStore;
  readonly killSwitch: KillSwitch;
  readonly now?: () => Date;
  /**
   * The model for an id and a key choice; throws (e.g. no API key) to fail the run with that
   * message.
   */
  readonly models: (
    modelId: string,
    options?: { provider?: ProviderChoice },
  ) => LanguageModel | Promise<LanguageModel>;
  readonly tools?: Readonly<Record<string, ToolImpl>>;
  /** Approved beliefs to put in each run's prompt (brief §14). */
  readonly beliefs?: (agentId: string) => readonly string[];
  /**
   * The skills library (ADR-0023). Absent: no skills section, and the prompt is what it was.
   * Pair it with a `skill_view` tool in `tools`, or skill bodies are put inline.
   */
  readonly skills?: readonly Skill[];
  /** Connected connectors; their tools are offered to agents granted the connector. */
  readonly connectors?: ConnectorBridge;
  readonly maxSteps?: number;
  /** Runs executing at once against the provider; the rest wait queued. */
  readonly concurrency?: number;
  readonly retry?: RetryPolicy;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Applied to a failure message before it is stored (the event store redacts its own copy). */
  readonly redact?: (text: string) => string;
  /**
   * Name a fresh session from the Commander's first message with one short call to the crew
   * member's model (ADR-0014). Off by default so scripted test models see only run calls.
   */
  readonly titles?: boolean;
}

/** A title call's output cap, and how long it may take before the message names the session. */
const TITLE_MAX_TOKENS = 32;
const TITLE_TIMEOUT_MS = 30_000;
/** Title calls in flight at once, apart from the run slots so they never hold up a run. */
const TITLE_CONCURRENCY = 2;

const DEFAULT_RETRY: RetryPolicy = { attempts: 3, baseMs: 2000, maxMs: 60_000 };
const DEFAULT_CONTEXT = 128_000;
/** Whether any spend cap is set: then every call's cost must be known. */
const hasBudget = (b: Budgets) =>
  b.perRunUsd !== undefined ||
  b.perAgentDailyUsd !== undefined ||
  b.stationDailyUsd !== undefined ||
  (b.perTreeUsd ?? null) !== null;

/**
 * A direct Anthropic call reports tokens, not dollars, and is priced from the model list
 * (ADR-0015); a model without a list price there has a cost no budget could count.
 */
const unpricedDirect = (model: LanguageModel, modelId: string) =>
  typeof model === "object" &&
  model.provider.startsWith("anthropic") &&
  findModel(modelId)?.pricing === undefined;

/** A provider's error message is kept this short in the run record. */
const MAX_REASON_CHARS = 300;

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

/** How a send may start a run: what caused it, and a model choice over the session's. */
export interface SendOptions {
  readonly trigger?: RunTrigger;
  readonly depth?: number;
  readonly dispatchId?: string;
  /** Lineage (ADR-0024): the run above this one, and its tree's root. Absent: a new tree. */
  readonly parentRunId?: string;
  readonly rootRunId?: string;
  /** Overrides the session's model settings for this run only (a scheduled job's, ADR-0016). */
  readonly modelSettings?: ModelSettings | undefined;
}

/**
 * The reasoning level as call settings (ADR-0016): the AI SDK's `reasoning`, which the Anthropic
 * provider maps to effort, and OpenRouter's own `reasoning.effort`. `default` sends neither.
 */
const reasoningOptions = (level: ReasoningLevel) =>
  level === "default"
    ? {}
    : {
        reasoning: level,
        providerOptions: { openrouter: { reasoning: { effort: level } } },
      };

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
    return "the model provider says the account is out of credits (HTTP 402)";
  }
  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    // The provider's own reason (e.g. "x is not a valid model ID") is what makes this fixable.
    const reason = error.message.trim().slice(0, MAX_REASON_CHARS);
    const detail = reason && reason !== `HTTP ${error.statusCode}` ? `: ${reason}` : "";
    return `the model provider returned HTTP ${error.statusCode}${detail}`;
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
  readonly #titleSlots = new Slots(TITLE_CONCURRENCY);
  /** Title calls waiting or in flight; the kill switch aborts them. */
  readonly #titleCalls = new Set<AbortController>();
  readonly #active = new Map<string, AbortController>();
  readonly #done = new Map<string, Promise<RunRecord>>();
  /** Each session's handovers, applied one at a time in the order they were asked for. */
  readonly #handovers = new Map<string, Promise<unknown>>();
  readonly #sleep: (ms: number) => Promise<void>;
  /** Runs paused for consent, waiting for the Commander's decision. */
  readonly #waiting = new Map<string, (decision: "approved" | "denied") => void>();
  /** Budget warnings already sent (one per cap per run, agent-day, or station-day). */
  readonly #warned = new Set<string>();
  /** Directions queued for running runs, injected before their next model call. */
  readonly #directions = new Map<string, string[]>();
  readonly #settledListeners = new Set<(run: RunRecord) => void>();
  readonly #tools: Record<string, ToolImpl>;

  constructor(options: RunServiceOptions) {
    this.#o = options;
    this.#slots = new Slots(options.concurrency ?? 4);
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#tools = { ...(options.tools ?? {}) };
  }

  /** Adds a tool implementation after construction (the dispatch tool needs this service). */
  registerTool(name: string, impl: ToolImpl): void {
    this.#tools[name] = impl;
  }

  /** Called with every run once it reaches a terminal state. Returns unsubscribe. */
  onSettled(listener: (run: RunRecord) => void): () => void {
    this.#settledListeners.add(listener);
    return () => this.#settledListeners.delete(listener);
  }

  /**
   * Queues the Commander's direction for a running run (brief §7, steer). It is added to the
   * session as a message from the Commander right before the run's next model call.
   */
  steer(runId: string, text: string): void {
    const run = this.#o.sessions.getRun(runId);
    if (!run) throw new NotFoundError(`no run "${runId}"`);
    if (!this.#active.has(runId) || isTerminal(run.state)) {
      throw new ConflictError("that run is not running");
    }
    this.#directions.set(runId, [...(this.#directions.get(runId) ?? []), text]);
    this.#o.events.append({
      type: "run.steered",
      agentId: run.agentId,
      sessionId: run.sessionId,
      runId,
      payload: { text },
    });
  }

  /** On startup: every run a crash left unfinished becomes interrupted (never resumed). */
  recover(): RunRecord[] {
    // A consent that was pending when the daemon stopped can no longer be answered.
    this.#o.consents.expireAll();
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

  createSession(agentId: string, title = DEFAULT_SESSION_TITLE): SessionRecord {
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

  /**
   * This conversation's model, key, and reasoning level (ADR-0016). Takes effect from the next
   * run; a run already going keeps what it started with. `null` goes back to the crew member's.
   */
  setSessionModel(sessionId: string, settings: ModelSettings | null): SessionRecord {
    this.#session(sessionId);
    return this.#o.sessions.setModelSettings(sessionId, settings);
  }

  /**
   * Hands the conversation to another crew member (ADR-0018): the transcript stays, and the next
   * run is theirs, with their documents, grants, and model. Not while a run is going, and never a
   * dispatched worker's session (its report goes back to the lead).
   */
  reassignSession(sessionId: string, agentId: string): Promise<SessionRecord> {
    const prior = this.#handovers.get(sessionId) ?? Promise.resolve();
    const next = prior.then(() => this.#reassign(sessionId, agentId));
    const tail = next.catch(() => undefined);
    this.#handovers.set(sessionId, tail);
    void tail.then(() => {
      if (this.#handovers.get(sessionId) === tail) this.#handovers.delete(sessionId);
    });
    return next;
  }

  async #reassign(sessionId: string, agentId: string): Promise<SessionRecord> {
    this.#session(sessionId);
    const loaded = await loadStationDir(this.#o.home);
    if (!loaded.agents.some((a) => a.id === agentId)) {
      throw new NotFoundError(`no agent "${agentId}"`);
    }
    // Read again after the await: another handover may have landed meanwhile, and this one must
    // compare against (and record) the owner it actually takes the session from.
    const s = this.#session(sessionId);
    if (s.agentId === agentId) return s;
    if (this.#o.sessions.isDispatched(sessionId)) {
      throw new ConflictError("a dispatched session stays with the crew member it was given to");
    }
    if (this.hasActiveRun(sessionId)) {
      throw new ConflictError("a run is still running in this session");
    }
    const moved = this.#o.sessions.setAgent(sessionId, agentId);
    this.#o.events.append({
      type: "session.reassigned",
      agentId,
      sessionId,
      payload: { from: s.agentId, to: agentId },
    });
    return moved;
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
    options: SendOptions = {},
  ): Promise<{ runId: string }> {
    return this.#start(sessionId, text, options);
  }

  /**
   * Starts a run with no new message, so the agent reacts to what is already in the session
   * (the Overseer reviewing a worker's report).
   */
  async continueSession(
    sessionId: string,
    options: Pick<SendOptions, "depth" | "parentRunId" | "rootRunId"> & { trigger: RunTrigger },
  ): Promise<{ runId: string }> {
    return this.#start(sessionId, undefined, options);
  }

  async #start(
    sessionId: string,
    text: string | undefined,
    options: SendOptions,
  ): Promise<{ runId: string }> {
    const trigger = options.trigger ?? "user";
    // A handover asked for before this lands first: the run belongs to whoever it hands to.
    await this.#handovers.get(sessionId);
    const session = this.#session(sessionId);
    if (this.#o.killSwitch.engaged()) {
      throw new ConflictError("the kill switch is on: clear it to run anything again");
    }
    if (session.archivedAt) throw new ConflictError("this session is archived");
    if (this.hasActiveRun(sessionId)) {
      throw new ConflictError("a run is already running in this session");
    }
    const loaded = await loadStationDir(this.#o.home);
    // The owner now, not before the await: a handover may have landed meanwhile. No await
    // follows until the run is created, so the run and its model are that owner's.
    const current = this.#session(sessionId);
    const owner = current.agentId;
    const agentModel = loaded.agents.find((a) => a.id === owner)?.config.model ?? "unknown";
    // The crew member's model, then this conversation's choice, then this send's (a schedule's).
    const settings = resolveModelSettings(agentModel, current.modelSettings, options.modelSettings);
    const model = settings.model;
    const run = this.#o.sessions.createRun({
      sessionId,
      agentId: owner,
      trigger,
      model,
      provider: settings.provider,
      reasoning: settings.reasoning,
      ...(options.depth !== undefined ? { depth: options.depth } : {}),
      ...(options.dispatchId !== undefined ? { dispatchId: options.dispatchId } : {}),
      ...(options.parentRunId !== undefined ? { parentRunId: options.parentRunId } : {}),
      ...(options.rootRunId !== undefined ? { rootRunId: options.rootRunId } : {}),
    });
    if (text !== undefined)
      this.#o.sessions.appendMessage(sessionId, run.id, { role: "user", text });
    if (
      text !== undefined &&
      this.#o.titles &&
      current.title === DEFAULT_SESSION_TITLE &&
      this.#o.sessions.messages(sessionId).length === 1
    ) {
      // Runs beside the agent's run; a failure only means the message names the session.
      void this.#nameSession(current, text, run.id, model, settings.provider).catch(
        () => undefined,
      );
    }
    this.#o.events.append({
      type: "run.queued",
      agentId: owner,
      sessionId,
      runId: run.id,
      payload: {
        trigger,
        ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
        ...(run.rootRunId !== run.id ? { rootRunId: run.rootRunId } : {}),
      },
    });
    const controller = new AbortController();
    this.#active.set(run.id, controller);
    this.#done.set(run.id, this.#execute(run, controller));
    return { runId: run.id };
  }

  /** True while a run in this session is queued, running, or waiting for consent. */
  hasActiveRun(sessionId: string): boolean {
    return this.#o.sessions.runs(sessionId).some((r) => !isTerminal(r.state));
  }

  /**
   * Cancels a queued or running run, and every unfinished run it dispatched, level by level
   * (ADR-0024). A finished run is left as it is; its unfinished descendants are still cancelled.
   */
  async cancel(runId: string, by: "user" | "kill_switch" | "budget" = "user"): Promise<void> {
    if (!this.#o.sessions.getRun(runId)) throw new NotFoundError(`no run "${runId}"`);
    for (const r of [{ id: runId }, ...this.#o.sessions.descendants(runId)]) {
      this.#active.get(r.id)?.abort(new Cancelled(by));
    }
  }

  /**
   * Where a run sits in its dispatch tree (ADR-0024): the root, the agents of the run and every
   * run above it (nearest first), how many runs the tree has dispatched, and what it has spent.
   */
  tree(runId: string): {
    rootRunId: string;
    chain: string[];
    dispatchedRuns: number;
    spentUsd: number;
  } {
    const lineage = this.#o.sessions.lineage(runId);
    const rootRunId = lineage[0]?.rootRunId ?? runId;
    return {
      rootRunId,
      chain: lineage.map((r) => r.agentId),
      dispatchedRuns: this.#o.sessions.treeRuns(rootRunId).filter((r) => r.trigger === "dispatch")
        .length,
      spentUsd: this.#o.spend.forTree(rootRunId).costUsd,
    };
  }

  /** Stops every other unfinished run of a tree that reached its spend cap (ADR-0024). */
  #cancelTree(rootRunId: string, except: string): void {
    for (const r of this.#o.sessions.treeRuns(rootRunId)) {
      if (r.id !== except && !isTerminal(r.state)) {
        this.#active.get(r.id)?.abort(new Cancelled("budget"));
      }
    }
  }

  /** Approves or denies a pending consent; the paused run continues with the decision. */
  resolveConsent(consentId: string, decision: "approved" | "denied"): ConsentRecord {
    const current = this.#o.consents.get(consentId);
    if (!current) throw new NotFoundError(`no consent "${consentId}"`);
    const resume = this.#waiting.get(consentId);
    if (current.status === "pending" && !resume) {
      this.#o.consents.expireForRun(current.runId);
      throw new ConflictError("that request's run is no longer waiting");
    }
    const decided = this.#o.consents.decide(consentId, decision);
    resume?.(decision);
    return decided;
  }

  killSwitchEngaged(): boolean {
    return this.#o.killSwitch.engaged();
  }

  /**
   * The kill switch (brief §11): the state is persisted first, then every queued, running, or
   * waiting run is cancelled, and nothing new starts until it is cleared.
   */
  setKillSwitch(engaged: boolean): void {
    this.#o.killSwitch.set(engaged);
    this.#o.events.append({ type: "station.kill_switch", payload: { engaged } });
    if (engaged) {
      for (const c of this.#active.values()) c.abort(new Cancelled("kill_switch"));
      for (const c of this.#titleCalls) c.abort(new Cancelled("kill_switch"));
    }
  }

  /** Resolves with the run once it reaches a terminal state (tests, dispatch in Phase 5). */
  async settled(runId: string): Promise<RunRecord> {
    const pending = this.#done.get(runId);
    if (pending) return pending;
    const run = this.#o.sessions.getRun(runId);
    if (!run) throw new NotFoundError(`no run "${runId}"`);
    return run;
  }

  /**
   * Names a session from its first message (ADR-0014): one short call to the crew member's own
   * model, budget-checked and recorded as spend of the run it started. At most two run at once,
   * and engaging the kill switch aborts them. With the kill switch on,
   * a cap reached, or a model that fails, the message itself becomes the title. A session the
   * Commander renamed meanwhile keeps their name.
   */
  async #nameSession(
    session: SessionRecord,
    text: string,
    runId: string,
    modelId: string,
    provider: ProviderChoice,
  ): Promise<void> {
    const ids = { agentId: session.agentId, sessionId: session.id, runId };
    let title: string | undefined;
    const station = (await loadStationDir(this.#o.home)).station;
    if (station && !this.#o.killSwitch.engaged() && !this.#budgetCheck(station.budgets, ids)) {
      const controller = new AbortController();
      this.#titleCalls.add(controller);
      let holding = false;
      try {
        await this.#titleSlots.acquire(controller.signal);
        holding = true;
        // Spend may have moved while this call waited for a slot: check again before calling.
        if (this.#o.killSwitch.engaged() || this.#budgetCheck(station.budgets, ids)) {
          throw new Cancelled("budget");
        }
        const model = await this.#o.models(modelId, { provider });
        if (hasBudget(station.budgets) && unpricedDirect(model, modelId)) {
          throw new Cancelled("budget");
        }
        const prompt = titlePrompt(text);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(TITLE_TIMEOUT_MS)]);
        let reply = "";
        const result = streamText({
          model,
          instructions: prompt.instructions,
          messages: [{ role: "user", content: prompt.text }],
          maxOutputTokens: TITLE_MAX_TOKENS,
          maxRetries: 0,
          abortSignal: signal,
        });
        for await (const part of result.stream) {
          if (part.type === "text-delta") reply += part.text;
          else if (part.type === "finish-step") this.#recordSpend(ids, modelId, part);
          else if (part.type === "error") throw part.error;
        }
        // An aborted stream ends without an error; its partial text is no title.
        signal.throwIfAborted();
        title = cleanTitle(reply);
      } catch {
        title = undefined;
      } finally {
        if (holding) this.#titleSlots.release();
        this.#titleCalls.delete(controller);
      }
    }
    if (this.#o.sessions.getSession(session.id)?.title !== DEFAULT_SESSION_TITLE) return;
    const named = title ?? fallbackTitle(text);
    this.renameSession(session.id, this.#o.redact ? this.#o.redact(named) : named);
  }

  /**
   * Spend per model call: tokens, and the cost in USD. OpenRouter reports its cost; the Anthropic
   * API reports only tokens, so its cost is estimated at the model's list price (ADR-0015).
   */
  #recordSpend(
    ids: { agentId: string; sessionId: string; runId: string },
    modelId: string,
    part: {
      usage: {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        inputTokenDetails?: {
          noCacheTokens?: number | undefined;
          cacheReadTokens?: number | undefined;
          cacheWriteTokens?: number | undefined;
        };
      };
      providerMetadata?: Record<string, unknown> | undefined;
    },
  ): void {
    const reported = (
      part.providerMetadata?.openrouter as { usage?: { cost?: unknown } } | undefined
    )?.usage?.cost;
    const { usage } = part;
    const details = usage.inputTokenDetails;
    const cacheRead = details?.cacheReadTokens ?? 0;
    const cacheWrite = details?.cacheWriteTokens ?? 0;
    const estimated =
      part.providerMetadata?.anthropic !== undefined
        ? estimateCostUsd(modelId, {
            input:
              details?.noCacheTokens ??
              Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite),
            cacheRead,
            cacheWrite,
            output: usage.outputTokens ?? 0,
          })
        : undefined;
    const cost = typeof reported === "number" ? reported : estimated;
    this.#o.spend.record({
      ...ids,
      model: modelId,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      costUsd: cost ?? null,
      at: this.#now().toISOString(),
    });
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
      if (this.#o.killSwitch.engaged()) throw new Cancelled("kill_switch");
      const loaded = await loadStationDir(this.#o.home);
      const agent = loaded.agents.find((a) => a.id === run.agentId);
      sessions.transition(run.id, "start");
      events.append({
        type: "run.started",
        ...ids,
        payload: { model: run.model, provider: run.provider, reasoning: run.reasoning },
      });
      if (!agent || !loaded.station) throw new Error(`no agent "${run.agentId}"`);
      const station = loaded.station;
      const model = await this.#o.models(run.model, { provider: run.provider });
      // Fail closed: a budget cannot be enforced on calls whose cost is unknown.
      if (hasBudget(station.budgets) && unpricedDirect(model, run.model)) {
        throw new Error(
          `${run.model} has no known price on Anthropic, so the budgets cannot be enforced: pick a listed model, use OpenRouter, or clear the budgets`,
        );
      }

      const connectors = this.#o.connectors;
      // At the station's depth limit `dispatch` is not offered at all (ADR-0024).
      const base = resolveGrants(agent.config, station, connectors?.catalog() ?? {}, {
        depth: run.depth,
      });
      // Connector tools are implemented by calling through to the connector.
      const registry: Record<string, ToolImpl> = { ...this.#tools };
      for (const t of base) {
        if (t.source.kind !== "connector" || !connectors) continue;
        const { connectorId, tool: name } = t.source;
        const described = connectors.describe(connectorId, name);
        registry[t.name] = {
          description: described?.description ?? name,
          inputSchema: described?.inputSchema ?? { type: "object" },
          class: t.class,
          execute: (input, ctx) => connectors.call(connectorId, name, input, ctx.signal),
        };
      }
      // Skills (ADR-0023) are gated on the tools this run can actually call; skill_view joins
      // only when one is offered. Without skill_view the bodies go inline, so the prompt never
      // points at a tool the agent cannot call.
      const implemented = (t: EffectiveTool) => registry[t.name] !== undefined;
      const skills = this.#o.skills
        ? selectSkills({
            skills: this.#o.skills,
            overrides: station.skills,
            agentSkills: agent.config.skills,
            tools: base.filter(implemented),
          }).offered
        : [];
      const offered = withSkillTool(base, skills.length).filter(implemented);
      const skillIds = skills.map((s) => s.id);
      const promptSkills: PromptSkills = {
        entries: skills,
        mode: offered.some((t) => t.name === SKILL_VIEW_TOOL) ? "index" : "inline",
      };
      const tools: ToolSet = Object.fromEntries(
        offered.map((t) => [
          t.name,
          tool({
            description: registry[t.name]?.description ?? t.name,
            inputSchema: jsonSchema(registry[t.name]?.inputSchema ?? { type: "object" }),
          }),
        ]),
      ) as ToolSet;
      const context = findModel(run.model)?.contextTokens ?? DEFAULT_CONTEXT;
      const briefing = roleBriefing(agent.id, station, loaded.agents, { depth: run.depth });

      const maxSteps = this.#o.maxSteps ?? 12;
      for (let step = 1; step <= maxSteps; step++) {
        const blocked = this.#budgetCheck(station.budgets, ids, run.rootRunId);
        if (blocked) {
          sessions.transition(run.id, "block_budget");
          events.append({ type: "budget.blocked", ...ids, payload: { ...blocked } });
          // A tree that reached its cap stops everywhere, not only where the check ran.
          if (blocked.scope === "tree") this.#cancelTree(run.rootRunId, run.id);
          return sessions.getRun(run.id) as RunRecord;
        }
        for (const direction of this.#directions.get(run.id) ?? []) {
          sessions.appendMessage(run.sessionId, run.id, {
            role: "user",
            text: `[Direction from the Commander while you work] ${direction}`,
          });
        }
        this.#directions.delete(run.id);
        const history = sessions.messages(run.sessionId).map((m) => m.message);
        const prompt = assemblePrompt({
          documents: agent.documents,
          roleBriefing: briefing,
          skills: promptSkills,
          beliefs: this.#o.beliefs?.(agent.id) ?? [],
          history,
          budgetTokens: historyBudget(context),
        });
        const result = await this.#callWithRetry(ids, run.model, signal, () =>
          streamText({
            model,
            instructions: prompt.system,
            messages: toModelMessages(prompt.messages),
            ...(offered.length ? { tools } : {}),
            ...reasoningOptions(run.reasoning),
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
          events.append({ type: "run.completed", ...ids, payload: { trigger: run.trigger } });
          return sessions.getRun(run.id) as RunRecord;
        }
        for (const call of result.toolCalls) {
          signal.throwIfAborted();
          await this.#runTool(
            call,
            offered,
            registry,
            ids,
            agent.config,
            run.depth,
            signal,
            skillIds,
          );
        }
      }
      sessions.transition(run.id, "complete");
      events.append({
        type: "run.completed",
        ...ids,
        payload: { reason: "max_steps", trigger: run.trigger },
      });
      return sessions.getRun(run.id) as RunRecord;
    } catch (error) {
      const reason = signal.aborted ? signal.reason : error;
      this.#o.consents.expireForRun(run.id);
      // Already settled elsewhere (e.g. marked interrupted by a newer process): leave it as it is.
      const settled = sessions.getRun(run.id);
      if (settled && isTerminal(settled.state)) return settled;
      if (reason instanceof Cancelled) {
        sessions.transition(run.id, "cancel");
        events.append({ type: "run.cancelled", ...ids, payload: { by: reason.by } });
      } else {
        const described = describeError(error instanceof StreamBroken ? error.cause : error);
        const message = this.#o.redact ? this.#o.redact(described) : described;
        const current = sessions.getRun(run.id);
        if (current?.state === "queued") sessions.transition(run.id, "start");
        sessions.transition(run.id, "fail", { error: message });
        events.append({
          type: "run.failed",
          ...ids,
          payload: { error: message, trigger: run.trigger },
        });
      }
      return sessions.getRun(run.id) as RunRecord;
    } finally {
      if (holding) this.#slots.release();
      this.#active.delete(run.id);
      this.#directions.delete(run.id);
      const settled = sessions.getRun(run.id);
      if (settled) {
        for (const listener of this.#settledListeners) {
          // A listener's failure must not change how this run ended.
          Promise.resolve()
            .then(() => listener(settled))
            .catch(() => undefined);
        }
      }
    }
  }

  /**
   * Budgets before every model call (brief §15, ADR-0024). Returns the cap that blocks, if any;
   * sends each 80% warning once per run, tree, agent-day, or station-day. `rootRunId` adds the
   * run's tree; a session title call has none.
   */
  #budgetCheck(
    budgets: Budgets,
    ids: { agentId: string; sessionId: string; runId: string },
    rootRunId?: string,
  ): BudgetLine | undefined {
    const day = utcDay(this.#now());
    const check = checkBudget(budgets, {
      run: this.#o.spend.forRun(ids.runId).costUsd,
      ...(rootRunId ? { tree: this.#o.spend.forTree(rootRunId).costUsd } : {}),
      agentToday: this.#o.spend.agentDay(ids.agentId, day),
      stationToday: this.#o.spend.stationDay(day),
    });
    const keyOf = (scope: BudgetLine["scope"]) =>
      scope === "run"
        ? ids.runId
        : scope === "tree"
          ? rootRunId
          : scope === "agent"
            ? `${ids.agentId}:${day}`
            : day;
    for (const w of check.warnings) {
      const key = `${w.scope}:${keyOf(w.scope)}`;
      if (this.#warned.has(key)) continue;
      this.#warned.add(key);
      this.#o.events.append({ type: "budget.warning", ...ids, payload: { ...w } });
    }
    return check.blocked;
  }

  #now(): Date {
    return this.#o.now ? this.#o.now() : new Date();
  }

  /** One model call: streams deltas live; retries transient failures that happened before any text. */
  async #callWithRetry(
    ids: { agentId: string; sessionId: string; runId: string },
    modelId: string,
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
          } else if (part.type === "finish-step") {
            this.#recordSpend(ids, modelId, part);
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

  /**
   * Strictest approval wins (ADR-0024): a run works under *Ask first* if its own agent or any agent
   * above it in the dispatch chain is *Ask first*, read from their configs now. An agent that is
   * gone counts as *Ask first*.
   */
  async #approvalMode(runId: string, agent: AgentConfig): Promise<ApprovalMode> {
    const above = this.#o.sessions.lineage(runId).slice(1);
    if (above.length === 0) return agent.approvalMode;
    const loaded = await loadStationDir(this.#o.home);
    const modeOf = (id: string) =>
      loaded.agents.find((a) => a.id === id)?.config.approvalMode ?? "ask";
    return effectiveApprovalMode([agent.approvalMode, ...above.map((r) => modeOf(r.agentId))]);
  }

  /** Double enforcement: a call to anything not offered is rejected here and never executed. */
  async #runTool(
    call: ToolCallRecord,
    offered: readonly { name: string; class: ToolClass }[],
    registry: Readonly<Record<string, ToolImpl>>,
    ids: { agentId: string; sessionId: string; runId: string },
    agent: AgentConfig,
    depth: number,
    signal: AbortSignal,
    skills: readonly string[],
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
    if (needsConsent(grant.class, await this.#approvalMode(ids.runId, agent))) {
      const decision = await this.#askConsent(call, ids, signal);
      if (decision === "denied") {
        const summary = "the Commander denied this call";
        events.append({
          type: "run.tool_result",
          ...ids,
          payload: { toolCallId: call.id, tool: call.name, ok: false, summary },
        });
        sessions.appendMessage(
          ids.sessionId,
          ids.runId,
          toolMessage(`${summary}. Do not retry it; ask what they want instead.`, true),
        );
        return;
      }
    }
    try {
      const output = await impl.execute(call.input, { ...ids, depth, signal, skills });
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

  /**
   * Pauses the run until the Commander decides (brief §6). There is no timeout: a request is only
   * ever approved, denied, or expired by a cancel or a restart.
   */
  async #askConsent(
    call: ToolCallRecord,
    ids: { agentId: string; sessionId: string; runId: string },
    signal: AbortSignal,
  ): Promise<"approved" | "denied"> {
    const { consents, sessions, events } = this.#o;
    const consent = consents.create({
      ...ids,
      toolCallId: call.id,
      tool: call.name,
      input: call.input,
    });
    sessions.transition(ids.runId, "await_consent");
    events.append({
      type: "consent.requested",
      ...ids,
      payload: { consentId: consent.id, toolCallId: call.id, tool: call.name, input: call.input },
    });
    events.append({ type: "run.awaiting_consent", ...ids, payload: { consentId: consent.id } });
    const decision = await new Promise<"approved" | "denied">((resolve, reject) => {
      const abort = () => {
        this.#waiting.delete(consent.id);
        reject(signal.reason);
      };
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      this.#waiting.set(consent.id, (d) => {
        signal.removeEventListener("abort", abort);
        this.#waiting.delete(consent.id);
        resolve(d);
      });
    });
    sessions.transition(ids.runId, "resolve_consent");
    events.append({
      type: "consent.resolved",
      ...ids,
      payload: { consentId: consent.id, decision },
    });
    return decision;
  }
}
