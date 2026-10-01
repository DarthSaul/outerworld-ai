import { describe, expect, it } from "vitest";
import { BUDGET_WARNING_SHARE, checkBudget, needsConsent, utcDay } from "./budget.js";

const budgets = { perRunUsd: 1, perAgentDailyUsd: 5, stationDailyUsd: 10 };
const spent = (run: number, agentToday: number, stationToday: number) => ({
  run,
  agentToday,
  stationToday,
});

describe("checkBudget", () => {
  it("allows a call under every cap, with no warnings", () => {
    expect(checkBudget(budgets, spent(0.1, 1, 2))).toEqual({ warnings: [] });
  });

  it("blocks once a cap is reached, not only when it is passed", () => {
    expect(checkBudget(budgets, spent(1, 1, 2)).blocked).toEqual({
      scope: "run",
      spentUsd: 1,
      limitUsd: 1,
    });
  });

  it("reports the narrowest cap that blocks: run, then agent, then station", () => {
    expect(checkBudget(budgets, spent(2, 6, 11)).blocked?.scope).toBe("run");
    expect(checkBudget(budgets, spent(0, 6, 11)).blocked?.scope).toBe("agent");
    expect(checkBudget(budgets, spent(0, 0, 11)).blocked?.scope).toBe("station");
  });

  it("warns at 80% of a cap without blocking", () => {
    expect(BUDGET_WARNING_SHARE).toBe(0.8);
    const r = checkBudget(budgets, spent(0.85, 4.2, 2));
    expect(r.blocked).toBeUndefined();
    expect(r.warnings).toEqual([
      { scope: "run", spentUsd: 0.85, limitUsd: 1 },
      { scope: "agent", spentUsd: 4.2, limitUsd: 5 },
    ]);
  });

  it("enforces nothing a station leaves unset", () => {
    expect(checkBudget({}, spent(100, 100, 100))).toEqual({ warnings: [] });
    expect(checkBudget({ stationDailyUsd: 3 }, spent(100, 100, 1))).toEqual({ warnings: [] });
  });
});

describe("needsConsent", () => {
  it("pauses write-class calls under Ask first, and nothing else", () => {
    expect(needsConsent("write", "ask")).toBe(true);
    expect(needsConsent("read", "ask")).toBe(false);
    expect(needsConsent("write", "full")).toBe(false);
    expect(needsConsent("read", "full")).toBe(false);
  });
});

describe("utcDay", () => {
  it("names the UTC calendar day, whatever the local time zone", () => {
    expect(utcDay("2026-09-29T23:59:59.999Z")).toBe("2026-09-29");
    expect(utcDay("2026-09-30T00:00:00.000Z")).toBe("2026-09-30");
    expect(utcDay(new Date("2026-09-29T20:00:00-07:00"))).toBe("2026-09-30");
  });
});
