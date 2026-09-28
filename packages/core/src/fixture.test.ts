import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type LedgerFiles, parseLedger } from "./ledger/parse.js";
import { parseStationState } from "./schema/state.js";
import { parseStation } from "./schema/station.js";

/** The fixture is the one dataset every test and screenshot uses. This test keeps it valid. */
const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "..", "..", "fixtures", "demo-station");
const AS_OF = "2026-09-27T15:00:00Z";

function walk(dir: string, root = dir): LedgerFiles {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(out, walk(full, root));
    else out[relative(root, full)] = readFileSync(full, "utf8");
  }
  return out;
}

describe("fixtures/demo-station", () => {
  const station = parseStation(JSON.parse(readFileSync(join(fixtureDir, "station.json"), "utf8")));

  it("station.json validates with no issues", () => {
    expect(station.ok).toBe(true);
    expect(station.issues).toEqual([]);
  });

  it("ledger/ parses into the documented states with no issues", () => {
    if (!station.ok) return;
    const state = parseLedger(station.value, walk(join(fixtureDir, "ledger")), {
      now: AS_OF,
      sourcePath: "fixtures/demo-station/ledger",
    });
    expect(state.issues).toEqual([]);
    expect(state.teams["project-management"]).toMatchObject({
      health: "ok",
      run: "working",
      degraded: false,
    });
    expect(state.teams["strength-app"]).toMatchObject({
      health: "stalled",
      run: "failed",
      degraded: true,
    });
    expect(state.agents).toEqual({
      planner: { state: "working", note: "prioritizing next steps" },
      scribe: { state: "idle" },
      builder: { state: "failed", note: "tests red, build not cut" },
    });
    expect(state.handoffs["strength-app-to-project-management"]?.carrying).toBe(true);
    expect(state.handoffs["project-management-to-strength-app"]?.carrying).toBe(false);
    expect(state.overseer.state).toBe("attention");
    expect(state.overseer.digest).toMatch(/Ultron reconciled 2/);
    expect(state.teams["project-management"]?.recentRuns).toHaveLength(3);
    expect(state.teams["project-management"]?.ledger.sections?.nextSteps).toHaveLength(2);
    expect(state.provenance.asOf).toBe("2026-09-27T14:03:00Z");
  });

  it("the derived state round-trips through the StationState schema", () => {
    if (!station.ok) return;
    const state = parseLedger(station.value, walk(join(fixtureDir, "ledger")), {
      now: AS_OF,
      sourcePath: "x",
    });
    const again = parseStationState(JSON.parse(JSON.stringify(state)));
    expect(again.ok).toBe(true);
    expect(again.issues).toEqual([]);
  });
});
