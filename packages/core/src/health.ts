import type { Health } from "./schema/state.js";

export interface HealthInputs {
  /** The latest run's start time and outcome, when any run exists. */
  readonly latest?:
    | {
        readonly startedAt: string;
        readonly outcome?: "done" | "failed" | undefined;
        readonly error?: string | undefined;
      }
    | undefined;
  /** Latest run older than twice the schedule interval, or a ledger with no run at all. */
  readonly stalled: boolean;
  /** Why the overseer flagged this team, when it did. */
  readonly overseerReason?: string | undefined;
  /** A status file for this team could not be read. */
  readonly malformed: boolean;
}

/**
 * One health derivation for the ledger parser and the event reducer (SCHEMA.md §3):
 * stalled > failed > overseer flag > malformed file > ok.
 */
export function deriveHealth(
  i: HealthInputs,
  intervalMinutes?: number,
): { health: Health; healthReason?: string } {
  if (i.stalled) {
    return {
      health: "stalled",
      healthReason: i.latest
        ? `no run since ${i.latest.startedAt}${intervalMinutes ? `; expected every ${intervalMinutes} min` : ""}`
        : "ledger exists but no run has been recorded",
    };
  }
  if (i.latest?.outcome === "failed") {
    return {
      health: "attention",
      healthReason: `last run failed: ${i.latest.error ?? "no error given"}`,
    };
  }
  if (i.overseerReason !== undefined)
    return { health: "attention", healthReason: `overseer: ${i.overseerReason}` };
  if (i.malformed)
    return { health: "attention", healthReason: "a status file for this team could not be read" };
  return { health: "ok" };
}

/** Own-property lookup that never reaches Object.prototype (ids like "constructor" are data, not keys). */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
