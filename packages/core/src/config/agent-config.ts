import { z } from "zod";
import { characterById } from "../characters.js";
import {
  duplicateIdIssues,
  Id,
  type Issue,
  type Result,
  SchemaVersion,
  toResult,
  versionIssues,
} from "../schema/common.js";
import { isSupportedModel, ModelSettings } from "./models.js";

/**
 * `agents/<id>/agent.json` (brief §9): the config half of a crew member. The documents
 * (identity, purpose, standing orders, context) are markdown files beside it. The directory name
 * is the agent's id, so the id is not repeated here.
 */

/** The overseer holds the station-lead role and always has dispatch; everyone else is crew. */
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
  /** IANA time zone; absent means the machine's own zone where the daemon runs. */
  timezone: z.string().refine(isTimeZone, "unknown time zone").optional(),
  prompt: z.string().min(1),
  /** Session the run posts into; the runtime creates a per-schedule session when absent. */
  sessionId: z.string().min(1).optional(),
  catchUp: z.boolean().default(false),
  enabled: z.boolean().default(true),
  /** The job's own model, key, and reasoning level; absent means the crew member's (ADR-0016). */
  modelSettings: ModelSettings.optional(),
});

export const AgentConfig = z.looseObject({
  schemaVersion: SchemaVersion,
  name: z.string().min(1),
  roomId: Id,
  role: AgentRole.default("crew"),
  model: z.string().min(1),
  approvalMode: ApprovalMode.default("ask"),
  /**
   * Whether a crew member may hand work to others along its room and hallways (ADR-0024). The
   * Overseer always may; the flag is ignored for it. Absent means no.
   */
  canDispatch: z.boolean().optional(),
  /** Connector ids from station.json; granting one grants all of its tools (ADR-0012). */
  connectorGrants: z.array(Id).default([]),
  /** Skill ids this agent has on top of the station-wide ones; it only adds (ADR-0023). */
  skills: z.array(Id).default([]),
  schedules: z.array(Schedule).default([]),
  /** The id of the character this agent appears as, such as `"nova"` (ADR-0013, ADR-0021). */
  look: Id.optional(),
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
  if (agent.look !== undefined && !characterById(agent.look)) {
    issues.push({
      level: "warn",
      path: "look",
      message: `no character "${agent.look}"; the agent appears as its default character`,
    });
  }
  const twice = (ids: readonly string[], path: string, message: (id: string) => string) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) issues.push({ level: "error", path: `${path}.${i}`, message: message(id) });
      seen.add(id);
    });
  };
  twice(agent.connectorGrants, "connectorGrants", (id) => `connector "${id}" is granted twice`);
  twice(agent.skills, "skills", (id) => `skill "${id}" is listed twice`);
  return issues;
}

/** Parses and validates one `agent.json`. Never throws. */
export function parseAgentConfig(input: unknown): Result<AgentConfig> {
  return toResult(AgentConfig.safeParse(input), agentConfigIssues);
}
