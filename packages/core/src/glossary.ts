/**
 * The only place themed display strings live. Code uses neutral names (ADR-0002); the ui asks
 * `term(key)` for what to show. Naming Set D from docs/design/naming-workshop.dc.html.
 * Health and run words, read/write, and every `.plain` entry stay plain by design (spec §09).
 */
export const glossary = {
  station: "the Reach",
  "station.plain": "station",
  team: "Outpost",
  teams: "Outposts",
  "team.plain": "team",
  "team.verb": "Found",
  scope: "Standing orders",
  "scope.plain": "permission scope",
  "scope.verb": "Edit standing orders",
  grant: "Clearance",
  grants: "Clearances",
  "grant.plain": "grant",
  "grant.verb": "Clear",
  "grant.revoke": "Revoke",
  "grant.read": "read",
  "grant.write": "write",
  handoff: "Relay",
  handoffs: "Relays",
  "handoff.plain": "handoff",
  "handoff.verb": "Open relay",
  "handoff.close": "Close",
  agent: "Hand",
  agents: "Hands",
  "agent.plain": "agent",
  "agent.verb": "Enlist",
  persona: "Commission",
  "persona.plain": "persona",
  ledger: "Manifest",
  "ledger.plain": "ledger",
  run: "Sortie",
  runs: "Sorties",
  "run.plain": "run",
  "run.last": "last sortie",
  overseer: "the Assayer",
  "overseer.plain": "overseer",
  "overseer.role": "Assayer",
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
  "empty.handoffs.title": "No relays",
  "empty.handoffs.body":
    "Outposts can't read each other's manifests until a relay is opened between them.",
  "empty.runs.title": "No sorties yet",
  "empty.runs.body": "The first sortie hasn't run. The manifest will fill in after it does.",
  "empty.ledger.title": "No manifest yet",
  "empty.ledger.body": "First sortie hasn't run.",
  "proof.asOf": "as of",
  "report.tab": "Report",
  "report.lastRun": "Last sortie",
  "report.ledger": "Manifest",
  "report.runs": "Sorties",
  "report.handoffs": "Relays",
  "report.agents": "Hands",
} as const;

export type GlossaryKey = keyof typeof glossary;
export const GLOSSARY_KEYS = Object.keys(glossary) as GlossaryKey[];

/** Display string for a glossary key. */
export function term(key: GlossaryKey): string {
  return glossary[key];
}
