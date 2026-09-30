import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_AS_OF, loadFixture, loadLedger, MAX_FILE_BYTES } from "./ledger";

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
  it("renders what the generator emitted: every team present, stalled until its first run, skeleton sections parsed", async () => {
    const { emitLedger } = await import("@darthsaul/outerworld-ai-generator");
    const { readFileSync: read } = await import("node:fs");
    const { dirname } = await import("node:path");
    const fixture = JSON.parse(
      read(join(process.cwd(), "..", "..", "fixtures", "map-demo", "station.json"), "utf8"),
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

const minimalStation = () =>
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
  });

describe("loadLedger hardening", () => {
  it("skips symbolic links and oversized files, reporting each as an issue, and reads only ledger/ and status/", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-hard-"));
    mkdirSync(join(dir, "ledger"));
    mkdirSync(join(dir, "status", "teams"), { recursive: true });
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "station.json"), minimalStation());
    writeFileSync(
      join(dir, "ledger", "a.md"),
      "# A\n<!-- ow:ledger v1 · team:a -->\n\n## Log\n- ran\n",
    );
    writeFileSync(join(dir, "notes", "big.md"), "outside");
    writeFileSync(join(dir, "status", "huge.md"), "x".repeat(MAX_FILE_BYTES + 1));
    symlinkSync("/etc", join(dir, "status", "escape"));
    symlinkSync(join(dir, "ledger", "a.md"), join(dir, "status", "link.md"));
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    const l = loadLedger({ now: "2026-09-27T15:00:00Z" });
    expect(l.state.teams.a?.ledger.sections?.log).toEqual(["ran"]);
    const reasons = l.state.issues.map((i) => `${i.path}: ${i.message}`);
    expect(reasons.some((r) => r.startsWith("status/escape") && /symbolic/.test(r))).toBe(true);
    expect(reasons.some((r) => r.startsWith("status/link.md") && /symbolic/.test(r))).toBe(true);
    expect(reasons.some((r) => r.startsWith("status/huge.md") && /exceeds/.test(r))).toBe(true);
    expect(reasons.some((r) => r.includes("notes"))).toBe(false);
  });

  it("refuses a station.json that resolves outside the ledger root", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-out-"));
    const elsewhere = mkdtempSync(join(tmpdir(), "ow-elsewhere-"));
    writeFileSync(join(elsewhere, "station.json"), minimalStation());
    symlinkSync(join(elsewhere, "station.json"), join(dir, "station.json"));
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    expect(() => loadLedger()).toThrow(/outside the ledger root/);
  });

  it("names the path in a readable error when station.json is missing or not JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-missing-"));
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    expect(() => loadLedger()).toThrow(
      new RegExp(`cannot read station.json at .*${dir.split("/").pop()}`),
    );
    writeFileSync(join(dir, "station.json"), "{ nope");
    expect(() => loadLedger()).toThrow(/cannot read station.json/);
  });

  it("reads the short HEAD sha of a git checkout into the proof line", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-git-"));
    mkdirSync(join(dir, "ledger"));
    writeFileSync(join(dir, "station.json"), minimalStation());
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "."], { cwd: dir });
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"],
      { cwd: dir },
    );
    const sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    expect(loadLedger({ now: "2026-09-27T15:00:00Z" }).state.provenance.sourceRef).toBe(sha);
  });

  it("loadFixture ignores OUTERWORLD_LEDGER_PATH", () => {
    process.env.OUTERWORLD_LEDGER_PATH = mkdtempSync(join(tmpdir(), "ow-ignored-"));
    const l = loadFixture();
    expect(l.source).toBe("fixture");
    expect(l.station.id).toBe("demo-station");
  });
});
