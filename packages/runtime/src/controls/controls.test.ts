import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionStore } from "../sessions/session-store.js";
import { openDatabase } from "../storage/database.js";
import { ConsentStore } from "./consent-store.js";
import { KillSwitch } from "./kill-switch.js";
import { SpendStore } from "./spend-store.js";

const withRun = () => {
  const db = openDatabase(":memory:");
  const sessions = new SessionStore(db);
  const s = sessions.createSession("quill", "Chat");
  const run = sessions.createRun({
    sessionId: s.id,
    agentId: "quill",
    trigger: "user",
    model: "m",
  });
  return { db, sessions, run, sessionId: s.id };
};

describe("ConsentStore", () => {
  it("creates a pending consent and decides it once", () => {
    const { db, run, sessionId } = withRun();
    const consents = new ConsentStore(db);
    const c = consents.create({
      runId: run.id,
      sessionId,
      agentId: "quill",
      toolCallId: "c1",
      tool: "write_file",
      input: { path: "a" },
    });
    expect(consents.pending().map((x) => x.id)).toEqual([c.id]);
    expect(consents.decide(c.id, "approved").status).toBe("approved");
    expect(() => consents.decide(c.id, "denied")).toThrow(/already approved/);
    expect(consents.pending()).toEqual([]);
    expect(consents.get(c.id)?.input).toEqual({ path: "a" });
  });

  it("expires what is still pending, for one run or all", () => {
    const { db, run, sessionId } = withRun();
    const consents = new ConsentStore(db);
    const a = consents.create({
      runId: run.id,
      sessionId,
      agentId: "quill",
      toolCallId: "c1",
      tool: "t",
      input: {},
    });
    expect(consents.expireForRun(run.id).map((x) => x.id)).toEqual([a.id]);
    expect(consents.get(a.id)?.status).toBe("expired");
    const b = consents.create({
      runId: run.id,
      sessionId,
      agentId: "quill",
      toolCallId: "c2",
      tool: "t",
      input: {},
    });
    expect(consents.expireAll().map((x) => x.id)).toEqual([b.id]);
    expect(() => consents.decide(b.id, "approved")).toThrow(/already expired/);
    expect(() => consents.decide("nope", "approved")).toThrow(/no consent/);
  });
});

describe("SpendStore", () => {
  it("records each model call and totals it per run, session, agent-day, and station-day", () => {
    const { db, run, sessionId } = withRun();
    const spend = new SpendStore(db);
    const base = {
      runId: run.id,
      sessionId,
      agentId: "quill",
      model: "m",
      inputTokens: 100,
      outputTokens: 20,
    };
    spend.record({ ...base, costUsd: 0.25, at: "2026-09-29T10:00:00.000Z" });
    spend.record({ ...base, costUsd: null, at: "2026-09-29T11:00:00.000Z" });
    spend.record({ ...base, costUsd: 0.5, agentId: "vesper", at: "2026-09-29T12:00:00.000Z" });
    spend.record({ ...base, costUsd: 1, at: "2026-09-30T00:00:01.000Z" });
    expect(spend.forRun(run.id)).toEqual({
      costUsd: 1.75,
      inputTokens: 400,
      outputTokens: 80,
      calls: 4,
      unpriced: 1,
    });
    expect(spend.agentDay("quill", "2026-09-29")).toBe(0.25);
    expect(spend.stationDay("2026-09-29")).toBe(0.75);
    expect(spend.forSession(sessionId).costUsd).toBe(1.75);
    expect(spend.byAgent("2026-09-29")).toEqual({ quill: 0.25, vesper: 0.5 });
    expect(spend.stationDayTotal("2026-09-29")).toEqual({
      costUsd: 0.75,
      inputTokens: 300,
      outputTokens: 60,
      calls: 3,
      unpriced: 1,
    });
  });

  it("is zero for nothing", () => {
    const { db } = withRun();
    expect(new SpendStore(db).forRun("none")).toEqual({
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      calls: 0,
      unpriced: 0,
    });
  });
});

describe("KillSwitch", () => {
  it("persists across a restart", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ow-ks-")), "station.db");
    const first = new KillSwitch(openDatabase(path));
    expect(first.engaged()).toBe(false);
    first.set(true);
    expect(new KillSwitch(openDatabase(path)).engaged()).toBe(true);
    first.set(false);
    expect(new KillSwitch(openDatabase(path)).engaged()).toBe(false);
  });
});
