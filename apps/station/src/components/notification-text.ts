import { type Notification, term, termWith } from "@darthsaul/outerworld-ai-core";

const reasonWords = (n: Notification) =>
  n.kind === "schedule_missed" && n.reason
    ? term(`schedule.missed.${n.reason}` as "schedule.missed.down")
    : (n.reason ?? "");

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
