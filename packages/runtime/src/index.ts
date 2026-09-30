/**
 * @darthsaul/outerworld-ai-runtime
 *
 * The station runtime (ADR-0010): storage, the event log, and (in later phases) the agent loop,
 * dispatcher, scheduler, tools, MCP, memory, and budgets. All runtime logic lives here, never in
 * apps/*, so it can move into a desktop shell unchanged. Pure policy lives in core.
 */
export {
  ConflictError,
  CrewService,
  type CrewServiceOptions,
  NotFoundError,
} from "./crew/crew-service.js";
export {
  ApiKeyService,
  type ApiKeyStatus,
  InvalidKeyError,
  OPENROUTER_KEY_URL,
} from "./secrets/api-key.js";
export { createRedactor, type Redactor } from "./secrets/redact.js";
export {
  KEYCHAIN_SERVICE,
  KeychainSecretStore,
  MemorySecretStore,
  type SecretStore,
} from "./secrets/store.js";
export {
  type RunRecord,
  type RunTrigger,
  type SessionRecord,
  SessionStore,
  type StoredMessage,
} from "./sessions/session-store.js";
export { type AtomicWriteOptions, writeFileAtomic } from "./storage/atomic-write.js";
export { type Db, openDatabase } from "./storage/database.js";
export { type EventListener, EventStore } from "./storage/event-store.js";
export { MIGRATIONS, type Migration } from "./storage/migrations.js";
export {
  AGENT_DOCUMENTS,
  type AgentDocumentName,
  type LoadedAgent,
  type LoadedStation,
  loadStationDir,
  saveAgentConfig,
  saveAgentDocument,
  saveStationConfig,
  stationPaths,
} from "./storage/station-dir.js";
