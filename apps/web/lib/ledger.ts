import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  type LedgerFiles,
  parseLedger,
  parseStation,
  type Station,
  type StationState,
} from "@darthsaul/outerworld-ai-core";

/**
 * Server-only: reads a ledger repo from disk into core's in-memory file map. The path comes from
 * OUTERWORLD_LEDGER_PATH or falls back to the demo fixture. No network, ever (docs/PRIVACY.md).
 */
const FIXTURE_ROOT = resolve(process.cwd(), "..", "..", "fixtures", "demo-station");
const SKIP_DIRS = new Set([".git", "node_modules"]);

function walk(dir: string, root = dir): LedgerFiles {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(out, walk(full, root));
    else if (/\.(json|md)$/.test(name)) out[relative(root, full)] = readFileSync(full, "utf8");
  }
  return out;
}

export interface LoadedLedger {
  readonly station: Station;
  readonly state: StationState;
  readonly source: "fixture" | "ledger";
  readonly sourcePath: string;
}

export function loadLedger(options: { readonly now?: string } = {}): LoadedLedger {
  const custom = process.env.OUTERWORLD_LEDGER_PATH;
  const source = custom ? "ledger" : "fixture";
  // The fixture keeps station.json beside ledger/; a real ledger repo keeps both at its root.
  const stationPath = custom ? join(custom, "station.json") : join(FIXTURE_ROOT, "station.json");
  const ledgerRoot = custom ?? join(FIXTURE_ROOT, "ledger");
  const parsed = parseStation(JSON.parse(readFileSync(stationPath, "utf8")));
  if (!parsed.ok) {
    throw new Error(
      `station.json at ${stationPath} is invalid:\n${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("\n")}`,
    );
  }
  const state = parseLedger(parsed.value, walk(ledgerRoot), {
    now: options.now ?? new Date().toISOString(),
    sourcePath: ledgerRoot,
  });
  return { station: parsed.value, state, source, sourcePath: ledgerRoot };
}
