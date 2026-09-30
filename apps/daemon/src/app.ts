import { readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import type { ConnectorManager, EventStore } from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { type CommsDeps, commsRoutes } from "./comms-routes.js";
import { connectorRoutes, oauthCallback } from "./connector-routes.js";
import { crewRoutes } from "./crew-routes.js";
import { apiRequestRules } from "./http.js";
import { tokensMatch } from "./token.js";

export interface AppOptions extends CommsDeps {
  readonly token: string;
  /** Origins a browser may call from: the daemon's own, plus the Vite dev server in development. */
  readonly allowedOrigins: readonly string[];
  /** `host:port` values the daemon answers to; anything else is DNS rebinding. */
  readonly allowedHosts: readonly string[];
  readonly events: EventStore;
  readonly connectors: ConnectorManager;
  readonly version: string;
  /** The built SPA (`apps/station/dist`). Absent in development, where Vite serves it. */
  readonly spaDir?: string;
  /** Keepalive interval for idle SSE connections. */
  readonly pingMs?: number;
}

const REPLAY_PAGE = 500;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * The daemon's HTTP surface (brief §10, §11). Every route checks the Host (DNS rebinding) and
 * the browser's Origin and Sec-Fetch-Site (other websites); every `/api/*` route also needs the
 * per-install bearer token. The SPA's index.html is the one thing served without the token,
 * because it is how the token reaches the page.
 */
export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const origins = new Set(options.allowedOrigins);
  const hosts = new Set(options.allowedHosts);

  app.use("*", async (c, next) => {
    if (!hosts.has(new URL(c.req.url).host)) return c.json({ error: "forbidden host" }, 403);
    const origin = c.req.header("origin");
    if (origin !== undefined && !origins.has(origin)) {
      return c.json({ error: "forbidden origin" }, 403);
    }
    // The OAuth callback is a top-level navigation back from the connector's sign-in page, so
    // it is cross-site by nature; it is guarded by a one-time state instead (connector-routes).
    const callback = new URL(c.req.url).pathname.startsWith("/oauth/callback/");
    if (!callback && c.req.header("sec-fetch-site") === "cross-site") {
      return c.json({ error: "forbidden origin" }, 403);
    }
    await next();
  });

  app.use("/api/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!tokensMatch(given, options.token)) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  apiRequestRules(app, "/api/*");

  app.get("/api/health", (c) =>
    c.json({ ok: true, version: options.version, latestSeq: options.events.latestSeq() }),
  );

  app.get("/api/events", (c) => {
    const lastId = Number.parseInt(c.req.header("last-event-id") ?? "", 10);
    let last = Number.isSafeInteger(lastId) && lastId > 0 ? lastId : 0;
    return streamSSE(c, async (stream) => {
      const queue: RuntimeEvent[] = [];
      let wake: (() => void) | undefined;
      const off = options.events.subscribe((e) => {
        queue.push(e);
        wake?.();
      });
      stream.onAbort(() => {
        off();
        wake?.();
      });
      const send = async (e: RuntimeEvent) => {
        // Ephemeral events have no id of their own, so they never move Last-Event-ID (D18).
        if (e.ephemeral) {
          await stream.writeSSE({ data: JSON.stringify(e) });
          return;
        }
        if (e.seq <= last) return;
        await stream.writeSSE({ id: String(e.seq), data: JSON.stringify(e) });
        last = e.seq;
      };
      // Subscribed first, so nothing appended during the replay is missed; `send` drops repeats.
      for (;;) {
        const page = options.events.since(last, REPLAY_PAGE);
        for (const e of page) await send(e);
        if (page.length < REPLAY_PAGE) break;
      }
      while (!stream.aborted) {
        while (queue.length > 0) {
          const e = queue.shift();
          if (e) await send(e);
        }
        const woke = await Promise.race([
          new Promise<boolean>((r) => {
            wake = () => r(true);
          }),
          stream.sleep(options.pingMs ?? 15_000).then(() => false),
        ]);
        wake = undefined;
        if (!woke && !stream.aborted) await stream.write(": ping\n\n");
      }
      off();
    });
  });

  app.route("/api", crewRoutes(options.crew));
  app.route("/api", commsRoutes(options));
  app.route("/api", connectorRoutes({ crew: options.crew, connectors: options.connectors }));
  app.route("/", oauthCallback(options.connectors));

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  const spaDir = options.spaDir;
  if (spaDir !== undefined) {
    const index = readFile(join(spaDir, "index.html"), "utf8").then((html) =>
      html.replace("</head>", `<meta name="outerworld-token" content="${options.token}"></head>`),
    );
    const root = realpath(spaDir);
    app.get("*", async (c) => {
      const path = decodeURIComponent(new URL(c.req.url).pathname);
      if (extname(path) !== "") {
        const base = await root;
        try {
          const file = await realpath(join(base, path));
          if (file.startsWith(base + sep)) {
            return c.body(await readFile(file), 200, {
              "content-type": TYPES[extname(file)] ?? "application/octet-stream",
            });
          }
        } catch {
          // Missing asset: fall through to 404 below.
        }
        return c.text("not found", 404);
      }
      return c.html(await index, 200, {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      });
    });
  }

  return app;
}
