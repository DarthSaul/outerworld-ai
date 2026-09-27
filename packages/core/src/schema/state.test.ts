import { describe, expect, it } from "vitest";
import { parseStationState } from "./state.js";

const minimal = () => ({
  schemaVersion: 1,
  provenance: { asOf: "2026-09-27T14:02:11Z", sourcePath: "/ledger" },
  teams: {
    alpha: {
      health: "ok",
      run: "idle",
      recentRuns: [],
      ledger: { path: "ledger/alpha.md", exists: false, changedInLastRun: false },
      degraded: false,
    },
  },
  agents: { one: { state: "idle" } },
  handoffs: { "alpha-to-beta": { carrying: false } },
  overseer: { state: "idle", reconciled: 0, attention: [] },
  issues: [],
});

describe("parseStationState", () => {
  it("accepts a minimal derived state", () => {
    const result = parseStationState(minimal());
    expect(result.ok).toBe(true);
  });

  it("accepts a team with a last run, ledger sections, and an issue list", () => {
    const doc = minimal();
    doc.teams.alpha = {
      health: "attention",
      healthReason: "last run failed",
      run: "failed",
      lastRun: {
        startedAt: "2026-09-27T14:00:04Z",
        endedAt: "2026-09-27T14:02:11Z",
        outcome: "failed",
        grantsUsed: [],
        ledger: { changed: false, linesAdded: 0, linesRemoved: 0 },
        error: "connector timed out",
      },
      recentRuns: [],
      ledger: {
        path: "ledger/alpha.md",
        exists: true,
        sections: { nextSteps: ["a"], waitingOn: [], log: ["2026-09-27T14:02:11Z · ran"] },
        changedInLastRun: false,
      },
      degraded: true,
    } as typeof doc.teams.alpha;
    doc.issues = [{ level: "warn", path: "status/teams/beta.json", message: "malformed" }] as never;
    expect(parseStationState(doc).ok).toBe(true);
  });

  it("rejects an unknown health value", () => {
    const doc = minimal();
    doc.teams.alpha.health = "fine";
    const result = parseStationState(doc);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("teams.alpha.health");
  });

  it("caps recentRuns at six", () => {
    const doc = minimal();
    const run = {
      startedAt: "2026-09-27T14:00:04Z",
      grantsUsed: [],
      ledger: { changed: false, linesAdded: 0, linesRemoved: 0 },
    };
    (doc.teams.alpha as { recentRuns: unknown[] }).recentRuns = Array.from(
      { length: 7 },
      () => run,
    );
    const result = parseStationState(doc);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("teams.alpha.recentRuns");
  });
});
