import { chmod, mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import {
  ApiKeyService,
  ConnectorManager,
  ConsentStore,
  CrewService,
  createFileTools,
  createRedactor,
  createRememberTool,
  createWebFetch,
  DispatchService,
  DispatchStore,
  EventStore,
  KeychainSecretStore,
  KillSwitch,
  loadStationDir,
  MemoryStore,
  openDatabase,
  openRouterModels,
  RunService,
  type SecretStore,
  SessionStore,
  SpendStore,
  scriptedModels,
  stationPaths,
} from "@darthsaul/outerworld-ai-runtime";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import type { DaemonConfig } from "./config.js";
import { ensureToken } from "./token.js";

export const VERSION = "0.1.0";

export interface RunningDaemon {
  readonly url: string;
  readonly app: Hono;
  close(reason: "shutdown" | "signal" | "error"): Promise<void>;
}

export interface StartOptions {
  readonly quiet?: boolean;
  readonly warn?: (message: string) => void;
  /** Where the OpenRouter key lives; the OS keychain unless a test passes a memory store. */
  readonly secrets?: SecretStore;
  /** For the `OPENROUTER_API_KEY` development fallback; defaults to the process environment. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Wires the runtime to HTTP: prepares the station directory (mode 0700), the token, the
 * database and event log, loads the station, and listens on 127.0.0.1. Never prints the token.
 */
export async function startDaemon(
  config: DaemonConfig,
  options: StartOptions = {},
): Promise<RunningDaemon> {
  const log = options.quiet ? () => {} : (m: string) => console.log(m);
  const warn = options.warn ?? ((m: string) => console.warn(m));
  const paths = stationPaths(config.home);
  await mkdir(config.home, { recursive: true, mode: 0o700 });
  await chmod(config.home, 0o700);
  await mkdir(paths.workspacesDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });

  const token = await ensureToken(paths.token);
  const secrets = options.secrets ?? new KeychainSecretStore();
  const apiKeys = new ApiKeyService({
    store: secrets,
    env: options.env ?? process.env,
  });
  const db = openDatabase(paths.database);
  const redact = createRedactor(() => apiKeys.knownSecrets());
  const events = new EventStore(db, { redact });
  const sessions = new SessionStore(db);
  const consents = new ConsentStore(db);
  const spend = new SpendStore(db);
  const memories = new MemoryStore(db);
  const dispatches = new DispatchStore(db);
  // The OAuth redirect needs the bound port, known only once listening (set below).
  let boundPort = config.port;
  const connectors = new ConnectorManager({
    home: config.home,
    events,
    secrets,
    redirectUrl: (id) => `http://127.0.0.1:${boundPort}/oauth/callback/${encodeURIComponent(id)}`,
  });
  const runs = new RunService({
    home: config.home,
    events,
    sessions,
    consents,
    spend,
    killSwitch: new KillSwitch(db),
    connectors,
    tools: {
      ...createFileTools({ workspacesDir: paths.workspacesDir }),
      web_fetch: createWebFetch(),
      remember: createRememberTool({ memories, events }),
    },
    models: config.modelMode === "fake" ? scriptedModels() : openRouterModels(apiKeys),
    redact,
  });
  new DispatchService({ home: config.home, runs, sessions, events, dispatches });

  const loaded = await loadStationDir(config.home);
  for (const issue of loaded.issues) warn(`${issue.level}: ${issue.path}: ${issue.message}`);

  // The allowed hosts and origins depend on the bound port, which is only known once listening.
  let app: Hono | undefined;
  const server = serve({
    fetch: (req, env) => (app ? app.fetch(req, env) : new Response("starting", { status: 503 })),
    port: config.port,
    hostname: config.host,
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("listening", resolveListen);
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  boundPort = port;
  const self = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const dev = config.devOrigin !== undefined ? [config.devOrigin] : [];
  app = createApp({
    token,
    allowedOrigins: [...self, ...dev],
    allowedHosts: [...self, ...dev].map((o) => new URL(o).host),
    events,
    crew: new CrewService({
      home: config.home,
      events,
      connectorTools: () => connectors.catalog(),
    }),
    connectors,
    runs,
    sessions,
    consents,
    spend,
    dispatches,
    apiKeys,
    modelMode: config.modelMode,
    version: VERSION,
    ...(config.spaDir !== undefined ? { spaDir: config.spaDir } : {}),
  });

  events.append({ type: "station.started", payload: {} });
  // Crash semantics (brief §8): runs the last process left unfinished are surfaced, never resumed.
  const interrupted = runs.recover();
  if (interrupted.length) warn(`${interrupted.length} unfinished run(s) marked interrupted`);
  // Reconnect connectors that already have a sign-in, in the background: a slow or unreachable
  // server must not hold up the daemon. Their status arrives as connector.status events.
  void connectors.start().catch((error: unknown) => warn(`connectors: ${String(error)}`));
  const url = `http://127.0.0.1:${port}`;
  log(
    `outerworld daemon ${VERSION} on ${url} (station: ${config.home}, models: ${config.modelMode})`,
  );

  return {
    url,
    app,
    async close(reason) {
      events.append({ type: "station.stopped", payload: { reason } });
      await connectors.stop();
      const closed = new Promise<void>((r) => server.close(() => r()));
      // Open SSE streams would otherwise hold the server open forever.
      if ("closeAllConnections" in server) server.closeAllConnections();
      await closed;
      events.close();
    },
  };
}
