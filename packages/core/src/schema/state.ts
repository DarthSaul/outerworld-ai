import { z } from "zod";
import { Id, type Result, SchemaVersion, Timestamp, toResult, versionIssues } from "./common.js";
import { AgentRunState, GrantUse, LedgerChange, OverseerState, RunOutcome } from "./status.js";

export const Health = z.enum(["ok", "attention", "stalled"]);

export const IssueSchema = z.looseObject({
  level: z.enum(["warn", "error"]),
  path: z.string(),
  message: z.string(),
});

/** The parts of a RunRecord the dashboard shows. */
export const RunSummary = z.looseObject({
  startedAt: Timestamp,
  endedAt: Timestamp.optional(),
  outcome: RunOutcome.optional(),
  sessionUrl: z.url().optional(),
  grantsUsed: z.array(GrantUse),
  ledger: LedgerChange,
  error: z.string().optional(),
});

export const LedgerSections = z.looseObject({
  nextSteps: z.array(z.string()),
  waitingOn: z.array(z.string()),
  log: z.array(z.string()),
});

export const TeamState = z.looseObject({
  health: Health,
  healthReason: z.string().optional(),
  run: AgentRunState,
  lastRun: RunSummary.optional(),
  recentRuns: z.array(RunSummary).max(6),
  ledger: z.looseObject({
    path: z.string(),
    exists: z.boolean(),
    sections: LedgerSections.optional(),
    changedInLastRun: z.boolean(),
  }),
  degraded: z.boolean(),
});

export const AgentStateEntry = z.looseObject({ state: AgentRunState, note: z.string().optional() });

export const HandoffState = z.looseObject({ carrying: z.boolean() });

export const OverseerStateEntry = z.looseObject({
  state: OverseerState,
  lastRunStartedAt: Timestamp.optional(),
  lastOutwardPostAt: Timestamp.optional(),
  reconciled: z.number().int().nonnegative(),
  attention: z.array(z.looseObject({ teamId: Id, reason: z.string() })),
  digest: z.string().optional(),
});

/** Everything the dashboard renders. Derived from a ledger repo by `parseLedger`, never hand-written. */
export const StationState = z.looseObject({
  schemaVersion: SchemaVersion,
  provenance: z.looseObject({
    asOf: Timestamp,
    sourceRef: z.string().optional(),
    sourcePath: z.string(),
  }),
  teams: z.record(Id, TeamState),
  agents: z.record(Id, AgentStateEntry),
  handoffs: z.record(Id, HandoffState),
  overseer: OverseerStateEntry,
  issues: z.array(IssueSchema),
});

export type Health = z.infer<typeof Health>;
export type RunSummary = z.infer<typeof RunSummary>;
export type LedgerSections = z.infer<typeof LedgerSections>;
export type TeamState = z.infer<typeof TeamState>;
export type AgentStateEntry = z.infer<typeof AgentStateEntry>;
export type HandoffState = z.infer<typeof HandoffState>;
export type OverseerStateEntry = z.infer<typeof OverseerStateEntry>;
export type StationState = z.infer<typeof StationState>;

export function parseStationState(input: unknown): Result<StationState> {
  return toResult(StationState.safeParse(input), (s) => versionIssues(s.schemaVersion));
}
