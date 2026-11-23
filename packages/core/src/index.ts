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
  AddConnectorInput,
  ApiKeyInput,
  ApproveMemoryInput,
  ConnectorClientInput,
  ConsentDecisionInput,
  CreateSessionInput,
  DisconnectInput,
  EditMemoryInput,
  type HealthView,
  KillSwitchInput,
  MAX_MESSAGE_CHARS,
  MarkReadInput,
  SendMessageInput,
  type SettingsView,
  type SpendView,
  UpdateConnectorInput,
  UpdateSessionInput,
} from "./api/comms-api.js";
// Crew and room HTTP contract (Phase 2)
export {
  AGENT_DOCUMENTS,
  AgentDocumentName,
  type AgentView,
  CREW_TEMPLATES,
  CreateAgentInput,
  CreateLaneInput,
  CreateRoomInput,
  CreateScheduleInput,
  CrewTemplate,
  DocumentInput,
  MAX_DOCUMENT_BYTES,
  OnboardInput,
  OVERSEER_TONES,
  OverseerTone,
  type StationFile,
  type StationView,
  slugify,
  TemplateInput,
  UpdateAgentInput,
  UpdateBudgetsInput,
  UpdateDispatchInput,
  UpdateRoomInput,
  UpdateScheduleInput,
} from "./api/crew-api.js";
// Skills HTTP contract (ADR-0023)
export {
  type AgentSkillsView,
  type SkillListItem,
  type SkillRef,
  UpdateSkillInput,
} from "./api/skills-api.js";
// Pixel characters an agent can appear as (ADR-0013)
export {
  ART_BOX,
  ART_CHARACTERS,
  type ArtCharacter,
  type Cell,
  CHARACTER_COUNT,
  CHARACTERS,
  type Character,
  type CharacterGrid,
  type CharacterSpec,
  characterById,
  characterGrid,
  DRAWN_CHARACTERS,
  gridRuns,
  type HairStyle,
  isArtCharacter,
  lookFor,
  OUTLINE,
  type PixelRun,
  SPRITE_H,
  SPRITE_W,
  shade,
} from "./characters.js";
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
  anthropicModelId,
  DEFAULT_MODEL,
  estimateCostUsd,
  findModel,
  isSupportedModel,
  type ModelPricing,
  type ModelProvider,
  type ModelRoute,
  ModelSettings,
  ProviderChoice,
  type ProviderKeys,
  ReasoningLevel,
  type ResolvedModelSettings,
  resolveModelSettings,
  routeModel,
  SUPPORTED_MODELS,
  type SupportedModel,
  type TokenUsage,
} from "./config/models.js";
export {
  BUILTIN_SERVICES,
  Budgets,
  type BuiltinService,
  Connector,
  ConnectorTransport,
  DEFAULT_BUDGETS,
  DEFAULT_MAX_RUNS_PER_TREE,
  DEFAULT_PER_TREE_USD,
  DispatchPolicy,
  Lane,
  MAX_DISPATCH_DEPTH,
  MAX_RUNS_PER_TREE_LIMIT,
  Prop,
  PropKind,
  parseStationConfig,
  Room,
  SkillOverrides,
  type SkillOverridesConfig,
  StationConfig,
  stationConfigIssues,
} from "./config/station-config.js";
export { type CrewMember, stationCrewIssues } from "./config/station-crew.js";
// Station dashboard: layout, hallway routes, status words, chatter (ADR-0013)
export { type ChatterLine, type ChatterSnapshot, chatterLines } from "./dashboard/chatter.js";
export {
  BRIDGE_RECT,
  BRIDGE_SECTOR,
  type Heading,
  LANE_ARROWS_AT,
  type LanePoint,
  type LaneSegment,
  laneLabel,
  lanePointAlong,
  laneSegments,
  PAIRED_LANE_ARROWS_AT,
  PAIRED_LANE_TAG_AT,
  type Point,
  placeRooms,
  pointAlong,
  type Rect,
  type RoomPlacement,
  routeBetween,
  routeLength,
  sectorFor,
  tagPoint,
} from "./dashboard/layout.js";
export {
  type Dashboard,
  type DashboardCrew,
  type DashboardGrant,
  type DashboardInput,
  type DashboardLane,
  type DashboardMission,
  type DashboardRoom,
  type DashboardRun,
  dashboardModel,
  type LaneTag,
} from "./dashboard/model.js";
export {
  alertCount,
  CREW_DISPLAY_STATUSES,
  type CrewDisplayStatus,
  crewDisplayStatus,
  initials,
  isLive,
  overseerFirst,
  RUN_DISPLAY_STATUSES,
  type RunDisplayStatus,
  runDisplayStatus,
  sortRuns,
} from "./dashboard/status.js";
// Glossary
export {
  ABILITY_BRANDS,
  type AbilityBrand,
  type AbilityDisplay,
  type AbilityKind,
  abilityDisplay,
  connectorDisplay,
  ITEM_ICONS,
  type ItemDisplay,
  type ItemIconName,
  propDisplay,
  toolDisplay,
} from "./display/items.js";
// Events
export {
  applyEvent,
  bindReducer,
  emptyState,
  type StationEvent,
} from "./events.js";
export { GLOSSARY_KEYS, type GlossaryKey, glossary, term, termWith } from "./glossary.js";
export { deriveHealth, type HealthInputs } from "./health.js";
// Ledger
export {
  DEGRADED_AFTER_MS,
  type LedgerFiles,
  type ParseLedgerOptions,
  parseLedger,
  parseLedgerMarkdown,
} from "./ledger/parse.js";
// Email for the Gmail service: building drafts, reading threads (ADR-0022)
export { fromBase64, toBase64, toBase64Url } from "./mail/base64.js";
export {
  buildMessage,
  buildRawMessage,
  type DraftMessage,
  encodeHeaderValue,
  type GmailMessage,
  type GmailMessagePart,
  type GmailThread,
  header,
  htmlToText,
  MAX_BODY_CHARS,
  messageText,
  type ReadMessage,
  readMessage,
  readThread,
  replyHeaders,
  replySubject,
  summarizeThread,
  type ThreadSummary,
} from "./mail/message.js";
// Notifications: a projection of the event log (brief §10)
export {
  NOTIFICATION_EVENT_TYPES,
  type Notification,
  type NotificationKind,
  type NotificationLevel,
  notificationFor,
} from "./notifications.js";
// Budgets and consent (brief §6, §15)
export {
  BUDGET_WARNING_SHARE,
  type BudgetCheck,
  type BudgetLine,
  type BudgetScope,
  checkBudget,
  effectiveApprovalMode,
  needsConsent,
  type SpentSoFar,
  utcDay,
} from "./policy/budget.js";
// Connector tool classification and presets (ADR-0012)
export {
  AVAILABLE_PRESET_IDS,
  BUILTIN_TOOL_CLASSES,
  CONNECTOR_PRESET_IDS,
  CONNECTOR_PRESETS,
  type ConnectorPresetId,
  classifyConnectorTool,
  GITHUB_PRESET,
  GMAIL_MCP_PRESET,
  GMAIL_MCP_URL,
  GMAIL_PRESET,
  isPresetAvailable,
  KNOWN_TOOL_CLASSES,
  legacyGmailServer,
  migrateLegacyGmail,
  NOTION_PRESET,
  needsOwnClient,
  type OwnClientProfile,
  type OwnClientSetupStep,
  ownClientProfile,
  ownClientProfileOf,
  type ProfileSource,
  profileSource,
  type ToolHints,
} from "./policy/connector-tools.js";
// Dispatch (brief §7, ADR-0025)
export {
  checkDispatch,
  type DispatchCheck,
  type DispatchReach,
  type DispatchTree,
  type DispatchVia,
  dispatchReach,
  dispatchTargets,
  hasDispatch,
} from "./policy/dispatch.js";
// Effective grants (brief §6)
export {
  BUILTIN_TOOLS,
  type ConnectorToolCatalog,
  connectorToolName,
  type EffectiveTool,
  type GrantContext,
  resolveGrants,
  SKILL_VIEW_TOOL,
  type ToolClass,
  type ToolSource,
  type ToolSpec,
  withSkillTool,
} from "./policy/grants.js";
// Live crew state and the station map from runtime state (Phase 9, D24)
export {
  activityOf,
  CREW_ACTIVITY_EVENT_TYPES,
  type CrewActivity,
  type CrewActivityEntry,
  type CrewActivityState,
  foldCrewActivity,
} from "./run/crew-activity.js";
// Who asked whom, from events (ADR-0025)
export { type ChainLink, dispatchChain } from "./run/dispatch-chain.js";
// Runs: lifecycle and prompt assembly (brief §8)
export {
  type AssembledPrompt,
  assemblePrompt,
  ChatMessage,
  estimateTokens,
  historyBudget,
  type PromptInput,
  type PromptSkill,
  type PromptSkills,
  roleBriefing,
  SKILLS_CHAR_BUDGET,
  skillsSection,
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
export {
  cleanTitle,
  DEFAULT_SESSION_TITLE,
  fallbackTitle,
  MAX_TITLE_CHARS,
  TITLE_INSTRUCTIONS,
  type TitlePrompt,
  titlePrompt,
} from "./run/session-title.js";
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
// Skills library: parsing, enablement, capability gating (ADR-0023)
export { agentSkillsView, skillCatalog } from "./skills/catalog.js";
export {
  capabilitiesOf,
  isGloballyEnabled,
  missingRequirements,
  type SkillOverrideLists,
  type SkillSelection,
  type SkillSelectionInput,
  selectSkills,
  skillOverride,
  skillsForAgent,
  type UnavailableSkill,
  withSkillOverride,
} from "./skills/enablement.js";
export {
  isRequirement,
  MAX_SKILL_BYTES,
  type ParsedSkill,
  parseSkillFile,
  REQUIREMENTS,
  type Requirement,
  type Skill,
  SkillFrontmatter,
} from "./skills/skill.js";
// Server-sent events over fetch (the SPA sends the bearer token, so it cannot use EventSource)
export { createSseParser, type SseMessage, type SseParser } from "./sse.js";
