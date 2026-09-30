/**
 * @darthsaul/outerworld-ai-core
 *
 * Headless: zero React, zero DOM, zero filesystem. The station runtime's schemas (station.json,
 * agent.json, runtime events) and pure policy live here; runtime, daemon, SPA, and ui key off them.
 * The milestone 1 map model (Station, StationState) stays until Phase 9 adapts the map.
 * Contract: docs/SCHEMA.md. Versioning: docs/decisions/0009-schema-versioning.md.
 */

// Sessions, runs, and settings HTTP contract (Phase 3)
export {
  ApiKeyInput,
  ConsentDecisionInput,
  CreateSessionInput,
  KillSwitchInput,
  MAX_MESSAGE_CHARS,
  SendMessageInput,
  type SettingsView,
  type SpendView,
  UpdateSessionInput,
} from "./api/comms-api.js";
// Crew and room HTTP contract (Phase 2)
export {
  AGENT_DOCUMENTS,
  AgentDocumentName,
  type AgentView,
  CreateAgentInput,
  CreateRoomInput,
  DocumentInput,
  MAX_DOCUMENT_BYTES,
  type StationView,
  slugify,
  UpdateAgentInput,
  UpdateRoomInput,
} from "./api/crew-api.js";
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
  DEFAULT_MODEL,
  isSupportedModel,
  SUPPORTED_MODELS,
  type SupportedModel,
} from "./config/models.js";
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
// Budgets and consent (brief §6, §15)
export {
  BUDGET_WARNING_SHARE,
  type BudgetCheck,
  type BudgetLine,
  type BudgetScope,
  checkBudget,
  needsConsent,
  type SpentSoFar,
  utcDay,
} from "./policy/budget.js";
// Connector tool classification and presets (ADR-0012)
export {
  classifyConnectorTool,
  KNOWN_TOOL_CLASSES,
  NOTION_PRESET,
  type ToolHints,
} from "./policy/connector-tools.js";
// Dispatch (brief §7)
export { checkDispatch, type DispatchCheck, dispatchTargets } from "./policy/dispatch.js";
// Effective grants (brief §6)
export {
  BUILTIN_TOOLS,
  type ConnectorToolCatalog,
  connectorToolName,
  type EffectiveTool,
  resolveGrants,
  type ToolClass,
  type ToolSource,
  type ToolSpec,
} from "./policy/grants.js";
// Rig
export {
  type DerivedRig,
  deriveRig,
  overseerRig,
  type RigAccessory,
  type RigShoulder,
} from "./rig.js";
// Runs: lifecycle and prompt assembly (brief §8)
export {
  type AssembledPrompt,
  assemblePrompt,
  ChatMessage,
  estimateTokens,
  historyBudget,
  type PromptInput,
  roleBriefing,
  ToolCallRecord,
  UNTRUSTED_DATA_NOTICE,
} from "./run/prompt.js";
export {
  isTerminal,
  nextRunState,
  RUN_EVENTS,
  RUN_STATES,
  type RunEvent,
  type RunState,
} from "./run/run-state.js";
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
