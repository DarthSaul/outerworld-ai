import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApiKeyService,
  CrewService,
  EventStore,
  MemorySecretStore,
  openDatabase,
  RunService,
  SessionStore,
  scriptedModels,
} from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { SessionDetail } from "./comms-routes.js";

const TOKEN = "d".repeat(64);
const KEY = "sk-or-v1-abcdefabcdefabcdefabcdefabcdef";
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const setup = (keyCheckStatus = 200) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-comms-")), "home");
  cpSync(fixture, home, { recursive: true });
  const db = openDatabase(":memory:");
  const events = new EventStore(db);
  const sessions = new SessionStore(db);
  const apiKeys = new ApiKeyService({
    store: new MemorySecretStore(),
    env: {},
    fetch: (async () => new Response("{}", { status: keyCheckStatus })) as unknown as typeof fetch,
  });
  const runs = new RunService({
    home,
    events,
    sessions,
    models: scriptedModels({ chunkDelayInMs: 0 }),
  });
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    crew: new CrewService({ home, events }),
    runs,
    sessions,
    apiKeys,
    modelMode: "fake",
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
    return { status: res.status, text, json: text ? JSON.parse(text) : undefined };
  };
  return { call, runs, events };
};

const untilSettled = async (call: ReturnType<typeof setup>["call"], sessionId: string) => {
  for (let i = 0; i < 100; i++) {
    const { json } = await call("GET", `/sessions/${sessionId}`);
    const detail = json as SessionDetail;
    if (detail.runs.every((r) => !["queued", "running"].includes(r.state))) return detail;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("run did not settle");
};

describe("sessions and runs", () => {
  it("creates a session, sends a message (202 with a run id), and stores the reply", async () => {
    const { call } = setup();
    const created = await call("POST", "/agents/vesper/sessions", { title: "Morning" });
    expect(created.status).toBe(201);
    const sent = await call("POST", `/sessions/${created.json.id}/messages`, { text: "Status?" });
    expect(sent.status).toBe(202);
    expect(sent.json.runId).toEqual(expect.any(String));
    const detail = await untilSettled(call, created.json.id);
    expect(detail.session.title).toBe("Morning");
    expect(detail.messages.map((m) => m.message.role)).toEqual(["user", "assistant"]);
    expect(detail.runs[0]?.state).toBe("completed");
  });

  it("lists an agent's sessions and hides archived ones unless asked", async () => {
    const { call } = setup();
    const a = await call("POST", "/agents/vesper/sessions", {});
    await call("POST", "/agents/vesper/sessions", { title: "Second" });
    await call("PATCH", `/sessions/${a.json.id}`, { archived: true });
    expect(
      (await call("GET", "/agents/vesper/sessions")).json.map((s: { title: string }) => s.title),
    ).toEqual(["Second"]);
    expect((await call("GET", "/agents/vesper/sessions?archived=1")).json).toHaveLength(2);
  });

  it("renames a session", async () => {
    const { call } = setup();
    const s = await call("POST", "/agents/vesper/sessions", {});
    const renamed = await call("PATCH", `/sessions/${s.json.id}`, { title: "Weekly" });
    expect(renamed.json.title).toBe("Weekly");
  });

  it("answers 404 for an unknown agent or session, 409 for an archived one", async () => {
    const { call } = setup();
    expect((await call("POST", "/agents/nobody/sessions", {})).status).toBe(404);
    expect((await call("GET", "/sessions/nope")).status).toBe(404);
    const s = await call("POST", "/agents/vesper/sessions", {});
    await call("PATCH", `/sessions/${s.json.id}`, { archived: true });
    expect((await call("POST", `/sessions/${s.json.id}/messages`, { text: "hi" })).status).toBe(
      409,
    );
  });

  it("refuses an empty message (400)", async () => {
    const { call } = setup();
    const s = await call("POST", "/agents/vesper/sessions", {});
    expect((await call("POST", `/sessions/${s.json.id}/messages`, { text: "  " })).status).toBe(
      400,
    );
  });

  it("cancels a run (202) and answers 404 for an unknown run", async () => {
    const { call } = setup();
    const s = await call("POST", "/agents/vesper/sessions", {});
    const sent = await call("POST", `/sessions/${s.json.id}/messages`, { text: "Go" });
    expect((await call("POST", `/runs/${sent.json.runId}/cancel`)).status).toBe(202);
    expect((await call("POST", "/runs/nope/cancel")).status).toBe(404);
  });
});

describe("settings", () => {
  it("reports the model mode and whether a key is configured, never the key", async () => {
    const { call } = setup();
    expect((await call("GET", "/settings")).json).toEqual({
      modelMode: "fake",
      openrouter: { configured: false, source: null },
    });
    const put = await call("PUT", "/settings/openrouter", { key: KEY });
    expect(put.status).toBe(204);
    const after = await call("GET", "/settings");
    expect(after.json.openrouter).toEqual({ configured: true, source: "keychain" });
    expect(after.text).not.toContain(KEY);
  });

  it("refuses a key OpenRouter rejects (400) without echoing it", async () => {
    const { call } = setup(401);
    const res = await call("PUT", "/settings/openrouter", { key: KEY });
    expect(res.status).toBe(400);
    expect(res.text).not.toContain(KEY);
  });

  it("removes the stored key", async () => {
    const { call } = setup();
    await call("PUT", "/settings/openrouter", { key: KEY });
    expect((await call("DELETE", "/settings/openrouter")).status).toBe(204);
    expect((await call("GET", "/settings")).json.openrouter.configured).toBe(false);
  });
});
