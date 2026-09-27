import { describe, expect, it } from "vitest";
import { parseOverseerStatus, parseRunRecord, parseTeamStatus } from "./status.js";

const openRun = () => ({
  schemaVersion: 1,
  teamId: "alpha",
  startedAt: "2026-09-27T14:00:04Z",
  agents: [{ agentId: "one", state: "working" }],
  grantsUsed: [{ grantId: "alpha-notion-read", count: 3 }],
  ledger: { changed: false, linesAdded: 0, linesRemoved: 0 },
});

describe("parseRunRecord", () => {
  it("accepts an open run with no end and no outcome", () => {
    const result = parseRunRecord(openRun());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endedAt).toBeUndefined();
    expect(result.value.outcome).toBeUndefined();
  });

  it("accepts a finished run with session links and a ledger summary", () => {
    const result = parseRunRecord({
      ...openRun(),
      endedAt: "2026-09-27T14:02:11Z",
      outcome: "done",
      sessionId: "cse_01ABC",
      sessionUrl: "https://claude.ai/code/session_01ABC",
      ledger: { changed: true, linesAdded: 2, linesRemoved: 0, summary: "2 lines changed" },
    });
    expect(result.ok).toBe(true);
  });

  it("requires endedAt when an outcome is present", () => {
    const result = parseRunRecord({ ...openRun(), outcome: "done" });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("endedAt");
  });

  it("requires an error message when the outcome is failed", () => {
    const result = parseRunRecord({
      ...openRun(),
      endedAt: "2026-09-27T14:02:11Z",
      outcome: "failed",
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("error");
  });

  it("rejects an end before the start", () => {
    const result = parseRunRecord({
      ...openRun(),
      endedAt: "2026-09-27T13:00:00Z",
      outcome: "done",
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toMatch(/before startedAt/);
  });

  it("rejects timestamps that are not ISO 8601", () => {
    const result = parseRunRecord({ ...openRun(), startedAt: "yesterday" });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("startedAt");
  });

  it("rejects an unknown agent state", () => {
    const result = parseRunRecord({
      ...openRun(),
      agents: [{ agentId: "one", state: "sleeping" }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("agents.0.state");
  });

  it("warns on a newer schema version but still reads the record", () => {
    const result = parseRunRecord({ ...openRun(), schemaVersion: 3 });
    expect(result.ok).toBe(true);
    expect(result.issues[0]?.level).toBe("warn");
  });
});

describe("parseTeamStatus", () => {
  it("accepts a status pointing at the last run", () => {
    const result = parseTeamStatus({
      schemaVersion: 1,
      teamId: "alpha",
      updatedAt: "2026-09-27T14:02:11Z",
      lastRunStartedAt: "2026-09-27T14:00:04Z",
      agents: [{ agentId: "one", state: "done" }],
      ledgerPath: "ledger/alpha.md",
    });
    expect(result.ok).toBe(true);
  });

  it("requires teamId, updatedAt, agents, and ledgerPath", () => {
    const result = parseTeamStatus({ schemaVersion: 1 });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.path).sort()).toEqual([
      "agents",
      "ledgerPath",
      "teamId",
      "updatedAt",
    ]);
  });
});

describe("parseOverseerStatus", () => {
  it("accepts a reported overseer with an attention list", () => {
    const result = parseOverseerStatus({
      schemaVersion: 1,
      updatedAt: "2026-09-27T14:03:00Z",
      state: "attention",
      lastRunStartedAt: "2026-09-27T14:02:30Z",
      lastOutwardPostAt: "2026-09-27T14:03:00Z",
      reconciled: 2,
      attention: [{ teamId: "beta", reason: "last run failed" }],
      digestPath: "status/digest.md",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown overseer state", () => {
    const result = parseOverseerStatus({
      schemaVersion: 1,
      updatedAt: "2026-09-27T14:03:00Z",
      state: "asleep",
      reconciled: 0,
      attention: [],
      digestPath: "status/digest.md",
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe("state");
  });
});
