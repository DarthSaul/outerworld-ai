import { z } from "zod";
import { AgentConfig } from "../config/agent-config.js";
import { StationConfig } from "../config/station-config.js";
import { RuntimeEvent } from "../runtime-events.js";
import { SCHEMA_VERSION } from "./common.js";
import { StationState } from "./state.js";
import { Station } from "./station.js";
import { OverseerStatus, RunRecord, TeamStatus } from "./status.js";

const SCHEMA_BASE = "https://outerworld.ai/schema";

/** The documents that cross a boundary: station.json, agent.json, and the event stream; plus the milestone 1 map documents. */
export const JSON_SCHEMAS = {
  "station-config": { title: "StationConfig", schema: StationConfig },
  "agent-config": { title: "AgentConfig", schema: AgentConfig },
  "runtime-event": { title: "RuntimeEvent", schema: RuntimeEvent },
  station: { title: "Station", schema: Station },
  "run-record": { title: "RunRecord", schema: RunRecord },
  "team-status": { title: "TeamStatus", schema: TeamStatus },
  "overseer-status": { title: "OverseerStatus", schema: OverseerStatus },
  "station-state": { title: "StationState", schema: StationState },
} as const;

export type JsonSchemaName = keyof typeof JSON_SCHEMAS;

/**
 * Draft 2020-12 JSON Schema for one document, stamped with the schema version. The committed
 * copies under packages/core/schema/ are regenerated with scripts/write-schemas.mjs and a test
 * fails when they drift.
 */
export function jsonSchemaFor(name: JsonSchemaName): Record<string, unknown> {
  const { title, schema } = JSON_SCHEMAS[name];
  const generated = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${SCHEMA_BASE}/v${SCHEMA_VERSION}/${name}.schema.json`,
    title,
    ...generated,
  };
}
