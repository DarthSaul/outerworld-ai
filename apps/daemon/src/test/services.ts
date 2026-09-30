import {
  ApiKeyService,
  CrewService,
  type EventStore,
  MemorySecretStore,
  openDatabase,
  RunService,
  SessionStore,
  scriptedModels,
} from "@darthsaul/outerworld-ai-runtime";
import type { CommsDeps } from "../comms-routes.js";

/** Runtime services for app tests: scripted model, in-memory keychain, no network. */
export function testServices(home: string, events: EventStore): CommsDeps {
  const sessions = new SessionStore(openDatabase(":memory:"));
  return {
    crew: new CrewService({ home, events }),
    sessions,
    runs: new RunService({ home, events, sessions, models: scriptedModels({ chunkDelayInMs: 0 }) }),
    apiKeys: new ApiKeyService({ store: new MemorySecretStore(), env: {} }),
    modelMode: "fake",
  };
}
