import { type Notification, term, termWith } from "@darthsaul/outerworld-ai-core";
import { ROUTES } from "../lib/routes.js";

const reasonWords = (n: Notification) =>
  n.kind === "schedule_missed" && n.reason
    ? term(`schedule.missed.${n.reason}` as "schedule.missed.down")
    : (n.reason ?? "");

const session = (n: Notification) =>
  n.agentId && n.sessionId
    ? `/comms?agent=${encodeURIComponent(n.agentId)}&open=${encodeURIComponent(n.sessionId)}`
    : undefined;

const BUDGET_SCOPES = ["run", "tree", "agent", "station"] as const;

/** A notification's subject in words: a connector's name, or a budget's scope (ADR-0024). */
const subjectWords = (n: Notification, connectorName: (id: string) => string) => {
  if (n.kind === "connector" && n.subject) return connectorName(n.subject);
  const scope = BUDGET_SCOPES.find((s) => s === n.subject);
  if ((n.kind === "budget_warning" || n.kind === "budget_blocked") && scope) {
    return term(`budgets.scope.${scope}`);
  }
  return n.subject ?? "";
};

/** Where to look for each kind of notification, if anywhere. */
export function linkFor(n: Notification): string | undefined {
  switch (n.kind) {
    case "memory":
      return n.agentId ? `/memory?agent=${encodeURIComponent(n.agentId)}` : undefined;
    case "schedule_missed":
      return n.agentId ? `/crew/${encodeURIComponent(n.agentId)}` : undefined;
    case "budget_warning":
    case "budget_blocked":
      return ROUTES.budgets;
    case "connector":
      return ROUTES.installed;
    case "kill_switch":
    case "kill_switch_cleared":
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
    subject: subjectWords(n, connectorName),
    detail: n.detail ?? n.reason ?? "",
    reason: reasonWords(n),
  });
}
