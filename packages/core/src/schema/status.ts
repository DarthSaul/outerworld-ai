import { z } from "zod";
import {
  Id,
  type Issue,
  type Result,
  SchemaVersion,
  Timestamp,
  toResult,
  versionIssues,
} from "./common.js";

export const AgentRunState = z.enum(["idle", "working", "done", "failed"]);
export const RunOutcome = z.enum(["done", "failed"]);
export const OverseerState = z.enum(["idle", "reconciling", "reported", "attention"]);

export const AgentState = z.looseObject({
  agentId: Id,
  state: AgentRunState,
  note: z.string().optional(),
});

export const GrantUse = z.looseObject({ grantId: Id, count: z.number().int().nonnegative() });

export const LedgerChange = z.looseObject({
  changed: z.boolean(),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
  summary: z.string().optional(),
});

/** One run of a team's Routine: `status/runs/<teamId>/<startedAt>.json`. */
export const RunRecord = z.looseObject({
  schemaVersion: SchemaVersion,
  teamId: Id,
  startedAt: Timestamp,
  endedAt: Timestamp.optional(),
  outcome: RunOutcome.optional(),
  sessionId: z.string().optional(),
  sessionUrl: z.url().optional(),
  agents: z.array(AgentState),
  grantsUsed: z.array(GrantUse),
  ledger: LedgerChange,
  error: z.string().optional(),
  notes: z.string().optional(),
});

/** Latest state of a team: `status/teams/<teamId>.json`. */
export const TeamStatus = z.looseObject({
  schemaVersion: SchemaVersion,
  teamId: Id,
  updatedAt: Timestamp,
  lastRunStartedAt: Timestamp.optional(),
  agents: z.array(AgentState),
  ledgerPath: z.string().min(1),
});

/** `status/overseer.json`. */
export const OverseerStatus = z.looseObject({
  schemaVersion: SchemaVersion,
  updatedAt: Timestamp,
  state: OverseerState,
  lastRunStartedAt: Timestamp.optional(),
  lastOutwardPostAt: Timestamp.optional(),
  reconciled: z.number().int().nonnegative(),
  attention: z.array(z.looseObject({ teamId: Id, reason: z.string() })),
  digestPath: z.string().min(1),
});

export type AgentRunState = z.infer<typeof AgentRunState>;
export type RunOutcome = z.infer<typeof RunOutcome>;
export type OverseerState = z.infer<typeof OverseerState>;
export type AgentState = z.infer<typeof AgentState>;
export type GrantUse = z.infer<typeof GrantUse>;
export type LedgerChange = z.infer<typeof LedgerChange>;
export type RunRecord = z.infer<typeof RunRecord>;
export type TeamStatus = z.infer<typeof TeamStatus>;
export type OverseerStatus = z.infer<typeof OverseerStatus>;

export function runRecordIssues(run: RunRecord): Issue[] {
  const issues: Issue[] = [...versionIssues(run.schemaVersion)];
  if (run.outcome !== undefined && run.endedAt === undefined) {
    issues.push({
      level: "error",
      path: "endedAt",
      message: "a run with an outcome must have endedAt",
    });
  }
  if (run.outcome === "failed" && !run.error) {
    issues.push({ level: "error", path: "error", message: "a failed run must say why" });
  }
  if (run.endedAt !== undefined && Date.parse(run.endedAt) < Date.parse(run.startedAt)) {
    issues.push({ level: "error", path: "endedAt", message: "endedAt is before startedAt" });
  }
  return issues;
}

export function parseRunRecord(input: unknown): Result<RunRecord> {
  return toResult(RunRecord.safeParse(input), runRecordIssues);
}

export function parseTeamStatus(input: unknown): Result<TeamStatus> {
  return toResult(TeamStatus.safeParse(input), (s) => versionIssues(s.schemaVersion));
}

export function parseOverseerStatus(input: unknown): Result<OverseerStatus> {
  return toResult(OverseerStatus.safeParse(input), (s) => versionIssues(s.schemaVersion));
}
