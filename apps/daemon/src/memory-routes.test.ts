import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventStore, openDatabase } from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "f".repeat(64);
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const setup = () => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-mem-")), "home");
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
  return { call, store: services.memoryStore, events };
};

describe("memory routes", () => {
  it("lists proposals and beliefs, approves as proposed or edited, and rejects", async () => {
    const { call, store } = setup();
    const a = store.propose({ agentId: "quill", scope: "agent", text: "Likes bullets" });
    const b = store.propose({ agentId: "quill", scope: "agent", text: "Wrong" });
    const c = store.propose({ agentId: "quill", scope: "agent", text: "UTC" });
    expect((await call("GET", "/agents/quill/memories")).json.proposals).toHaveLength(3);
    expect((await call("POST", `/memories/${a.id}/approve`)).json.status).toBe("approved");
    expect(
      (await call("POST", `/memories/${c.id}/approve`, { text: "Works in UTC." })).json.text,
    ).toBe("Works in UTC.");
    expect((await call("POST", `/memories/${b.id}/reject`)).json.status).toBe("rejected");
    const view = (await call("GET", "/agents/quill/memories")).json;
    expect(view.proposals).toEqual([]);
    expect(view.beliefs.map((m: { text: string }) => m.text).sort()).toEqual([
      "Likes bullets",
      "Works in UTC.",
    ]);
  });

  it("edits and deletes a belief; deciding twice is 409, unknown is 404, empty text 400", async () => {
    const { call, store } = setup();
    const a = store.propose({ agentId: "quill", scope: "agent", text: "Old" });
    await call("POST", `/memories/${a.id}/approve`);
    expect((await call("POST", `/memories/${a.id}/approve`)).status).toBe(409);
    expect((await call("PATCH", `/memories/${a.id}`, { text: "New" })).json.text).toBe("New");
    expect((await call("PATCH", `/memories/${a.id}`, { text: " " })).status).toBe(400);
    expect((await call("DELETE", `/memories/${a.id}`)).status).toBe(204);
    expect((await call("POST", "/memories/nope/reject")).status).toBe(404);
  });
});
