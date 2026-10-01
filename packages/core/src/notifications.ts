import type { EventType, RuntimeEvent } from "./runtime-events.js";

/**
 * Notifications (brief §10) are a filtered projection of the event log: what the Commander should
 * act on (`action`), what went wrong (`alert`), and results worth knowing (`info`). Pure; the
 * words on screen come from the glossary (`notification.<kind>`), so this carries only ids and
 * the details a line needs.
 */
export type NotificationKind =
  | "consent"
  | "memory"
  | "schedule_done"
  | "schedule_missed"
  | "run_failed"
  | "run_interrupted"
  | "max_steps"
  | "dispatch_done"
  | "dispatch_failed"
  | "budget_warning"
  | "budget_blocked"
  | "connector"
  | "kill_switch";

export type NotificationLevel = "action" | "alert" | "info";

export interface Notification {
  readonly seq: number;
  readonly at: string;
  readonly kind: NotificationKind;
  readonly level: NotificationLevel;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly runId?: string;
  /** What it is about: a tool, a schedule id, a connector id, or a budget scope. */
  readonly subject?: string;
  /** A schedule.missed reason, or a connector's status. */
  readonly reason?: string;
  /** Free text: an error, a summary, a memory, a spend figure. */
  readonly detail?: string;
}

/** Every event type `notificationFor` may turn into a notification. */
export const NOTIFICATION_EVENT_TYPES = [
  "consent.requested",
  "memory.proposed",
  "run.completed",
  "run.failed",
  "run.interrupted",
  "dispatch.completed",
  "dispatch.failed",
  "schedule.missed",
  "budget.warning",
  "budget.blocked",
  "connector.status",
  "station.kill_switch",
] as const satisfies readonly EventType[];

const usd = (n: number) => `$${n.toFixed(2)}`;

export function notificationFor(event: RuntimeEvent): Notification | undefined {
  const base = {
    seq: event.seq,
    at: event.at,
    ...(event.agentId !== undefined ? { agentId: event.agentId } : {}),
    ...(event.sessionId !== undefined ? { sessionId: event.sessionId } : {}),
    ...(event.runId !== undefined ? { runId: event.runId } : {}),
  };
  const n = (kind: NotificationKind, level: NotificationLevel, extra: Partial<Notification> = {}) =>
    ({ ...base, kind, level, ...extra }) as Notification;
  switch (event.type) {
    case "consent.requested":
      return n("consent", "action", { subject: event.payload.tool });
    case "memory.proposed":
      return n("memory", "action", { detail: event.payload.text });
    case "run.completed":
      if (event.payload.reason === "max_steps") return n("max_steps", "alert");
      return event.payload.trigger === "schedule" ? n("schedule_done", "info") : undefined;
    case "run.failed":
      return n("run_failed", "alert", { detail: event.payload.error });
    case "run.interrupted":
      return n("run_interrupted", "alert");
    case "dispatch.completed":
      return n("dispatch_done", "info", { detail: event.payload.summary });
    case "dispatch.failed":
      return n("dispatch_failed", "alert", { detail: event.payload.error });
    case "schedule.missed":
      return n("schedule_missed", "alert", {
        subject: event.payload.scheduleId,
        ...(event.payload.reason ? { reason: event.payload.reason } : {}),
        ...(event.payload.detail ? { detail: event.payload.detail } : {}),
      });
    case "budget.warning":
    case "budget.blocked":
      return n(
        event.type === "budget.warning" ? "budget_warning" : "budget_blocked",
        event.type === "budget.warning" ? "info" : "alert",
        {
          subject: event.payload.scope,
          detail: `${usd(event.payload.spentUsd)} of ${usd(event.payload.limitUsd)}`,
        },
      );
    case "connector.status":
      if (event.payload.status !== "error" && event.payload.status !== "needs_auth")
        return undefined;
      return n("connector", "alert", {
        subject: event.payload.connectorId,
        reason: event.payload.status,
        ...(event.payload.detail ? { detail: event.payload.detail } : {}),
      });
    case "station.kill_switch":
      return event.payload.engaged ? n("kill_switch", "alert") : undefined;
    default:
      return undefined;
  }
}
