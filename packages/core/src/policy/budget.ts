import type { ApprovalMode } from "../config/agent-config.js";
import type { Budgets } from "../config/station-config.js";
import type { ToolClass } from "./grants.js";

/**
 * Budgets (brief §15, ADR-0024) are checked before every model call: per run, per dispatch tree
 * (a root run and every run descended from it), per agent per UTC day, and per station per UTC
 * day. A cap that is reached blocks the next call; 80% of a cap warns. Unset caps enforce
 * nothing. Pure.
 */
export const BUDGET_WARNING_SHARE = 0.8;

export type BudgetScope = "run" | "tree" | "agent" | "station";

export interface BudgetLine {
  readonly scope: BudgetScope;
  readonly spentUsd: number;
  readonly limitUsd: number;
}

export interface SpentSoFar {
  readonly run: number;
  /** The summed spend of the run's tree; absent for a call outside any run tree. */
  readonly tree?: number;
  readonly agentToday: number;
  readonly stationToday: number;
}

export interface BudgetCheck {
  /** The narrowest cap already reached, if any: the call must not happen. */
  readonly blocked?: BudgetLine;
  readonly warnings: readonly BudgetLine[];
}

/** Narrowest first: run, tree, agent, station. */
export function checkBudget(budgets: Partial<Budgets>, spent: SpentSoFar): BudgetCheck {
  const lines: Array<[BudgetScope, number | undefined, number | null | undefined]> = [
    ["run", spent.run, budgets.perRunUsd],
    ["tree", spent.tree, budgets.perTreeUsd],
    ["agent", spent.agentToday, budgets.perAgentDailyUsd],
    ["station", spent.stationToday, budgets.stationDailyUsd],
  ];
  const warnings: BudgetLine[] = [];
  for (const [scope, spentUsd, limitUsd] of lines) {
    if (limitUsd === undefined || limitUsd === null || spentUsd === undefined) continue;
    if (spentUsd >= limitUsd) return { blocked: { scope, spentUsd, limitUsd }, warnings };
    if (spentUsd >= limitUsd * BUDGET_WARNING_SHARE) warnings.push({ scope, spentUsd, limitUsd });
  }
  return { warnings };
}

/** Under *Ask first*, a write-class call waits for the Commander; nothing else does (brief §6). */
export function needsConsent(toolClass: ToolClass, approvalMode: ApprovalMode): boolean {
  return toolClass === "write" && approvalMode === "ask";
}

/**
 * The approval mode a run works under (ADR-0024): *Ask first* if any agent in its dispatch chain
 * (the run's own agent and every agent above it) is *Ask first*. A less trusted agent never gains
 * *Full power* by dispatching to one that has it.
 */
export function effectiveApprovalMode(chain: readonly ApprovalMode[]): ApprovalMode {
  return chain.length > 0 && chain.every((m) => m === "full") ? "full" : "ask";
}

/** The UTC calendar day (`YYYY-MM-DD`) that daily budgets and spend totals use. */
export function utcDay(at: Date | string): string {
  return (typeof at === "string" ? new Date(at) : at).toISOString().slice(0, 10);
}
