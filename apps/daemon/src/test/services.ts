import {
  ApiKeyService,
  ConsentStore,
  CrewService,
  type EventStore,
  KillSwitch,
  MemorySecretStore,
  openDatabase,
  RunService,
  SessionStore,
  SpendStore,
  scriptedModels,
} from "@darthsaul/outerworld-ai-runtime";
import type { CommsDeps } from "../comms-routes.js";

/** Runtime services for app tests: scripted model, in-memory keychain, no network. */
export function testServices(home: string, events: EventStore): CommsDeps {
  const db = openDatabase(":memory:");
  const sessions = new SessionStore(db);
  const consents = new ConsentStore(db);
  const spend = new SpendStore(db);
  return {
    crew: new CrewService({ home, events }),
    sessions,
    consents,
    spend,
    runs: new RunService({
      home,
      events,
      sessions,
      consents,
      spend,
      killSwitch: new KillSwitch(db),
      models: scriptedModels({ chunkDelayInMs: 0 }),
    }),
    apiKeys: new ApiKeyService({ store: new MemorySecretStore(), env: {} }),
    modelMode: "fake",
  };
}
