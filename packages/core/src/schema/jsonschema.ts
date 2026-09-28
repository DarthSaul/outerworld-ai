import { z } from "zod";
import { SCHEMA_VERSION } from "./common.js";
import { StationState } from "./state.js";
import { Station } from "./station.js";
import { OverseerStatus, RunRecord, TeamStatus } from "./status.js";

const SCHEMA_BASE = "https://outerworld.ai/schema";

/** The documents that cross a boundary: written by users or Routines, read by this app. */
export const JSON_SCHEMAS = {
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
