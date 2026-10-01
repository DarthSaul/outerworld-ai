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
  MemoryService,
  MemoryStore,
  NotificationService,
  openDatabase,
  RunService,
  Scheduler,
  ScheduleStore,
  SessionStore,
  SpendStore,
  scriptedModels,
} from "@darthsaul/outerworld-ai-runtime";
import type { CommsDeps } from "../comms-routes.js";

export type TestServices = CommsDeps & {
  connectors: ConnectorManager;
  memory: MemoryService;
  memoryStore: MemoryStore;
  scheduler: Scheduler;
  notifications: NotificationService;
};

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
  const memoryStore = new MemoryStore(db);
  const memory = new MemoryService({ store: memoryStore, events });
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
    beliefs: (agentId) => memory.beliefsFor(agentId).map((m) => m.text),
    models: scriptedModels({ chunkDelayInMs: 0 }),
  });
  new DispatchService({ home, runs, sessions, events, dispatches });
  // Not started: tests read views and run now; timing is covered in the runtime's tests.
  const scheduler = new Scheduler({ home, runs, sessions, events, store: new ScheduleStore(db) });
  return {
    crew: new CrewService({ home, events, connectorTools: () => connectors.catalog() }),
    connectors,
    memory,
    memoryStore,
    scheduler,
    notifications: new NotificationService({ events, db }),
    sessions,
    consents,
    spend,
    dispatches,
    runs,
    apiKeys: new ApiKeyService({ store: new MemorySecretStore(), env: {} }),
    modelMode: "fake",
  };
}
