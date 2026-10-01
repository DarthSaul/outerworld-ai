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

/**
 * `station.json` at the root of the station data directory (brief §9): rooms, the props placed in
 * them, lanes between rooms, installed connectors (never their secrets), budgets, and dispatch
 * policy. Human-editable; unknown fields are kept (ADR-0009).
 */

/** v1 props (brief §6). Each grants its room's crew a fixed set of built-in tools. */
export const PropKind = z.enum(["web", "files", "memory"]);

export const Prop = z.looseObject({ kind: PropKind });

export const Room = z.looseObject({
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  props: z.array(Prop).default([]),
});

export const Lane = z.looseObject({
  id: Id,
  from: Id,
  to: Id,
  note: z.string().optional(),
});

const HttpUrl = z.url({ protocol: /^https?$/ });

/**
 * How the daemon reaches a connector. Secrets (tokens, API keys) live in the OS keychain, so
 * there is deliberately no place for headers or environment values here.
 */
export const ConnectorTransport = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("http"), url: HttpUrl }),
  z.strictObject({
    type: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
  }),
]);

export const Connector = z.looseObject({
  id: Id,
  name: z.string().min(1),
  transport: ConnectorTransport,
});

const Usd = z.number().positive();

export const Budgets = z.looseObject({
  perRunUsd: Usd.optional(),
  perAgentDailyUsd: Usd.optional(),
  stationDailyUsd: Usd.optional(),
});

/**
 * Budgets a new station starts with (onboarding, D22). A station without budgets has no caps;
 * Settings says so plainly.
 */
export const DEFAULT_BUDGETS = {
  perRunUsd: 5,
  perAgentDailyUsd: 25,
  stationDailyUsd: 50,
} as const satisfies z.infer<typeof Budgets>;

/** v1 allows depth 1 at most (brief §7); 0 turns delegation off. */
export const DispatchPolicy = z.looseObject({
  maxDepth: z.number().int().min(0).max(1).default(1),
  autoReview: z.boolean().default(true),
});

export const StationConfig = z.looseObject({
  schemaVersion: SchemaVersion,
  name: z.string().min(1),
  rooms: z.array(Room).min(1),
  lanes: z.array(Lane).default([]),
  connectors: z.array(Connector).default([]),
  budgets: Budgets.default({}),
  dispatch: DispatchPolicy.default({ maxDepth: 1, autoReview: true }),
});

export type PropKind = z.infer<typeof PropKind>;
export type Prop = z.infer<typeof Prop>;
export type Room = z.infer<typeof Room>;
export type Lane = z.infer<typeof Lane>;
export type ConnectorTransport = z.infer<typeof ConnectorTransport>;
export type Connector = z.infer<typeof Connector>;
export type Budgets = z.infer<typeof Budgets>;
export type DispatchPolicy = z.infer<typeof DispatchPolicy>;
export type StationConfig = z.infer<typeof StationConfig>;

/** Rules zod cannot express field by field. Pure; returns issues, never throws. */
export function stationConfigIssues(station: StationConfig): Issue[] {
  const issues: Issue[] = [
    ...versionIssues(station.schemaVersion),
    ...duplicateIdIssues(station.rooms, "rooms"),
    ...duplicateIdIssues(station.lanes, "lanes"),
    ...duplicateIdIssues(station.connectors, "connectors"),
  ];

  station.rooms.forEach((room, i) => {
    const seen = new Set<string>();
    room.props.forEach((prop, j) => {
      if (seen.has(prop.kind)) {
        issues.push({
          level: "error",
          path: `rooms.${i}.props.${j}`,
          message: `prop "${prop.kind}" is already placed in room "${room.id}"`,
        });
      }
      seen.add(prop.kind);
    });
  });

  const roomIds = new Set(station.rooms.map((r) => r.id));
  const directions = new Set<string>();
  station.lanes.forEach((lane, i) => {
    for (const end of ["from", "to"] as const) {
      if (!roomIds.has(lane[end])) {
        issues.push({
          level: "error",
          path: `lanes.${i}.${end}`,
          message: `unknown room "${lane[end]}"`,
        });
      }
    }
    if (lane.from === lane.to) {
      issues.push({
        level: "error",
        path: `lanes.${i}`,
        message: "a lane cannot loop to its room",
      });
    }
    const direction = `${lane.from}→${lane.to}`;
    if (directions.has(direction)) {
      issues.push({ level: "error", path: `lanes.${i}`, message: `duplicate lane ${direction}` });
    }
    directions.add(direction);
  });

  return issues;
}

/** Parses and validates `station.json`. Never throws. */
export function parseStationConfig(input: unknown): Result<StationConfig> {
  return toResult(StationConfig.safeParse(input), stationConfigIssues);
}
