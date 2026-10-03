import { describe, expect, it } from "vitest";
import { RUN_STATES } from "../run/run-state.js";
import {
  alertCount,
  crewDisplayStatus,
  initials,
  isLive,
  RUN_DISPLAY_STATUSES,
  runDisplayStatus,
  sortRuns,
} from "./status.js";

describe("runDisplayStatus", () => {
  it("maps every run state as ADR-0013 #3 says", () => {
    expect(Object.fromEntries(RUN_STATES.map((s) => [s, runDisplayStatus(s)]))).toEqual({
      queued: "queued",
      running: "running",
      awaiting_consent: "blocked",
      blocked_budget: "blocked",
      cancelled: "halted",
      interrupted: "halted",
      completed: "done",
      failed: "failed",
    });
  });

  it("only produces known display statuses", () => {
    for (const s of RUN_STATES) expect(RUN_DISPLAY_STATUSES).toContain(runDisplayStatus(s));
  });
});

describe("crewDisplayStatus", () => {
  it.each([
    [{ state: "running", runs: 1 }, "active"],
    [{ state: "awaiting_consent", runs: 1 }, "blocked"],
    [{ state: "blocked", runs: 0, detail: "budget" }, "blocked"],
    [{ state: "blocked", runs: 0, detail: "kill_switch" }, "halted"],
    [{ state: "failed", runs: 0 }, "failed"],
    [{ state: "done", runs: 0 }, "idle"],
    [{ state: "idle", runs: 0 }, "idle"],
  ] as const)("%o is %s", (activity, status) => {
    expect(crewDisplayStatus(activity)).toBe(status);
  });
});

describe("sortRuns", () => {
  it("puts blocked first, done last, newest first within a status", () => {
    const run = (id: string, state: (typeof RUN_STATES)[number], createdAt: string) => ({
      id,
      state,
      createdAt,
    });
    const sorted = sortRuns([
      run("done", "completed", "2026-10-01T10:00:00Z"),
      run("old-running", "running", "2026-10-01T09:00:00Z"),
      run("queued", "queued", "2026-10-01T11:00:00Z"),
      run("new-running", "running", "2026-10-01T12:00:00Z"),
      run("waiting", "awaiting_consent", "2026-10-01T08:00:00Z"),
      run("failed", "failed", "2026-10-01T08:30:00Z"),
    ]);
    expect(sorted.map((r) => r.id)).toEqual([
      "waiting",
      "new-running",
      "old-running",
      "queued",
      "failed",
      "done",
    ]);
  });
});

describe("counts", () => {
  it("counts queued, running and waiting runs as live", () => {
    expect(RUN_STATES.filter(isLive)).toEqual(["queued", "running", "awaiting_consent"]);
  });

  it("counts blocked crew plus memory proposals as alerts", () => {
    expect(alertCount(["blocked", "active", "blocked", "idle"], 2)).toBe(4);
    expect(alertCount([], 0)).toBe(0);
  });
});

describe("initials", () => {
  it("takes the first two letters, upper case, skipping punctuation", () => {
    expect(initials("Quill")).toBe("QU");
    expect(initials("dr. iso")).toBe("DR");
    expect(initials("Ålfrida")).toBe("ÅL");
    expect(initials("!!")).toBe("??");
  });
});
