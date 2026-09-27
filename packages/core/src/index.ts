/**
 * @darthsaul/outerworld-ai-core
 *
 * Headless: zero React, zero DOM, zero filesystem. The Station and StationState schemas
 * defined here are the product's real API; ui and generator both key off them.
 * Contract: docs/SCHEMA.md. Versioning: docs/decisions/0009-schema-versioning.md.
 */

// Events
export {
  applyEvent,
  bindReducer,
  emptyState,
  RECENT_RUNS_MAX,
  type StationEvent,
} from "./events.js";
// Glossary
export { GLOSSARY_KEYS, type GlossaryKey, glossary, term } from "./glossary.js";
// Layout
export {
  type Box,
  type HandoffGeometry,
  handoffGeometry,
  LAYOUT_SIZE,
  type Layout,
  layoutStation,
  RADIAL_MAX,
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
  RECENT_RUNS,
} from "./ledger/parse.js";
// Rig
export {
  type DerivedRig,
  deriveRig,
  overseerRig,
  type RigAccessory,
  type RigShoulder,
} from "./rig.js";
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

/** Returns true when a document's `schemaVersion` can be read by this build without migration. */
export function isSupportedSchemaVersion(version: unknown): boolean {
  return version === 1;
}
