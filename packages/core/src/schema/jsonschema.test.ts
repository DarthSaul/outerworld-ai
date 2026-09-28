import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JSON_SCHEMAS, jsonSchemaFor } from "./jsonschema.js";

const here = dirname(fileURLToPath(import.meta.url));
const committed = (name: string) =>
  JSON.parse(readFileSync(join(here, "..", "..", "schema", `${name}.schema.json`), "utf8"));

describe("JSON Schema export", () => {
  it("exports the five documents", () => {
    expect(Object.keys(JSON_SCHEMAS).sort()).toEqual(
      ["overseer-status", "run-record", "station", "station-state", "team-status"].sort(),
    );
  });

  it("produces draft 2020-12 schemas with an $id and a title", () => {
    const s = jsonSchemaFor("station") as Record<string, unknown>;
    expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(s.$id).toBe("https://outerworld.ai/schema/v1/station.schema.json");
    expect(s.title).toBe("Station");
  });

  it("keeps unknown properties allowed (additionalProperties is not false)", () => {
    const s = jsonSchemaFor("station") as { additionalProperties?: unknown };
    expect(s.additionalProperties).not.toBe(false);
  });

  it.each(Object.keys(JSON_SCHEMAS))("matches the committed %s.schema.json", (name) => {
    // Regenerate with: pnpm --filter @darthsaul/outerworld-ai-core exec node scripts/write-schemas.mjs
    expect(jsonSchemaFor(name as keyof typeof JSON_SCHEMAS)).toEqual(committed(name));
  });
});
