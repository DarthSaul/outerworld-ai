import { z } from "zod";
import {
  duplicateIdIssues,
  Id,
  type Issue,
  type Result,
  SchemaVersion,
  toResult,
  versionIssues,
} from "../schema/common.js";
import { Rig } from "../schema/station.js";
import { isSupportedModel } from "./models.js";

/**
 * `agents/<id>/agent.json` (brief §9): the config half of a crew member. The documents
 * (identity, purpose, standing orders, context) are markdown files beside it. The directory name
 * is the agent's id, so the id is not repeated here.
 */

/** The overseer holds the station-lead role and dispatch rights; everyone else is crew. */
export const AgentRole = z.enum(["overseer", "crew"]);

/** `ask` pauses write-class tool calls for consent (*Ask first*); `full` auto-approves (*Full power*). */
export const ApprovalMode = z.enum(["ask", "full"]);

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Five fields, or six with seconds. Full syntax is checked by the scheduler that runs it. */
const Cron = z
  .string()
  .refine((c) => [5, 6].includes(c.trim().split(/\s+/).length), "cron needs 5 or 6 fields");

export const Schedule = z.looseObject({
  id: Id,
  cron: Cron,
  timezone: z.string().refine(isTimeZone, "unknown time zone"),
  prompt: z.string().min(1),
  /** Session the run posts into; the runtime creates a per-schedule session when absent. */
  sessionId: z.string().min(1).optional(),
  catchUp: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export const AgentConfig = z.looseObject({
  schemaVersion: SchemaVersion,
  name: z.string().min(1),
  roomId: Id,
  role: AgentRole.default("crew"),
  model: z.string().min(1),
  approvalMode: ApprovalMode.default("ask"),
  /** Connector ids from station.json; granting one grants all of its tools (ADR-0012). */
  connectorGrants: z.array(Id).default([]),
  schedules: z.array(Schedule).default([]),
  rig: Rig.optional(),
});

export type AgentRole = z.infer<typeof AgentRole>;
export type ApprovalMode = z.infer<typeof ApprovalMode>;
export type Schedule = z.infer<typeof Schedule>;
export type AgentConfig = z.infer<typeof AgentConfig>;

/** Rules zod cannot express field by field. Pure; returns issues, never throws. */
export function agentConfigIssues(agent: AgentConfig): Issue[] {
  const issues: Issue[] = [
    ...versionIssues(agent.schemaVersion),
    ...duplicateIdIssues(agent.schedules, "schedules"),
  ];
  if (!isSupportedModel(agent.model)) {
    issues.push({
      level: "warn",
      path: "model",
      message: `"${agent.model}" is not on the supported model list; tool calling may not work`,
    });
  }
  const seen = new Set<string>();
  agent.connectorGrants.forEach((id, i) => {
    if (seen.has(id)) {
      issues.push({
        level: "error",
        path: `connectorGrants.${i}`,
        message: `connector "${id}" is granted twice`,
      });
    }
    seen.add(id);
  });
  if (agent.rig && agent.role !== "overseer") {
    if (agent.rig.head === "crest") {
      issues.push({
        level: "error",
        path: "rig.head",
        message: "crest is reserved for the overseer",
      });
    }
    if (agent.rig.trace === "frame") {
      issues.push({
        level: "error",
        path: "rig.trace",
        message: "frame is reserved for the overseer",
      });
    }
  }
  return issues;
}

/** Parses and validates one `agent.json`. Never throws. */
export function parseAgentConfig(input: unknown): Result<AgentConfig> {
  return toResult(AgentConfig.safeParse(input), agentConfigIssues);
}
