import { describe, expect, it } from "vitest";
import type { Station } from "../schema/station.js";
import { parseLedger, parseLedgerMarkdown } from "./parse.js";

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
      schedule: { kind: "interval", everyMinutes: 360 },
    },
    {
      id: "beta",
      name: "Beta",
      mission: "m",
      category: "build",
      emblem: { hue: 1, mark: "none" },
      scope: { repos: [] },
      schedule: { kind: "cron", expression: "0 * * * *", timezone: "UTC" },
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
      teamId: "beta",
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
  handoffs: [{ id: "alpha-to-beta", from: "alpha", to: "beta" }],
  overseer: {
    persona: { name: "M", mandate: "m", tone: "t" },
    schedule: { kind: "interval", everyMinutes: 60 },
    outward: { kind: "discord-webhook" },
  },
};

const NOW = "2026-09-27T15:00:00Z";
const json = (v: unknown) => JSON.stringify(v);
const run = (teamId: string, startedAt: string, extra: Record<string, unknown> = {}) =>
  json({
    schemaVersion: 1,
    teamId,
    startedAt,
    agents: [],
    grantsUsed: [],
    ledger: { changed: false, linesAdded: 0, linesRemoved: 0 },
    ...extra,
  });

const LEDGER = `# Alpha · ledger
<!-- ow:ledger v1 · team:alpha -->

## Next steps
- cut the release
- renew the domain

## Waiting on
- test results

## Log
- 2026-09-27T14:02:11Z · reconciled
`;

describe("parseLedgerMarkdown", () => {
  it("extracts the three fixed sections as bullet lists", () => {
    expect(parseLedgerMarkdown(LEDGER)).toEqual({
      nextSteps: ["cut the release", "renew the domain"],
      waitingOn: ["test results"],
      log: ["2026-09-27T14:02:11Z · reconciled"],
    });
  });

  it("returns empty lists for missing sections and ignores unknown headings", () => {
    expect(parseLedgerMarkdown("# x\n\n## Log\n- a\n\n## Notes\n- ignored\n")).toEqual({
      nextSteps: [],
      waitingOn: [],
      log: ["a"],
    });
  });

  it("returns undefined for text without the ledger marker", () => {
    expect(parseLedgerMarkdown("just some prose")).toBeUndefined();
  });
});

