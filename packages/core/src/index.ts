/**
 * @darthsaul/outerworld-ai-core
 *
 * Headless: zero React, zero DOM, zero filesystem. The station runtime's schemas (station.json,
 * agent.json, runtime events) and pure policy live here; runtime, daemon, SPA, and ui key off them.
 * The milestone 1 map model (Station, StationState) stays until Phase 9 adapts the map.
 * Contract: docs/SCHEMA.md. Versioning: docs/decisions/0009-schema-versioning.md.
 */

// Station runtime config (station.json, agent.json) — ADR-0010
export {
  AgentConfig,
  AgentRole,
  ApprovalMode,
  agentConfigIssues,
  parseAgentConfig,
  Schedule as AgentSchedule,
} from "./config/agent-config.js";
export {
  Budgets,
  Connector,
  ConnectorTransport,
  DispatchPolicy,
  Lane,
  Prop,
  PropKind,
  parseStationConfig,
  Room,
  StationConfig,
  stationConfigIssues,
} from "./config/station-config.js";
export { type CrewMember, stationCrewIssues } from "./config/station-crew.js";
// Milestone 1 map model: the ui map renders it until Phase 9 adapts it to rooms and crew.
// Events
export {
  applyEvent,
  bindReducer,
  emptyState,
  type StationEvent,
} from "./events.js";
// Glossary
export { GLOSSARY_KEYS, type GlossaryKey, glossary, term } from "./glossary.js";
export { deriveHealth, type HealthInputs } from "./health.js";
// Layout
export {
  type Box,
  type HandoffGeometry,
  handoffGeometry,
  LAYOUT_SIZE,
  type Layout,
  layoutStation,
  overseerLinkGeometry,
  RINGS_MAX,
  type TeamBox,
} from "./layout.js";
// Ledger
export {
  DEGRADED_AFTER_MS,
  type LedgerFiles,
  type ParseLedgerOptions,
  parseLedger,
  parseLedgerMarkdown,
} from "./ledger/parse.js";
// Rig
export {
  type DerivedRig,
  deriveRig,
  overseerRig,
  type RigAccessory,
  type RigShoulder,
} from "./rig.js";
// Runtime event log (brief §10)
export {
  EVENT_TYPES,
  type EventOf,
  type EventType,
  type NewRuntimeEvent,
  parseRuntimeEvent,
  RuntimeEvent,
} from "./runtime-events.js";
// Schema
export { type Issue, type Result, SCHEMA_VERSION, versionIssues } from "./schema/common.js";
export { JSON_SCHEMAS, type JsonSchemaName, jsonSchemaFor } from "./schema/jsonschema.js";
export {
  AgentStateEntry,
  HandoffState,
  Health,
  LedgerSections,
  OverseerStateEntry,
  parseStationState,
  RunSummary,
  StationState,
  TeamState,
} from "./schema/state.js";
export {
  Agent,
  EmblemMark,
  Grant,
  GrantKind,
  GrantMode,
  Handoff,
  MIN_SCHEDULE_MINUTES,
  Overseer,
  Persona,
  parseStation,
  Rig,
  RigHead,
  RigTrace,
  Schedule,
  Station,
  stationIssues,
  Team,
  TeamCategory,
} from "./schema/station.js";
export {
  AgentRunState,
  AgentState,
  GrantUse,
  LedgerChange,
  OverseerState,
  OverseerStatus,
  parseOverseerStatus,
  parseRunRecord,
  parseTeamStatus,
  RunOutcome,
  RunRecord,
  runRecordIssues,
  TeamStatus,
} from "./schema/status.js";
// Server-sent events over fetch (the SPA sends the bearer token, so it cannot use EventSource)
export { createSseParser, type SseMessage, type SseParser } from "./sse.js";
