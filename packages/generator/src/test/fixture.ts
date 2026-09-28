import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStation, type Station } from "@darthsaul/outerworld-ai-core";

/** Test-only: the demo Station. Production code never reads the disk outside the CLI. */
const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_STATION_PATH = join(
  here,
  "..",
  "..",
  "..",
  "..",
  "fixtures",
  "demo-station",
  "station.json",
);
export const GENERATED_AT = "2026-09-27T15:00:00Z";

export function loadStation(): Station {
  const parsed = parseStation(JSON.parse(readFileSync(FIXTURE_STATION_PATH, "utf8")));
  if (!parsed.ok) throw new Error(`fixture invalid: ${JSON.stringify(parsed.issues)}`);
  return parsed.value;
}
