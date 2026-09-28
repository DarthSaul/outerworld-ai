/**
 * The only place themed display strings live. Code uses neutral names (ADR-0002); the ui asks
 * `term(key)` for what to show. Simplified vocabulary chosen by the owner on 2026-09-27
 * (reconciliation A20). Health and run words, read/write, and every `.plain` entry stay plain.
 * Note: "Station" on screen is the team; in code `station` is the whole map document.
 */
export const glossary = {
  station: "the Reach",
  "station.plain": "station",
  team: "Station",
  teams: "Stations",
  "team.plain": "team",
  "team.verb": "Add station",
  scope: "Standing orders",
  "scope.plain": "permission scope",
  "scope.verb": "Edit standing orders",
  grant: "Tool",
  grants: "Tools",
  "grant.plain": "grant",
  "grant.verb": "Grant",
  "grant.revoke": "Revoke",
  "grant.read": "read",
  "grant.write": "write",
  handoff: "Handoff",
  handoffs: "Handoffs",
  "handoff.plain": "handoff",
  "handoff.verb": "Open handoff",
  "handoff.close": "Close",
  agent: "Agent",
  agents: "Agents",
  "agent.plain": "agent",
  "agent.verb": "Add agent",
  persona: "Persona",
  "persona.plain": "persona",
  ledger: "Manifest",
  "ledger.plain": "ledger",
  run: "Routine run",
  runs: "Routine runs",
  "run.plain": "run",
  "run.last": "last routine run",
  overseer: "the Overseer",
  "overseer.plain": "overseer",
  "overseer.role": "Overseer",
  emblem: "World",
  "emblem.plain": "emblem",
  "health.ok": "healthy",
  "health.attention": "needs attention",
  "health.stalled": "stalled",
  "run.idle": "idle",
  "run.working": "working",
  "run.done": "done",
  "run.failed": "failed",
  "overseer.idle": "idle",
  "overseer.reconciling": "reconciling",
  "overseer.reported": "reported",
  "overseer.attention": "needs attention",
  "empty.handoffs.title": "No handoffs",
  "empty.handoffs.body":
    "Stations can't read each other's manifests until a handoff is opened between them.",
  "empty.runs.title": "No routine runs yet",
  "empty.runs.body":
    "The first routine run hasn't happened. The manifest will fill in after it does.",
  "empty.ledger.title": "No manifest yet",
  "empty.ledger.body": "The first routine run hasn't happened.",
  "proof.asOf": "as of",
  "report.tab": "Report",
  "report.lastRun": "Last routine run",
  "report.ledger": "Manifest",
  "report.runs": "Routine runs",
  "report.handoffs": "Handoffs",
  "report.agents": "Agents",
} as const;

export type GlossaryKey = keyof typeof glossary;
export const GLOSSARY_KEYS = Object.keys(glossary) as GlossaryKey[];

/** Display string for a glossary key. */
export function term(key: GlossaryKey): string {
  return glossary[key];
}
