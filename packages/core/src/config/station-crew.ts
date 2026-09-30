import { Id, type Issue } from "../schema/common.js";
import type { AgentConfig } from "./agent-config.js";
import type { StationConfig } from "./station-config.js";

/** One crew member as loaded from disk: the directory name is the id. */
export interface CrewMember {
  readonly id: string;
  readonly config: AgentConfig;
}

/**
 * Rules that span station.json and every agent.json: each agent lives in a known room, is
 * granted only installed connectors, has a valid id, and there is at most one overseer.
 * Paths are `agents.<id>...`. Pure; returns issues, never throws.
 */
export function stationCrewIssues(station: StationConfig, crew: readonly CrewMember[]): Issue[] {
  const issues: Issue[] = [];
  const rooms = new Set(station.rooms.map((r) => r.id));
  const connectors = new Set(station.connectors.map((c) => c.id));
  let overseer: string | undefined;

  for (const { id, config } of crew) {
    const at = `agents.${id}`;
    if (!Id.safeParse(id).success) {
      issues.push({ level: "error", path: at, message: "agent id must be a lowercase kebab id" });
    }
    if (!rooms.has(config.roomId)) {
      issues.push({
        level: "error",
        path: `${at}.roomId`,
        message: `unknown room "${config.roomId}"`,
      });
    }
    config.connectorGrants.forEach((c, i) => {
      if (!connectors.has(c)) {
        issues.push({
          level: "error",
          path: `${at}.connectorGrants.${i}`,
          message: `connector "${c}" is not installed on this station`,
        });
      }
    });
    if (config.role === "overseer") {
      if (overseer !== undefined) {
        issues.push({
          level: "error",
          path: `${at}.role`,
          message: `"${overseer}" is already the overseer`,
        });
      } else overseer = id;
    }
  }
  return issues;
}
