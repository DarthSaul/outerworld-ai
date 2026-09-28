/** Regression tests from the milestone code review (core). */
import { describe, expect, it } from "vitest";
import { bindReducer, emptyState } from "./events.js";
import { parseLedger, parseLedgerMarkdown } from "./ledger/parse.js";
import type { Station } from "./schema/station.js";
import { parseStation } from "./schema/station.js";

const base = (): Station => ({
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
      schedule: { kind: "interval", everyMinutes: 360 },
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
  ],
  grants: [],
  handoffs: [],
  overseer: {
    persona: { name: "O", mandate: "m", tone: "t" },
    schedule: { kind: "interval", everyMinutes: 60 },
    outward: { kind: "discord-webhook" },
  },
});
const NOW = "2026-09-27T15:00:00Z";
const run = (teamId: string, startedAt: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    teamId,
    startedAt,
    agents: [],
    grantsUsed: [],
    ledger: { changed: false, linesAdded: 0, linesRemoved: 0 },
    ...extra,
  });

describe("prototype keys never reach object lookups", () => {
  it("parseLedgerMarkdown ignores headings that name Object.prototype members", () => {
    expect(
      parseLedgerMarkdown(
        "<!-- ow:ledger v1 -->\n## constructor\n- x\n## __proto__\n- y\n## Log\n- z\n",
      ),
    ).toEqual({ nextSteps: [], waitingOn: [], log: ["z"] });
  });

  it("parseStation rejects ids that are Object.prototype members", () => {
    const doc = base();
    doc.teams[0]!.id = "constructor";
    doc.agents[0]!.teamId = "constructor";
    expect(parseStation(doc).ok).toBe(false);
  });

  it("parseLedger reports a run file for team 'constructor' as unknown and touches no global", () => {
    const before = Object.keys(Object);
    const s = parseLedger(
      base(),
      { "status/runs/constructor/x.json": run("constructor", NOW) },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.issues.some((i) => /unknown team|invalid run record/.test(i.message))).toBe(true);
    expect(Object.keys(Object)).toEqual(before);
    expect((Object as unknown as { run?: unknown }).run).toBeUndefined();
  });

  it("applyEvent ignores events for 'constructor' and unknown agents, with an issue", () => {
    const station = base();
    const apply = bindReducer(station);
    const s0 = emptyState(station, { now: NOW, sourcePath: "demo" });
    const s1 = apply(s0, { type: "run.finished", teamId: "constructor", at: NOW, outcome: "done" });
    expect(s1.issues[0]?.message).toMatch(/unknown team/);
    expect((Object as unknown as { run?: unknown }).run).toBeUndefined();
    const s2 = apply(s0, {
      type: "agent.state",
      teamId: "alpha",
      agentId: "ghost",
      state: "done",
      at: NOW,
    });
    expect(s2.agents.ghost).toBeUndefined();
    expect(s2.issues[0]?.message).toMatch(/unknown agent/);
  });
});

describe("reducer and parser agree", () => {
  const station = base();
  const apply = bindReducer(station);

  it("finishing a parsed open run replaces it in recentRuns instead of adding a duplicate", () => {
    const parsed = parseLedger(
      station,
      { "status/runs/alpha/x.json": run("alpha", "2026-09-27T14:50:00Z") },
      { now: NOW, sourcePath: "/l" },
    );
    expect(parsed.teams.alpha?.recentRuns).toHaveLength(1);
    const done = apply(parsed, { type: "run.finished", teamId: "alpha", at: NOW, outcome: "done" });
    expect(done.teams.alpha?.recentRuns).toHaveLength(1);
    expect(done.teams.alpha?.recentRuns[0]).toMatchObject({
      startedAt: "2026-09-27T14:50:00Z",
      outcome: "done",
    });
  });

  it("a done run keeps overseer attention: health stays attention while the overseer flags the team", () => {
    const parsed = parseLedger(
      station,
      {
        "status/runs/alpha/x.json": run("alpha", "2026-09-27T14:50:00Z"),
        "status/overseer.json": JSON.stringify({
          schemaVersion: 1,
          updatedAt: NOW,
          state: "attention",
          reconciled: 1,
          attention: [{ teamId: "alpha", reason: "ledger empty" }],
          digestPath: "status/digest.md",
        }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(parsed.teams.alpha?.health).toBe("attention");
    const done = apply(parsed, { type: "run.finished", teamId: "alpha", at: NOW, outcome: "done" });
    expect(done.teams.alpha?.health).toBe("attention");
    expect(done.teams.alpha?.healthReason).toMatch(/overseer/);
  });
});

describe("parseLedger with an unreadable clock", () => {
  it("records an error issue and skips time-based health instead of reporting everything ok", () => {
    const s = parseLedger(
      base(),
      {
        "status/runs/alpha/x.json": run("alpha", "2026-09-26T10:00:00Z", {
          endedAt: "2026-09-26T10:01:00Z",
          outcome: "done",
        }),
      },
      { now: "yesterday", sourcePath: "/l" },
    );
    expect(s.issues.some((i) => i.level === "error" && /now/.test(i.message))).toBe(true);
    expect(s.teams.alpha?.health).not.toBe("ok");
  });

  it("attributes a run file to the team in its body and flags a folder mismatch", () => {
    const s = parseLedger(
      base(),
      { "status/runs/beta/x.json": run("alpha", "2026-09-27T14:50:00Z") },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.run).toBe("working");
    expect(s.issues.some((i) => /folder/.test(i.message))).toBe(true);
  });
});
