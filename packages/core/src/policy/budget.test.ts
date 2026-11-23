import { describe, expect, it } from "vitest";
import {
  BUDGET_WARNING_SHARE,
  checkBudget,
  effectiveApprovalMode,
  needsConsent,
  utcDay,
} from "./budget.js";

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

describe("checkBudget for a dispatch tree (ADR-0024)", () => {
  const withTree = { ...budgets, perTreeUsd: 3 };
  const tree = (run: number, treeUsd: number, agentToday = 0, stationToday = 0) => ({
    run,
    tree: treeUsd,
    agentToday,
    stationToday,
  });

  it("blocks a call once the tree's summed spend reaches its cap", () => {
    expect(checkBudget(withTree, tree(0.1, 3)).blocked).toEqual({
      scope: "tree",
      spentUsd: 3,
      limitUsd: 3,
    });
  });

  it("orders tree after run and before agent and station", () => {
    expect(checkBudget(withTree, tree(2, 4, 6, 11)).blocked?.scope).toBe("run");
    expect(checkBudget(withTree, tree(0, 4, 6, 11)).blocked?.scope).toBe("tree");
    expect(checkBudget(withTree, tree(0, 0, 6, 11)).blocked?.scope).toBe("agent");
  });

  it("warns at 80% of the tree cap", () => {
    expect(checkBudget(withTree, tree(0, 2.5)).warnings).toEqual([
      { scope: "tree", spentUsd: 2.5, limitUsd: 3 },
    ]);
  });

  it("enforces no tree cap when it is null, or when the call is outside a tree", () => {
    expect(checkBudget({ ...budgets, perTreeUsd: null }, tree(0, 999))).toEqual({ warnings: [] });
    expect(checkBudget(withTree, spent(0, 0, 0))).toEqual({ warnings: [] });
  });

  it("still holds the per-run, per-agent and station caps for each run inside a tree", () => {
    // A worker's own run, its agent's day and the station's day count, whatever the tree spent.
    expect(checkBudget(withTree, tree(1, 1)).blocked?.scope).toBe("run");
    expect(checkBudget(withTree, tree(0, 1, 5)).blocked?.scope).toBe("agent");
    expect(checkBudget(withTree, tree(0, 1, 0, 10)).blocked?.scope).toBe("station");
  });
});

describe("effectiveApprovalMode", () => {
  it("is Full power only when every agent in the chain is Full power", () => {
    expect(effectiveApprovalMode(["full"])).toBe("full");
    expect(effectiveApprovalMode(["full", "full", "full"])).toBe("full");
  });

  it("is Ask first when any agent in the chain asks, wherever it sits", () => {
    expect(effectiveApprovalMode(["ask"])).toBe("ask");
    expect(effectiveApprovalMode(["full", "ask"])).toBe("ask");
    expect(effectiveApprovalMode(["ask", "full", "full"])).toBe("ask");
  });

  it("asks when it knows nothing about the chain", () => {
    expect(effectiveApprovalMode([])).toBe("ask");
  });
});

describe("utcDay", () => {
  it("names the UTC calendar day, whatever the local time zone", () => {
    expect(utcDay("2026-09-29T23:59:59.999Z")).toBe("2026-09-29");
    expect(utcDay("2026-09-30T00:00:00.000Z")).toBe("2026-09-30");
    expect(utcDay(new Date("2026-09-29T20:00:00-07:00"))).toBe("2026-09-30");
  });
});
