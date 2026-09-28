import { z } from "zod";
import {
  duplicateIdIssues,
  Hue,
  Id,
  type Issue,
  type Result,
  SchemaVersion,
  toResult,
  versionIssues,
} from "./common.js";

/** Routines' minimum schedule interval, in minutes (docs: "The minimum interval is one hour"). */
export const MIN_SCHEDULE_MINUTES = 60;

export const TeamCategory = z.enum([
  "research",
  "build",
  "operations",
  "records",
  "coordination",
  "other",
]);
export const EmblemMark = z.enum(["spire", "forge", "dome", "archive", "beacon", "none"]);
export const GrantMode = z.enum(["read", "write"]);
export const GrantKind = z.enum(["connector", "skill"]);
export const RigHead = z.enum(["dome", "wedge", "crest"]);
export const RigTrace = z.enum(["core", "bar", "chevron", "split", "frame", "twin"]);

export const Schedule = z.discriminatedUnion("kind", [
  z.looseObject({
    kind: z.literal("interval"),
    everyMinutes: z.number().int().min(MIN_SCHEDULE_MINUTES),
  }),
  z.looseObject({
    kind: z.literal("cron"),
    expression: z.string().min(1),
    timezone: z.string().min(1),
  }),
]);

export const Team = z.looseObject({
  id: Id,
  name: z.string().min(1),
  mission: z.string().min(1),
  category: TeamCategory,
  emblem: z.looseObject({ hue: Hue, mark: EmblemMark }),
  scope: z.looseObject({ repos: z.array(z.string().min(1)) }),
  schedule: Schedule,
});

export const Grant = z.looseObject({
  id: Id,
  teamId: Id,
  tool: Id,
  mode: GrantMode,
  kind: GrantKind,
  label: z.string().min(1).optional(),
});

export const Rig = z.looseObject({
  tintHue: Hue,
  trimHue: Hue,
  head: RigHead,
  trace: RigTrace,
});

export const Persona = z.looseObject({
  name: z.string().min(1),
  mandate: z.string().min(1),
  tone: z.string().min(1),
  allowlist: z.array(Id),
  rig: Rig,
});

export const Agent = z.looseObject({ id: Id, teamId: Id, persona: Persona });

export const Handoff = z.looseObject({ id: Id, from: Id, to: Id, note: z.string().optional() });

export const Overseer = z.looseObject({
  persona: z.looseObject({
    name: z.string().min(1),
    mandate: z.string().min(1),
    tone: z.string().min(1),
  }),
  schedule: Schedule,
  outward: z.looseObject({ kind: z.literal("discord-webhook") }),
});

export const Station = z.looseObject({
  schemaVersion: SchemaVersion,
  id: Id,
  name: z.string().min(1),
  teams: z.array(Team).min(1),
  agents: z.array(Agent),
  grants: z.array(Grant),
  handoffs: z.array(Handoff),
  overseer: Overseer,
});

export type TeamCategory = z.infer<typeof TeamCategory>;
export type EmblemMark = z.infer<typeof EmblemMark>;
export type GrantMode = z.infer<typeof GrantMode>;
export type GrantKind = z.infer<typeof GrantKind>;
export type RigHead = z.infer<typeof RigHead>;
export type RigTrace = z.infer<typeof RigTrace>;
export type Schedule = z.infer<typeof Schedule>;
export type Team = z.infer<typeof Team>;
export type Grant = z.infer<typeof Grant>;
export type Rig = z.infer<typeof Rig>;
export type Persona = z.infer<typeof Persona>;
export type Agent = z.infer<typeof Agent>;
export type Handoff = z.infer<typeof Handoff>;
export type Overseer = z.infer<typeof Overseer>;
export type Station = z.infer<typeof Station>;

/** Rules zod cannot express field-by-field. Pure; returns issues, never throws. */
export function stationIssues(station: Station): Issue[] {
  const issues: Issue[] = [...versionIssues(station.schemaVersion)];
  const teamIds = new Set(station.teams.map((t) => t.id));
  const grantsByTeam = new Map<string, Set<string>>();
  for (const g of station.grants) {
    const set = grantsByTeam.get(g.teamId) ?? new Set<string>();
    set.add(g.id);
    grantsByTeam.set(g.teamId, set);
  }
  const unknownTeam = (path: string, id: string): Issue => ({
    level: "error",
    path,
    message: `unknown team "${id}"`,
  });

  issues.push(
    ...duplicateIdIssues(station.teams, "teams"),
    ...duplicateIdIssues(station.agents, "agents"),
    ...duplicateIdIssues(station.grants, "grants"),
    ...duplicateIdIssues(station.handoffs, "handoffs"),
  );

  station.grants.forEach((g, i) => {
    if (!teamIds.has(g.teamId)) issues.push(unknownTeam(`grants.${i}.teamId`, g.teamId));
  });

  station.agents.forEach((a, i) => {
    if (!teamIds.has(a.teamId)) issues.push(unknownTeam(`agents.${i}.teamId`, a.teamId));
    const allowed = grantsByTeam.get(a.teamId) ?? new Set<string>();
    a.persona.allowlist.forEach((grantId, j) => {
      if (!allowed.has(grantId)) {
        issues.push({
          level: "error",
          path: `agents.${i}.persona.allowlist.${j}`,
          message: `"${grantId}" is not a grant of team "${a.teamId}"`,
        });
      }
    });
    if (a.persona.rig.head === "crest") {
      issues.push({
        level: "error",
        path: `agents.${i}.persona.rig.head`,
        message: "crest is reserved for the overseer",
      });
    }
    if (a.persona.rig.trace === "frame") {
      issues.push({
        level: "error",
        path: `agents.${i}.persona.rig.trace`,
        message: "frame is reserved for the overseer",
      });
    }
  });

  const seenDirections = new Set<string>();
  station.handoffs.forEach((h, i) => {
    if (!teamIds.has(h.from)) issues.push(unknownTeam(`handoffs.${i}.from`, h.from));
    if (!teamIds.has(h.to)) issues.push(unknownTeam(`handoffs.${i}.to`, h.to));
    if (h.from === h.to) {
      issues.push({
        level: "error",
        path: `handoffs.${i}`,
        message: "a team cannot hand off to itself",
      });
    }
    const direction = `${h.from}→${h.to}`;
    if (seenDirections.has(direction)) {
      issues.push({
        level: "error",
        path: `handoffs.${i}`,
        message: `duplicate handoff ${direction}`,
      });
    }
    seenDirections.add(direction);
  });

  return issues;
}

/** Parses and validates a Station document. Never throws. */
export function parseStation(input: unknown): Result<Station> {
  return toResult(Station.safeParse(input), stationIssues);
}
