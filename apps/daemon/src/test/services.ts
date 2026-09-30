import {
  ApiKeyService,
  ConnectorManager,
  ConsentStore,
  CrewService,
  DispatchService,
  DispatchStore,
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

export type TestServices = CommsDeps & { connectors: ConnectorManager };

/** Runtime services for app tests: scripted model, in-memory keychain, no network. */
export function testServices(
  home: string,
  events: EventStore,
  secrets = new MemorySecretStore(),
): TestServices {
  const db = openDatabase(":memory:");
  const sessions = new SessionStore(db);
  const consents = new ConsentStore(db);
  const spend = new SpendStore(db);
  const dispatches = new DispatchStore(db);
  const connectors = new ConnectorManager({
    home,
    events,
    secrets,
    redirectUrl: (id) => `http://127.0.0.1:4317/oauth/callback/${id}`,
    transports: async () => {
      throw new Error("no network in tests");
    },
  });
  const runs = new RunService({
    home,
    events,
    sessions,
    consents,
    spend,
    killSwitch: new KillSwitch(db),
    models: scriptedModels({ chunkDelayInMs: 0 }),
  });
  new DispatchService({ home, runs, sessions, events, dispatches });
  return {
    crew: new CrewService({ home, events, connectorTools: () => connectors.catalog() }),
    connectors,
    sessions,
    consents,
    spend,
    dispatches,
    runs,
    apiKeys: new ApiKeyService({ store: new MemorySecretStore(), env: {} }),
    modelMode: "fake",
  };
}
