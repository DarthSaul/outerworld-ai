import type { ApprovalMode } from "../config/agent-config.js";
import type { Budgets } from "../config/station-config.js";
import type { ToolClass } from "./grants.js";

/**
 * Budgets (brief §15) are checked before every model call: per run, per agent per UTC day, and
 * per station per UTC day. A cap that is reached blocks the next call; 80% of a cap warns.
 * Unset caps enforce nothing. Pure.
 */
export const BUDGET_WARNING_SHARE = 0.8;

export type BudgetScope = "run" | "agent" | "station";

export interface BudgetLine {
  readonly scope: BudgetScope;
  readonly spentUsd: number;
  readonly limitUsd: number;
}

export interface SpentSoFar {
  readonly run: number;
  readonly agentToday: number;
  readonly stationToday: number;
}

export interface BudgetCheck {
  /** The narrowest cap already reached, if any: the call must not happen. */
  readonly blocked?: BudgetLine;
  readonly warnings: readonly BudgetLine[];
}

export function checkBudget(budgets: Budgets, spent: SpentSoFar): BudgetCheck {
  const lines: Array<[BudgetScope, number, number | undefined]> = [
    ["run", spent.run, budgets.perRunUsd],
    ["agent", spent.agentToday, budgets.perAgentDailyUsd],
    ["station", spent.stationToday, budgets.stationDailyUsd],
  ];
  const warnings: BudgetLine[] = [];
  for (const [scope, spentUsd, limitUsd] of lines) {
    if (limitUsd === undefined) continue;
    if (spentUsd >= limitUsd) return { blocked: { scope, spentUsd, limitUsd }, warnings };
    if (spentUsd >= limitUsd * BUDGET_WARNING_SHARE) warnings.push({ scope, spentUsd, limitUsd });
  }
  return { warnings };
}

/** Under *Ask first*, a write-class call waits for the Commander; nothing else does (brief §6). */
export function needsConsent(toolClass: ToolClass, approvalMode: ApprovalMode): boolean {
  return toolClass === "write" && approvalMode === "ask";
}

/** The UTC calendar day (`YYYY-MM-DD`) that daily budgets and spend totals use. */
export function utcDay(at: Date | string): string {
  return (typeof at === "string" ? new Date(at) : at).toISOString().slice(0, 10);
}
