import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSseParser,
  type NewRuntimeEvent,
  type RuntimeEvent,
} from "@darthsaul/outerworld-ai-core";
import { EventStore, openDatabase } from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "a".repeat(64);
const ORIGIN = "http://127.0.0.1:4317";

const delta = (text: string): NewRuntimeEvent => ({
  type: "run.delta",
  agentId: "pm",
  sessionId: "s1",
  runId: "r1",
  payload: { text },
});

const spaDir = () => {
  const d = mkdtempSync(join(tmpdir(), "ow-spa-"));
  writeFileSync(
    join(d, "index.html"),
    "<!doctype html><html><head><title>x</title></head><body></body></html>",
  );
  mkdirSync(join(d, "assets"));
  writeFileSync(join(d, "assets", "app.js"), "console.log(1)");
  return d;
};

const setup = (opts: { spa?: boolean; pingMs?: number } = {}) => {
  const events = new EventStore(openDatabase(":memory:"));
  const app = createApp({
    token: TOKEN,
    allowedOrigins: [ORIGIN, "http://localhost:4317"],
    allowedHosts: ["127.0.0.1:4317", "localhost:4317"],
    events,
    ...testServices(mkdtempSync(join(tmpdir(), "ow-app-home-")), events),
    version: "0.0.0-test",
    ...(opts.spa ? { spaDir: spaDir() } : {}),
    ...(opts.pingMs ? { pingMs: opts.pingMs } : {}),
  });
  const request = (path: string, headers: Record<string, string> = {}) =>
    app.request(`http://127.0.0.1:4317${path}`, { headers });
  const authed = (path: string, headers: Record<string, string> = {}) =>
    request(path, { authorization: `Bearer ${TOKEN}`, ...headers });
  return { app, events, request, authed };
};

/** Reads SSE messages from a response until `n` have arrived, then cancels the stream. */
const readEvents = async (res: Response, n: number) => {
  const out: RuntimeEvent[] = [];
  const raw: string[] = [];
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no body");
  const decoder = new TextDecoder();
  const parser = createSseParser((m) => out.push(JSON.parse(m.data)));
  while (out.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    raw.push(text);
    parser.push(text);
  }
  await reader.cancel();
  return { events: out, raw: raw.join("") };
};

describe("auth", () => {
  it("rejects an API request without a token (401) and never echoes the token", async () => {
    const res = await setup().request("/api/health");
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(TOKEN);
  });

  it("rejects a wrong or malformed token (401)", async () => {
    const { request } = setup();
    expect(
      (await request("/api/health", { authorization: `Bearer ${"b".repeat(64)}` })).status,
    ).toBe(401);
    expect((await request("/api/health", { authorization: TOKEN })).status).toBe(401);
  });

  it("accepts the right token", async () => {
    const res = await setup().authed("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      version: "0.0.0-test",
      latestSeq: 0,
      startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("rejects a request from another website's Origin (403), even with the token", async () => {
    const res = await setup().authed("/api/health", { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("accepts an allowed Origin", async () => {
    expect((await setup().authed("/api/health", { origin: ORIGIN })).status).toBe(200);
  });

  it("rejects a browser's cross-site request (Sec-Fetch-Site) even without an Origin", async () => {
    const res = await setup().authed("/api/health", { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
  });

  it("rejects a foreign Host header (DNS rebinding) on every route, SPA included", async () => {
    const { app } = setup({ spa: true });
    for (const path of ["/", "/api/health"]) {
      const res = await app.request(`http://evil.example:4317${path}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(403);
    }
  });

  it("returns 404 JSON for an unknown API route, after auth", async () => {
    const { request, authed } = setup();
    expect((await request("/api/nope")).status).toBe(401);
    expect((await authed("/api/nope")).status).toBe(404);
  });
});

describe("GET /api/events", () => {
  it("streams events as SSE with id = seq and the event as JSON data", async () => {
    const { events, authed } = setup();
    events.append(delta("a"));
    const res = await authed("/api/events");
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const { events: got, raw } = await readEvents(res, 1);
    expect(got[0]).toMatchObject({ seq: 1, type: "run.delta", payload: { text: "a" } });
    expect(raw).toMatch(/^id: 1$/m);
  });

  it("replays only what came after Last-Event-ID", async () => {
    const { events, authed } = setup();
    for (const t of ["a", "b", "c"]) events.append(delta(t));
    const res = await authed("/api/events", { "last-event-id": "1" });
    const { events: got } = await readEvents(res, 2);
    expect(got.map((e) => e.seq)).toEqual([2, 3]);
  });

  it("delivers live events after the replay, without gaps or duplicates", async () => {
    const { events, authed } = setup();
    events.append(delta("a"));
    const res = await authed("/api/events");
    const reading = readEvents(res, 3);
    await new Promise((r) => setTimeout(r, 10));
    events.append(delta("b"));
    events.append(delta("c"));
    const { events: got } = await reading;
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("streams ephemeral events live without an id, so replay is unaffected", async () => {
    const { events, authed } = setup();
    events.append(delta("a"));
    const res = await authed("/api/events");
    const reading = readEvents(res, 2);
    await new Promise((r) => setTimeout(r, 10));
    events.publish(delta("live"));
    const { events: got, raw } = await reading;
    expect(got[1]).toMatchObject({ ephemeral: true, payload: { text: "live" } });
    expect(raw.match(/^id: /gm)).toHaveLength(1);
  });

  it("sends a keepalive comment while idle", async () => {
    const { authed } = setup({ pingMs: 5 });
    const res = await authed("/api/events");
    const reader = res.body?.getReader();
    const { value } = (await reader?.read()) ?? {};
    expect(new TextDecoder().decode(value)).toMatch(/^: ping/);
    await reader?.cancel();
  });

  it("ignores a Last-Event-ID that is not a number and replays from the start", async () => {
    const { events, authed } = setup();
    events.append(delta("a"));
    const { events: got } = await readEvents(
      await authed("/api/events", { "last-event-id": "x" }),
      1,
    );
    expect(got[0]?.seq).toBe(1);
  });
});

describe("serving the built SPA", () => {
  it("serves index.html without the API token but with it injected, uncached", async () => {
    const res = await setup({ spa: true }).request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain(`<meta name="outerworld-token" content="${TOKEN}">`);
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await setup({ spa: true }).request("/comms/pm");
    expect(await res.text()).toContain("outerworld-token");
  });

  it("serves built assets", async () => {
    const res = await setup({ spa: true }).request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log(1)");
  });

  it("does not serve files outside the SPA directory", async () => {
    const res = await setup({ spa: true }).request("/assets/..%2f..%2fetc%2fpasswd");
    expect(await res.text()).not.toMatch(/root:/);
  });

  it("serves nothing but the API when no SPA directory is configured (dev: Vite serves it)", async () => {
    expect((await setup().request("/")).status).toBe(404);
  });
});
