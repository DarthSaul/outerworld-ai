import { z } from "zod";
import { Id, type Result, Timestamp, zodIssues } from "./schema/common.js";

/**
 * The runtime's append-only event log (brief §10): the source of truth for the live UI,
 * notifications, and restart recovery. Every event has a monotonically increasing `seq` assigned
 * by the store, a type, a time, the ids it is about, and a payload. Payloads keep unknown fields
 * so a newer daemon's events still parse in an older SPA. Events never carry a secret.
 */

const Ref = z.string().min(1);

const envelope = {
  /** For an ephemeral event, the seq of the last stored event; it has no seq of its own. */
  seq: z.number().int().nonnegative(),
  /** Streamed to live subscribers only, never stored (token deltas, tasks/todo.md D18). */
  ephemeral: z.literal(true).optional(),
  at: Timestamp,
  agentId: Id.optional(),
  sessionId: Ref.optional(),
  runId: Ref.optional(),
};

/** Which ids an event family must carry. */
const about = {
  nothing: {},
  agent: { agentId: Id },
  session: { agentId: Id, sessionId: Ref },
  run: { agentId: Id, sessionId: Ref, runId: Ref },
};

const event = <T extends string, C extends z.ZodRawShape, P extends z.ZodRawShape>(
  type: T,
  context: C,
  payload: P,
) =>
  z
    .object(envelope)
    .extend(context)
    .extend({ type: z.literal(type), payload: z.looseObject(payload) });

const ToolClass = z.enum(["read", "write"]);
const BudgetScope = z.enum(["run", "agent", "station"]);
const budget = { scope: BudgetScope, spentUsd: z.number(), limitUsd: z.number() };

export const RuntimeEvent = z.discriminatedUnion("type", [
  event("station.started", about.nothing, {}),
  event("station.stopped", about.nothing, { reason: z.enum(["shutdown", "signal", "error"]) }),
  event("station.updated", about.nothing, {}),
  event("station.kill_switch", about.nothing, { engaged: z.boolean() }),

  event("agent.updated", about.agent, { change: z.enum(["created", "updated", "deleted"]) }),

  event("session.created", about.session, { title: z.string() }),
  event("session.renamed", about.session, { title: z.string() }),
  event("session.archived", about.session, {}),

  event("run.queued", about.run, {
    trigger: z.enum(["user", "dispatch", "schedule", "review"]),
  }),
  event("run.started", about.run, { model: z.string().min(1) }),
  event("run.delta", about.run, { text: z.string() }),
  event("run.tool_call", about.run, {
    toolCallId: Ref,
    tool: z.string().min(1),
    input: z.unknown(),
    class: ToolClass,
    /** Present when the policy layer refused the call; the reason goes back to the model. */
    rejected: z.string().optional(),
  }),
  event("run.tool_result", about.run, {
    toolCallId: Ref,
    tool: z.string().min(1),
    ok: z.boolean(),
    summary: z.string().optional(),
  }),
  event("run.awaiting_consent", about.run, { consentId: Ref }),
  event("run.retrying", about.run, {
    attempt: z.number().int().positive(),
    delayMs: z.number().nonnegative(),
    status: z.number().int().optional(),
  }),
  event("run.completed", about.run, {
    /** Present when the run stopped for a reason other than a final answer. */
    reason: z.enum(["max_steps"]).optional(),
  }),
  event("run.failed", about.run, { error: z.string() }),
  event("run.cancelled", about.run, { by: z.enum(["user", "kill_switch", "budget"]) }),
  event("run.interrupted", about.run, {}),

  event("dispatch.started", about.run, { dispatchId: Ref, to: Id, task: z.string() }),
  event("dispatch.completed", about.run, { dispatchId: Ref, summary: z.string() }),
  event("dispatch.failed", about.run, { dispatchId: Ref, error: z.string() }),
  event("dispatch.cancelled", about.run, { dispatchId: Ref }),

  event("consent.requested", about.run, {
    consentId: Ref,
    toolCallId: Ref,
    tool: z.string().min(1),
    input: z.unknown(),
  }),
  event("consent.resolved", about.run, {
    consentId: Ref,
    decision: z.enum(["approved", "denied"]),
  }),

  event("memory.proposed", about.agent, {
    memoryId: Ref,
    text: z.string().min(1),
    scope: z.enum(["agent", "station"]),
  }),
  event("memory.approved", about.agent, { memoryId: Ref }),
  event("memory.rejected", about.agent, { memoryId: Ref }),

  event("schedule.fired", about.agent, { scheduleId: Id, scheduledFor: Timestamp }),
  event("schedule.missed", about.agent, { scheduleId: Id, scheduledFor: Timestamp }),

  event("connector.status", about.nothing, {
    connectorId: Id,
    status: z.enum(["connected", "disconnected", "needs_auth", "error"]),
    detail: z.string().optional(),
  }),

  event("budget.warning", about.nothing, budget),
  event("budget.blocked", about.nothing, budget),
]);

export type RuntimeEvent = z.infer<typeof RuntimeEvent>;
export type EventType = RuntimeEvent["type"];

/** What a producer hands the event store; the store assigns `seq` and `at`. */
export type NewRuntimeEvent = RuntimeEvent extends infer E
  ? E extends RuntimeEvent
    ? Omit<E, "seq" | "at">
    : never
  : never;

/** The event with that type, for narrowing handlers. */
export type EventOf<T extends EventType> = Extract<RuntimeEvent, { type: T }>;

export const EVENT_TYPES: readonly EventType[] = RuntimeEvent.options.map(
  (o) => o.shape.type.value,
);

/** Parses one event (from the log or the SSE stream). Never throws. */
export function parseRuntimeEvent(input: unknown): Result<RuntimeEvent> {
  const parsed = RuntimeEvent.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data, issues: [] }
    : { ok: false, issues: zodIssues(parsed.error) };
}
