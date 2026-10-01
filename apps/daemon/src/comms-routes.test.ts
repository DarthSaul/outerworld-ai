import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApiKeyService,
  EventStore,
  MemorySecretStore,
  openDatabase,
} from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { SessionDetail } from "./comms-routes.js";
import { testServices } from "./test/services.js";

const TOKEN = "d".repeat(64);
const KEY = "sk-or-v1-abcdefabcdefabcdefabcdefabcdef";
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const setup = (keyCheckStatus = 200) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-comms-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const apiKeys = new ApiKeyService({
    store: new MemorySecretStore(),
    env: {},
    fetch: (async () => new Response("{}", { status: keyCheckStatus })) as unknown as typeof fetch,
  });
  const services = testServices(home, events);
  const { runs } = services;
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    ...services,
    apiKeys,
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

describe("consents, kill switch, and spend", () => {
  it("lists nothing pending and refuses to decide an unknown request", async () => {
    const { call } = setup();
    expect((await call("GET", "/consents")).json).toEqual([]);
    expect((await call("POST", "/consents/nope", { decision: "approved" })).status).toBe(404);
    expect((await call("POST", "/consents/nope", { decision: "maybe" })).status).toBe(400);
  });

  it("turns the kill switch on and off; while on, sending is refused (409)", async () => {
    const { call } = setup();
    expect((await call("GET", "/kill-switch")).json).toEqual({ engaged: false });
    expect((await call("PUT", "/kill-switch", { engaged: true })).json).toEqual({ engaged: true });
    const s = await call("POST", "/agents/vesper/sessions", {});
    const refused = await call("POST", `/sessions/${s.json.id}/messages`, { text: "hi" });
    expect(refused.status).toBe(409);
    expect(refused.json.error).toMatch(/kill switch/);
    await call("PUT", "/kill-switch", { engaged: false });
    expect((await call("POST", `/sessions/${s.json.id}/messages`, { text: "hi" })).status).toBe(
      202,
    );
  });

  it("reports today's spend and each session's spend", async () => {
    const { call } = setup();
    const today = (await call("GET", "/spend")).json;
    expect(today).toEqual({
      day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      stationUsd: 0,
      agents: {},
      tokens: 0,
    });
    expect((await call("GET", "/spend?day=yesterday")).status).toBe(400);
    const s = await call("POST", "/agents/vesper/sessions", {});
    await call("POST", `/sessions/${s.json.id}/messages`, { text: "hi" });
    const detail = await untilSettled(call, s.json.id);
    expect(detail.spend).toMatchObject({ calls: 1, unpriced: 1, costUsd: 0 });
    expect(Object.keys(detail.runSpend)).toEqual([detail.runs[0]?.id]);
    const run = detail.runs[0]?.id ?? "";
    const tokens =
      (detail.runSpend[run]?.inputTokens ?? 0) + (detail.runSpend[run]?.outputTokens ?? 0);
    expect((await call("GET", "/spend")).json.tokens).toBe(tokens);
  });
});

describe("dispatch, steering, and activity", () => {
  it("runs a dispatch end to end with the fake model and shows it on the lead's session", async () => {
    const { call } = setup();
    const s = await call("POST", "/agents/vesper/sessions", {});
    await call("POST", `/sessions/${s.json.id}/messages`, {
      text: 'use dispatch {"to":"quill","task":"Summarize the hub"}',
    });
    let detail: SessionDetail | undefined;
    for (let i = 0; i < 200; i++) {
      detail = (await call("GET", `/sessions/${s.json.id}`)).json as SessionDetail;
      if (detail.messages.some((m) => m.message.role === "report")) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(detail?.dispatches).toEqual([
      expect.objectContaining({
        workerAgentId: "quill",
        task: "Summarize the hub",
        status: "completed",
      }),
    ]);
    const report = detail?.messages.find((m) => m.message.role === "report")?.message;
    expect(report).toMatchObject({
      from: "quill",
      status: "completed",
      text: expect.stringContaining("Summarize the hub"),
    });
    // The worker's run is titled with its task, the lead's with its session title.
    const recent = (await call("GET", "/runs")).json as { agentId: string; title: string }[];
    expect(recent.find((r) => r.agentId === "quill")?.title).toBe("Summarize the hub");
    expect(recent.find((r) => r.agentId === "vesper")?.title).toBe(s.json.title);
  });

  it("GET /runs lists recent runs newest first, limited, and validates the limit", async () => {
    const { call } = setup();
    expect((await call("GET", "/runs")).json).toEqual([]);
    const s = await call("POST", "/agents/vesper/sessions", { title: "Plan the week" });
    const first = await call("POST", `/sessions/${s.json.id}/messages`, { text: "one" });
    await untilSettled(call, s.json.id);
    const second = await call("POST", `/sessions/${s.json.id}/messages`, { text: "two" });
    await untilSettled(call, s.json.id);
    const runs = (await call("GET", "/runs")).json as {
      id: string;
      title: string;
      state: string;
    }[];
    expect(runs.map((r) => r.id)).toEqual([second.json.runId, first.json.runId]);
    expect(runs[0]).toMatchObject({ title: "Plan the week", state: "completed" });
    expect((await call("GET", "/runs?limit=1")).json).toHaveLength(1);
    for (const bad of ["0", "201", "x", "1.5"]) {
      expect((await call("GET", `/runs?limit=${bad}`)).status).toBe(400);
    }
  });

  it("steers only a running run (409 otherwise, 404 unknown) and lists activity", async () => {
    const { call } = setup();
    expect((await call("POST", "/runs/nope/steer", { text: "x" })).status).toBe(404);
    const s = await call("POST", "/agents/vesper/sessions", {});
    const sent = await call("POST", `/sessions/${s.json.id}/messages`, { text: "hi" });
    const activity = (await call("GET", "/activity")).json;
    expect(activity.runs.map((r: { id: string }) => r.id)).toContain(sent.json.runId);
    await untilSettled(call, s.json.id);
    expect((await call("POST", `/runs/${sent.json.runId}/steer`, { text: "late" })).status).toBe(
      409,
    );
    expect((await call("GET", "/activity")).json).toEqual({
      runs: [],
      dispatches: [],
      crew: { vesper: expect.objectContaining({ state: "done", runs: 0, sessionId: s.json.id }) },
    });
  });
});

describe("settings", () => {
  it("reports the model mode, the machine's zone, and whether a key is configured, never the key", async () => {
    const { call } = setup();
    expect((await call("GET", "/settings")).json).toEqual({
      modelMode: "fake",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
