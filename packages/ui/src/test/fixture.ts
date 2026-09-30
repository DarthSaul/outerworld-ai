import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type LedgerFiles,
  parseLedger,
  parseStation,
  type Station,
  type StationState,
} from "@darthsaul/outerworld-ai-core";

/** Test-only loader for fixtures/map-demo. Production code never reads the disk from ui. */
const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "..", "..", "..", "fixtures", "map-demo");
export const FIXTURE_AS_OF = "2026-09-27T15:00:00Z";

function walk(dir: string, root = dir): LedgerFiles {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(out, walk(full, root));
    else out[relative(root, full)] = readFileSync(full, "utf8");
  }
  return out;
}

export function loadFixture(): { station: Station; state: StationState } {
  const parsed = parseStation(JSON.parse(readFileSync(join(fixtureDir, "station.json"), "utf8")));
  if (!parsed.ok) throw new Error(`fixture invalid: ${JSON.stringify(parsed.issues)}`);
  const state = parseLedger(parsed.value, walk(join(fixtureDir, "ledger")), {
    now: FIXTURE_AS_OF,
    sourcePath: "fixtures/map-demo/ledger",
    sourceRef: "a41f9c",
  });
  return { station: parsed.value, state };
}
