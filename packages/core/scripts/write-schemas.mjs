#!/usr/bin/env node
// Regenerates packages/core/schema/*.schema.json from the zod source. Run after a schema change;
// the jsonschema test fails until the committed copies match. Requires `pnpm build` first.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSON_SCHEMAS, jsonSchemaFor } from "../dist/schema/jsonschema.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "schema");
mkdirSync(out, { recursive: true });
for (const name of Object.keys(JSON_SCHEMAS)) {
  const path = join(out, `${name}.schema.json`);
  writeFileSync(path, `${JSON.stringify(jsonSchemaFor(name), null, 2)}\n`);
  console.log(`wrote ${path}`);
}
