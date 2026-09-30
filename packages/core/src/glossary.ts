/**
 * The only place themed display strings live. Code uses neutral names (ADR-0002); the ui asks
 * `term(key)` for what to show. Vocabulary from the station runtime brief §4 (ADR-0010): keys are
 * the neutral code identifiers, values are what the Commander reads. These words are another
 * product's vocabulary; revisit before a public release.
 * Health and run words, read/write, and every `.plain` entry stay plain.
 */
export const glossary = {
  station: "Station",
  "station.plain": "station",
  user: "Commander",
  "user.plain": "you",
  room: "Room",
  rooms: "Rooms",
  "room.plain": "team",
  "room.verb": "Add room",
  agent: "Crew member",
  agents: "Crew",
  "agent.plain": "agent",
  "agent.verb": "Add crew member",
  overseer: "the Overseer",
  "overseer.plain": "overseer",
  "overseer.role": "Overseer",
  lane: "Hallway",
  lanes: "Hallways",
  "lane.plain": "handoff lane",
  "lane.verb": "Open hallway",
  "lane.close": "Close",
  grant: "Prop",
  grants: "Props",
  "grant.plain": "capability grant",
  "grant.verb": "Place prop",
  "grant.revoke": "Remove",
  "grant.read": "read",
  "grant.write": "write",
  connector: "Connector",
  connectors: "Connectors",
  "connector.plain": "MCP server",
  comms: "COMMS",
  "comms.plain": "chat",
  session: "Session",
  sessions: "Sessions",
  run: "Run",
  runs: "Runs",
  "run.plain": "run",
  "run.last": "last run",
  dispatch: "Dispatch",
  "dispatch.plain": "delegated task",
  approvalMode: "Approval mode",
  "approvalMode.ask": "Ask first",
  "approvalMode.full": "Full power",
  memory: "Memory",
  "memory.beliefs": "Stored beliefs",
  "memory.proposals": "Awaiting your decision",
  notifications: "Notifications",
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
  "empty.lanes.title": "No hallways",
  "empty.lanes.body": "Rooms can't hand work to each other until a hallway is opened between them.",
  "empty.runs.title": "No runs yet",
  "empty.runs.body": "Nothing has run here yet.",
  "proof.asOf": "as of",
  "report.tab": "Report",
  "report.lastRun": "Last run",
  "report.runs": "Runs",
  "report.lanes": "Hallways",
  "report.agents": "Crew",
  // Milestone 1 (Routines ledger) terms, plain until their views are removed (ADR-0010, Phase 1).
  ledger: "Ledger",
  "ledger.plain": "ledger",
  "system.report": "Digest",
  "system.report.plain": "digest",
  "report.ledger": "Ledger",
  "empty.ledger.title": "No ledger yet",
  "empty.ledger.body": "Nothing has run here yet.",
} as const;

export type GlossaryKey = keyof typeof glossary;
export const GLOSSARY_KEYS = Object.keys(glossary) as GlossaryKey[];

/** Display string for a glossary key. */
export function term(key: GlossaryKey): string {
  return glossary[key];
}
