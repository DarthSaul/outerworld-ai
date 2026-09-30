import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EventStore,
  MemorySecretStore,
  openDatabase,
  SessionStore,
} from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { startDaemon } from "./daemon.js";

const home = () => join(mkdtempSync(join(tmpdir(), "ow-daemon-")), "home");

describe("startDaemon", () => {
  it("creates the station directory and token, serves the API on loopback, and logs start and stop", async () => {
    const h = home();
    const daemon = await startDaemon(
      { home: h, port: 0, host: "127.0.0.1", modelMode: "fake" },
      { quiet: true, secrets: new MemorySecretStore(), env: {} },
    );
    try {
      expect(statSync(h).mode & 0o777).toBe(0o700);
      const token = readFileSync(join(h, "daemon.token"), "utf8").trim();
      expect(daemon.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const res = await fetch(`${daemon.url}/api/health`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      expect((await fetch(`${daemon.url}/api/health`)).status).toBe(401);
    } finally {
      await daemon.close("shutdown");
    }
    const log = new EventStore(openDatabase(join(h, "station.db")));
    expect(log.since(0).map((e) => e.type)).toEqual(["station.started", "station.stopped"]);
    log.close();
  });

  it("closes promptly while an SSE stream is still open", async () => {
    const h = home();
    const daemon = await startDaemon(
      { home: h, port: 0, host: "127.0.0.1", modelMode: "fake" },
      { quiet: true, secrets: new MemorySecretStore(), env: {} },
    );
    const token = readFileSync(join(h, "daemon.token"), "utf8").trim();
    const res = await fetch(`${daemon.url}/api/events`, {
      headers: { authorization: `Bearer ${token}` },
    });
    await res.body?.getReader().read();
    await daemon.close("shutdown");
  });

  it("marks runs a crash left unfinished as interrupted before it serves", async () => {
    const h = home();
    const first = await startDaemon(
      { home: h, port: 0, host: "127.0.0.1", modelMode: "fake" },
      { quiet: true, secrets: new MemorySecretStore(), env: {} },
    );
    await first.close("shutdown");
    const db = openDatabase(join(h, "station.db"));
    const store = new SessionStore(db);
    const s = store.createSession("vesper", "Crashed");
    const run = store.createRun({
      sessionId: s.id,
      agentId: "vesper",
      trigger: "user",
      model: "m",
    });
    store.transition(run.id, "start");
    db.close();
    const warnings: string[] = [];
    const second = await startDaemon(
      { home: h, port: 0, host: "127.0.0.1", modelMode: "fake" },
      { quiet: true, warn: (m) => warnings.push(m), secrets: new MemorySecretStore(), env: {} },
    );
    await second.close("shutdown");
    expect(warnings.join("\n")).toMatch(/1 unfinished run\(s\) marked interrupted/);
    const after = new SessionStore(openDatabase(join(h, "station.db")));
    expect(after.getRun(run.id)?.state).toBe("interrupted");
  });

  it("starts on a fresh home with no station.json yet (onboarding creates it) and reports why", async () => {
    const warnings: string[] = [];
    const daemon = await startDaemon(
      { home: home(), port: 0, host: "127.0.0.1", modelMode: "fake" },
      { quiet: true, warn: (m) => warnings.push(m), secrets: new MemorySecretStore(), env: {} },
    );
    await daemon.close("shutdown");
    expect(warnings.join("\n")).toMatch(/station\.json: missing/);
  });

  it("answers to the Vite dev server's host and origin when a dev origin is set", async () => {
    const h = home();
    const daemon = await startDaemon(
      {
        home: h,
        port: 0,
        host: "127.0.0.1",
        devOrigin: "http://localhost:5173",
        modelMode: "fake",
      },
      { quiet: true, secrets: new MemorySecretStore(), env: {} },
    );
    try {
      const token = readFileSync(join(h, "daemon.token"), "utf8").trim();
      const res = await daemon.app.request("http://localhost:5173/api/health", {
        headers: { authorization: `Bearer ${token}`, origin: "http://localhost:5173" },
      });
      expect(res.status).toBe(200);
    } finally {
      await daemon.close("shutdown");
    }
  });
});
