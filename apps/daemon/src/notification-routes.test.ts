import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventStore, openDatabase } from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "c".repeat(64);
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const setup = () => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-notif-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const services = testServices(home, events);
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    ...services,
    version: "test",
  });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`http://127.0.0.1:4317/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  };
  return { call, services, events };
};

describe("notification routes", () => {
  it("pages the feed newest first and keeps a shared read marker", async () => {
    const { call, events } = setup();
    const run = { agentId: "quill", sessionId: "s1", runId: "r1" };
    for (let i = 0; i < 3; i++) {
      events.append({ type: "run.failed", ...run, payload: { error: `boom ${i}` } });
      events.append({ type: "run.started", ...run, payload: { model: "m" } });
    }
    const first = (await call("GET", "/notifications?limit=2")).json;
    expect(first.items.map((n: { detail: string }) => n.detail)).toEqual(["boom 2", "boom 1"]);
    expect(first.unread).toBe(3);
    const older = (await call("GET", `/notifications?limit=2&before=${first.nextBefore}`)).json;
    expect(older.items.map((n: { detail: string }) => n.detail)).toEqual(["boom 0"]);

    const read = await call("POST", "/notifications/read", { seq: first.items[0].seq });
    expect(read.json).toEqual({ readSeq: first.items[0].seq, unread: 0 });
    expect((await call("GET", "/notifications")).json.unread).toBe(0);
    expect((await call("POST", "/notifications/read", { seq: -1 })).status).toBe(400);
  });
});
