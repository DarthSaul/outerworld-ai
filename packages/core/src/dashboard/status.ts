import type { CrewActivityEntry } from "../run/crew-activity.js";
import type { RunState } from "../run/run-state.js";

/**
 * The dashboard's status words for runs and crew (ADR-0013 #3, #4), mapped from runtime state
 * only. Display text is in the glossary under `missionStatus.*` and `crewStatus.*`.
 */

export const RUN_DISPLAY_STATUSES = [
  "blocked",
  "running",
  "queued",
  "halted",
  "failed",
  "done",
] as const;
export type RunDisplayStatus = (typeof RUN_DISPLAY_STATUSES)[number];

export const CREW_DISPLAY_STATUSES = ["active", "idle", "blocked", "halted", "failed"] as const;
export type CrewDisplayStatus = (typeof CREW_DISPLAY_STATUSES)[number];

const RUN_STATUS: Readonly<Record<RunState, RunDisplayStatus>> = {
  queued: "queued",
  running: "running",
  awaiting_consent: "blocked",
  blocked_budget: "blocked",
  cancelled: "halted",
  interrupted: "halted",
  completed: "done",
  failed: "failed",
};

export function runDisplayStatus(state: RunState): RunDisplayStatus {
  return RUN_STATUS[state];
}

/**
 * A crew member's status from folded activity: running is active; waiting for consent or stopped
 * by a budget is blocked; stopped by the kill switch is halted; a failed last run is failed; a
 * finished or user-cancelled last run is idle.
 */
export function crewDisplayStatus(activity: CrewActivityEntry): CrewDisplayStatus {
  switch (activity.state) {
    case "running":
      return "active";
    case "awaiting_consent":
      return "blocked";
    case "blocked":
      return activity.detail === "kill_switch" ? "halted" : "blocked";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

/** The design's sort: blocked first, then running, queued, halted or failed, done last. */
const RUN_ORDER: Readonly<Record<RunDisplayStatus, number>> = {
  blocked: 0,
  running: 1,
  queued: 2,
  halted: 3,
  failed: 3,
  done: 4,
};

/** Sorts by status, then newest first within a status. Stable and pure. */
export function sortRuns<T extends { readonly state: RunState; readonly createdAt: string }>(
  runs: readonly T[],
): T[] {
  return [...runs].sort(
    (a, b) =>
      RUN_ORDER[runDisplayStatus(a.state)] - RUN_ORDER[runDisplayStatus(b.state)] ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

/** Live runs: queued, running, or waiting for consent (the TASKS LIVE count, #16). */
export function isLive(state: RunState): boolean {
  return state === "queued" || state === "running" || state === "awaiting_consent";
}

/**
 * Things waiting on the Commander (the ALERTS count, #16): every blocked crew member (a consent
 * waits on each one waiting for approval) plus memory proposals awaiting a decision. A pending
 * consent is not counted again, since its crew member is already blocked.
 */
export function alertCount(
  crew: readonly CrewDisplayStatus[],
  pendingMemoryProposals: number,
): number {
  return crew.filter((s) => s === "blocked").length + pendingMemoryProposals;
}

/** Initials for an avatar chip: the first two letters of the name, upper case. */
export function initials(name: string): string {
  return [...name.trim().replace(/[^\p{L}\p{N}]/gu, "")].slice(0, 2).join("").toUpperCase() || "??";
}
