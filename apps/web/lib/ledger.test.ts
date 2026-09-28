import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_AS_OF, loadLedger } from "./ledger";

const original = process.env.OUTERWORLD_LEDGER_PATH;
afterEach(() => {
  if (original === undefined) delete process.env.OUTERWORLD_LEDGER_PATH;
  else process.env.OUTERWORLD_LEDGER_PATH = original;
});

describe("loadLedger", () => {
  it("falls back to the demo fixture, evaluated at the fixture's own moment", () => {
    delete process.env.OUTERWORLD_LEDGER_PATH;
    const l = loadLedger();
    expect(l.source).toBe("fixture");
    expect(l.station.id).toBe("demo-station");
    expect(l.state.teams["project-management"]?.run).toBe("working");
    expect(l.state.teams["strength-app"]?.health).toBe("stalled");
    expect(l.now).toBe(FIXTURE_AS_OF);
    expect(l.state.issues).toEqual([]);
  });

  it("reads a real ledger repo from OUTERWORLD_LEDGER_PATH with station.json at its root", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-ledger-"));
    mkdirSync(join(dir, "ledger"));
    mkdirSync(join(dir, "status", "teams"), { recursive: true });
    writeFileSync(
      join(dir, "station.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "mine",
        name: "Mine",
        teams: [
          {
            id: "a",
            name: "A",
            mission: "m",
            category: "build",
            emblem: { hue: 1, mark: "none" },
            scope: { repos: [] },
            schedule: { kind: "interval", everyMinutes: 60 },
          },
        ],
        agents: [],
        grants: [],
        handoffs: [],
        overseer: {
          persona: { name: "O", mandate: "m", tone: "t" },
          schedule: { kind: "interval", everyMinutes: 60 },
          outward: { kind: "discord-webhook" },
        },
      }),
    );
    writeFileSync(
      join(dir, "ledger", "a.md"),
      "# A · ledger\n<!-- ow:ledger v1 · team:a -->\n\n## Next steps\n- x\n",
    );
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    const l = loadLedger({ now: "2026-09-27T15:00:00Z" });
    expect(l.source).toBe("ledger");
    expect(l.sourcePath).toBe(dir);
    expect(l.station.id).toBe("mine");
    expect(l.state.teams.a?.ledger.sections?.nextSteps).toEqual(["x"]);
    // A ledger with no run yet is stalled: the file exists but nothing has run.
    expect(l.state.teams.a?.health).toBe("stalled");
  });

  it("throws a readable error naming the issues when station.json is invalid", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-bad-"));
    writeFileSync(join(dir, "station.json"), JSON.stringify({ schemaVersion: 1, id: "x" }));
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    expect(() => loadLedger()).toThrow(/teams/);
  });
});

describe("loadLedger on a generated ledger repo", () => {
  it("renders what the generator emitted: every station present, stalled until its first run, skeleton sections parsed", async () => {
    const { emitLedger } = await import("@darthsaul/outerworld-ai-generator");
    const { readFileSync: read } = await import("node:fs");
    const { dirname } = await import("node:path");
    const fixture = JSON.parse(
      read(join(process.cwd(), "..", "..", "fixtures", "demo-station", "station.json"), "utf8"),
    );
    const dir = mkdtempSync(join(tmpdir(), "ow-generated-"));
    for (const f of emitLedger(fixture, { generatedAt: "2026-09-27T15:00:00Z" })) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.contents);
    }
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    const l = loadLedger({ now: "2026-09-27T15:00:00Z" });
    expect(l.source).toBe("ledger");
    expect(l.state.issues).toEqual([]);
    expect(Object.keys(l.state.teams).sort()).toEqual(["project-management", "strength-app"]);
    expect(l.state.teams["strength-app"]?.health).toBe("stalled");
    expect(l.state.teams["strength-app"]?.ledger.sections?.nextSteps).toEqual(["(nothing yet)"]);
    expect(l.state.overseer.state).toBe("idle");
  });
});
