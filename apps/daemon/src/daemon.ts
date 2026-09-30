import { chmod, mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import {
  CrewService,
  EventStore,
  loadStationDir,
  openDatabase,
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
  const events = new EventStore(openDatabase(paths.database));

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
  const self = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const dev = config.devOrigin !== undefined ? [config.devOrigin] : [];
  app = createApp({
    token,
    allowedOrigins: [...self, ...dev],
    allowedHosts: [...self, ...dev].map((o) => new URL(o).host),
    events,
    crew: new CrewService({ home: config.home, events }),
    version: VERSION,
    ...(config.spaDir !== undefined ? { spaDir: config.spaDir } : {}),
  });

  events.append({ type: "station.started", payload: {} });
  const url = `http://127.0.0.1:${port}`;
  log(`outerworld daemon ${VERSION} on ${url} (station: ${config.home})`);

  return {
    url,
    app,
    async close(reason) {
      events.append({ type: "station.stopped", payload: { reason } });
      const closed = new Promise<void>((r) => server.close(() => r()));
      // Open SSE streams would otherwise hold the server open forever.
      if ("closeAllConnections" in server) server.closeAllConnections();
      await closed;
      events.close();
    },
  };
}