describe("parseLedger", () => {
  it("returns an empty, ok state with no issues when the ledger repo has no status files", () => {
    const s = parseLedger(station, {}, { now: NOW, sourcePath: "/l" });
    expect(s.teams.alpha?.health).toBe("ok");
    expect(s.teams.alpha?.run).toBe("idle");
    expect(s.teams.alpha?.ledger.exists).toBe(false);
    expect(s.issues).toEqual([]);
    expect(s.provenance.asOf).toBe(NOW);
  });

  it("reads a finished run into lastRun, recentRuns, agent state, and health ok", () => {
    const s = parseLedger(
      station,
      {
        "status/runs/alpha/2026-09-27T14-00-04Z.json": run("alpha", "2026-09-27T14:00:04Z", {
          endedAt: "2026-09-27T14:02:11Z",
          outcome: "done",
          agents: [{ agentId: "one", state: "done" }],
          grantsUsed: [{ grantId: "g", count: 3 }],
          ledger: { changed: true, linesAdded: 2, linesRemoved: 0 },
        }),
        "ledger/alpha.md": LEDGER,
      },
      { now: NOW, sourcePath: "/l", sourceRef: "a41f9c" },
    );
    const t = s.teams.alpha!;
    expect(t.run).toBe("done");
    expect(t.health).toBe("ok");
    expect(t.lastRun?.outcome).toBe("done");
    expect(t.recentRuns).toHaveLength(1);
    expect(t.ledger.exists).toBe(true);
    expect(t.ledger.changedInLastRun).toBe(true);
    expect(t.ledger.sections?.nextSteps).toHaveLength(2);
    expect(s.agents.one?.state).toBe("done");
    expect(s.handoffs["alpha-to-beta"]?.carrying).toBe(true);
    expect(s.provenance.sourceRef).toBe("a41f9c");
    expect(s.provenance.asOf).toBe("2026-09-27T14:02:11Z");
  });

  it("orders recent runs newest first and keeps six", () => {
    const files: Record<string, string> = {};
    for (let h = 0; h < 8; h++) {
      const at = `2026-09-27T0${h}:00:00Z`;
      files[`status/runs/alpha/${at.replace(/:/g, "-")}.json`] = run("alpha", at, {
        endedAt: at,
        outcome: "done",
      });
    }
    const s = parseLedger(station, files, { now: "2026-09-27T08:00:00Z", sourcePath: "/l" });
    expect(s.teams.alpha?.recentRuns).toHaveLength(6);
    expect(s.teams.alpha?.recentRuns[0]?.startedAt).toBe("2026-09-27T07:00:00Z");
  });

  it("marks a team working while its latest run is open and recent", () => {
    const s = parseLedger(
      station,
      {
        "status/runs/alpha/x.json": run("alpha", "2026-09-27T14:50:00Z", {
          agents: [{ agentId: "one", state: "working" }],
        }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.run).toBe("working");
    expect(s.agents.one?.state).toBe("working");
  });

  it("marks a team stalled when its latest run started more than twice the interval ago", () => {
    const s = parseLedger(
      station,
      {
        "status/runs/alpha/x.json": run("alpha", "2026-09-26T14:00:00Z", {
          endedAt: "2026-09-26T14:05:00Z",
          outcome: "done",
        }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.health).toBe("stalled");
    expect(s.teams.alpha?.healthReason).toMatch(/no run since/);
    expect(s.teams.alpha?.degraded).toBe(true);
  });

  it("marks an open run stalled, not working, when it is older than twice the interval", () => {
    const s = parseLedger(
      station,
      { "status/runs/alpha/x.json": run("alpha", "2026-09-26T14:00:00Z") },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.health).toBe("stalled");
    expect(s.teams.alpha?.run).not.toBe("working");
  });

  it("marks a team attention when its latest run failed, with the error", () => {
    const s = parseLedger(
      station,
      {
        "status/runs/alpha/x.json": run("alpha", "2026-09-27T14:00:00Z", {
          endedAt: "2026-09-27T14:01:00Z",
          outcome: "failed",
          error: "notion 502",
        }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.health).toBe("attention");
    expect(s.teams.alpha?.healthReason).toMatch(/notion 502/);
    expect(s.teams.alpha?.run).toBe("failed");
  });

  it("uses the gap between the two latest runs as the interval for cron schedules", () => {
    const files = {
      "status/runs/beta/a.json": run("beta", "2026-09-27T12:00:00Z", {
        endedAt: "2026-09-27T12:01:00Z",
        outcome: "done",
      }),
      "status/runs/beta/b.json": run("beta", "2026-09-27T13:00:00Z", {
        endedAt: "2026-09-27T13:01:00Z",
        outcome: "done",
      }),
    };
    expect(parseLedger(station, files, { now: NOW, sourcePath: "/l" }).teams.beta?.health).toBe(
      "ok",
    );
    expect(
      parseLedger(station, files, { now: "2026-09-27T15:30:00Z", sourcePath: "/l" }).teams.beta
        ?.health,
    ).toBe("stalled");
  });

  it("marks a team stalled when it has a ledger but no run at all", () => {
    const s = parseLedger(station, { "ledger/alpha.md": LEDGER }, { now: NOW, sourcePath: "/l" });
    expect(s.teams.alpha?.health).toBe("stalled");
  });

  it("records a malformed status file as an issue and marks the team attention, never throws", () => {
    const s = parseLedger(
      station,
      {
        "status/runs/alpha/bad.json": "{ not json",
        "status/teams/alpha.json": json({ schemaVersion: 1, teamId: "alpha" }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.health).toBe("attention");
    expect(s.issues.map((i) => i.path).sort()).toEqual([
      "status/runs/alpha/bad.json",
      "status/teams/alpha.json",
    ]);
    expect(s.issues.every((i) => i.level === "warn")).toBe(true);
  });

  it("ignores run files whose teamId is not in the station, with an issue", () => {
    const s = parseLedger(
      station,
      { "status/runs/ghost/x.json": run("ghost", NOW) },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.issues[0]?.message).toMatch(/unknown team/);
    expect(Object.keys(s.teams)).toEqual(["alpha", "beta"]);
  });

  it("reads overseer status and digest, and overseer attention marks the named team", () => {
    const s = parseLedger(
      station,
      {
        "status/overseer.json": json({
          schemaVersion: 1,
          updatedAt: "2026-09-27T14:03:00Z",
          state: "attention",
          lastOutwardPostAt: "2026-09-27T14:03:00Z",
          reconciled: 2,
          attention: [{ teamId: "beta", reason: "ledger empty" }],
          digestPath: "status/digest.md",
        }),
        "status/digest.md": "Meridian reconciled 2 ledgers · 1 needs attention",
        "status/runs/beta/x.json": run("beta", "2026-09-27T14:50:00Z", {
          endedAt: "2026-09-27T14:52:00Z",
          outcome: "done",
        }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.overseer.state).toBe("attention");
    expect(s.overseer.digest).toMatch(/reconciled 2/);
    expect(s.teams.beta?.health).toBe("attention");
    expect(s.teams.beta?.healthReason).toMatch(/ledger empty/);
  });

  it("prefers the team status file's agent states over the run's when it is newer", () => {
    const s = parseLedger(
      station,
      {
        "status/runs/alpha/x.json": run("alpha", "2026-09-27T14:50:00Z", {
          agents: [{ agentId: "one", state: "working" }],
        }),
        "status/teams/alpha.json": json({
          schemaVersion: 1,
          teamId: "alpha",
          updatedAt: "2026-09-27T14:55:00Z",
          lastRunStartedAt: "2026-09-27T14:50:00Z",
          agents: [{ agentId: "one", state: "done", note: "finished early" }],
          ledgerPath: "ledger/alpha.md",
        }),
      },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.agents.one).toEqual({ state: "done", note: "finished early" });
  });

  it("normalizes Windows path separators in the file map", () => {
    const s = parseLedger(
      station,
      { "status\\runs\\alpha\\x.json": run("alpha", "2026-09-27T14:50:00Z") },
      { now: NOW, sourcePath: "/l" },
    );
    expect(s.teams.alpha?.run).toBe("working");
  });
});
