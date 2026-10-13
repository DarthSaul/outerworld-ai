import { type Notification, term, termWith } from "@darthsaul/outerworld-ai-core";

const reasonWords = (n: Notification) =>
  n.kind === "schedule_missed" && n.reason
    ? term(`schedule.missed.${n.reason}` as "schedule.missed.down")
    : (n.reason ?? "");

const session = (n: Notification) =>
  n.agentId && n.sessionId
    ? `/comms?agent=${encodeURIComponent(n.agentId)}&open=${encodeURIComponent(n.sessionId)}`
    : undefined;

/** Where to look for each kind of notification, if anywhere. */
export function linkFor(n: Notification): string | undefined {
  switch (n.kind) {
    case "memory":
      return n.agentId ? `/memory?agent=${encodeURIComponent(n.agentId)}` : undefined;
    case "schedule_missed":
      return n.agentId ? `/crew/${encodeURIComponent(n.agentId)}` : undefined;
    case "budget_warning":
    case "budget_blocked":
      return "/settings";
    case "connector":
      return "/connectors";
    case "kill_switch":
      return undefined;
    default:
      return session(n);
  }
}

/** What a notification says, in the glossary's words. Shared by Notifications and the radio. */
export function notificationText(
  n: Notification,
  nameOf: (agentId: string) => string,
  connectorName: (id: string) => string,
): string {
  return termWith(`notification.${n.kind}`, {
    agent: n.agentId ? nameOf(n.agentId) : "",
    subject: n.kind === "connector" && n.subject ? connectorName(n.subject) : (n.subject ?? ""),
    detail: n.detail ?? n.reason ?? "",
    reason: reasonWords(n),
  });
}
