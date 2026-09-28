import { describe, expect, it } from "vitest";
import { bindReducer, emptyState } from "./events.js";
import type { Station } from "./schema/station.js";

const station: Station = {
  schemaVersion: 1,
  id: "s",
  name: "S",
  teams: [
    {
      id: "alpha",
      name: "Alpha",
      mission: "m",
      category: "build",
      emblem: { hue: 1, mark: "none" },
      scope: { repos: [] },
      schedule: { kind: "interval", everyMinutes: 60 },
    },
    {
      id: "beta",
      name: "Beta",
      mission: "m",
      category: "build",
      emblem: { hue: 1, mark: "none" },
      scope: { repos: [] },
      schedule: { kind: "interval", everyMinutes: 60 },
    },
  ],
  agents: [
    {
      id: "one",
      teamId: "alpha",
      persona: {
        name: "1",
        mandate: "m",
        tone: "t",
        allowlist: [],
        rig: { tintHue: 0, trimHue: 0, head: "dome", trace: "core" },
      },
    },
    {
      id: "two",
      teamId: "alpha",
      persona: {
        name: "2",
        mandate: "m",
        tone: "t",
        allowlist: [],
        rig: { tintHue: 0, trimHue: 0, head: "dome", trace: "core" },
      },
    },
  ],
  grants: [],
  handoffs: [{ id: "a-b", from: "alpha", to: "beta" }],
  overseer: {
    persona: { name: "M", mandate: "m", tone: "t" },
    schedule: { kind: "interval", everyMinutes: 60 },
    outward: { kind: "discord-webhook" },
  },
};

const T0 = "2026-09-27T14:00:00Z";
const T1 = "2026-09-27T14:01:00Z";
const T2 = "2026-09-27T14:02:00Z";

describe("emptyState", () => {
  it("starts every team ok and idle, every agent idle, every handoff not carrying", () => {
    const s = emptyState(station, { now: T0, sourcePath: "demo" });
    expect(s.teams.alpha).toMatchObject({
      health: "ok",
      run: "idle",
      recentRuns: [],
      degraded: false,
    });
    expect(s.agents.one?.state).toBe("idle");
    expect(s.handoffs["a-b"]?.carrying).toBe(false);
    expect(s.overseer.state).toBe("idle");
    expect(s.provenance.asOf).toBe(T0);
    expect(s.issues).toEqual([]);
  });
});

describe("applyEvent", () => {
  const base = emptyState(station, { now: T0, sourcePath: "demo" });
  const applyEvent = bindReducer(station);

  it("returns a new object and leaves the input untouched", () => {
    const next = applyEvent(base, { type: "run.started", teamId: "alpha", at: T0 });
    expect(next).not.toBe(base);
    expect(base.teams.alpha?.run).toBe("idle");
  });

  it("run.started opens a run: team working, agents working, lastRun open", () => {
    const next = applyEvent(base, { type: "run.started", teamId: "alpha", at: T0 });
    expect(next.teams.alpha?.run).toBe("working");
    expect(next.teams.alpha?.lastRun?.startedAt).toBe(T0);
    expect(next.teams.alpha?.lastRun?.endedAt).toBeUndefined();
    expect(next.agents.one?.state).toBe("working");
    expect(next.agents.two?.state).toBe("working");
    expect(next.provenance.asOf).toBe(T0);
  });

  it("agent.state changes one agent only", () => {
    const next = applyEvent(applyEvent(base, { type: "run.started", teamId: "alpha", at: T0 }), {
      type: "agent.state",
      teamId: "alpha",
      agentId: "two",
      state: "done",
      at: T1,
    });
    expect(next.agents.two?.state).toBe("done");
    expect(next.agents.one?.state).toBe("working");
  });

  it("ledger.written marks the ledger changed and outbound handoffs carrying", () => {
    const next = applyEvent(applyEvent(base, { type: "run.started", teamId: "alpha", at: T0 }), {
      type: "ledger.written",
      teamId: "alpha",
      at: T1,
      linesAdded: 2,
      linesRemoved: 0,
    });
    expect(next.teams.alpha?.ledger.changedInLastRun).toBe(true);
    expect(next.teams.alpha?.lastRun?.ledger).toEqual({
      changed: true,
      linesAdded: 2,
      linesRemoved: 0,
    });
    expect(next.handoffs["a-b"]?.carrying).toBe(true);
  });

  it("run.finished done closes the run, marks agents done, pushes to recentRuns, health ok", () => {
    const next = applyEvent(applyEvent(base, { type: "run.started", teamId: "alpha", at: T0 }), {
      type: "run.finished",
      teamId: "alpha",
      at: T2,
      outcome: "done",
    });
    expect(next.teams.alpha?.run).toBe("done");
    expect(next.teams.alpha?.lastRun?.endedAt).toBe(T2);
    expect(next.teams.alpha?.recentRuns[0]?.outcome).toBe("done");
    expect(next.teams.alpha?.health).toBe("ok");
    expect(next.agents.one?.state).toBe("done");
  });

  it("run.finished failed marks agents failed and health attention with the error", () => {
    const next = applyEvent(applyEvent(base, { type: "run.started", teamId: "alpha", at: T0 }), {
      type: "run.finished",
      teamId: "alpha",
      at: T2,
      outcome: "failed",
      error: "boom",
    });
    expect(next.teams.alpha?.run).toBe("failed");
    expect(next.teams.alpha?.health).toBe("attention");
    expect(next.teams.alpha?.healthReason).toMatch(/boom/);
    expect(next.agents.one?.state).toBe("failed");
  });

  it("keeps at most six recent runs, newest first", () => {
    let s = base;
    for (let i = 0; i < 8; i++) {
      const at = `2026-09-2${Math.floor(i / 4) + 1}T0${i % 4}:00:00Z`;
      s = applyEvent(s, { type: "run.started", teamId: "alpha", at });
      s = applyEvent(s, { type: "run.finished", teamId: "alpha", at, outcome: "done" });
    }
    expect(s.teams.alpha?.recentRuns).toHaveLength(6);
    expect(s.teams.alpha?.recentRuns[0]?.startedAt).toBe("2026-09-22T03:00:00Z");
  });

  it("overseer.state and digest.posted update the overseer", () => {
    let s = applyEvent(base, { type: "overseer.state", state: "reconciling", at: T1 });
    expect(s.overseer.state).toBe("reconciling");
    s = applyEvent(s, { type: "digest.posted", at: T2 });
    expect(s.overseer.state).toBe("reported");
    expect(s.overseer.lastOutwardPostAt).toBe(T2);
  });

  it("ignores events for unknown teams and records an issue", () => {
    const next = applyEvent(base, { type: "run.started", teamId: "ghost", at: T0 });
    expect(next.teams.ghost).toBeUndefined();
    expect(next.issues[0]?.message).toMatch(/unknown team/);
  });
});
