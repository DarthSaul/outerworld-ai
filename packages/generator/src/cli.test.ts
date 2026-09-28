import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { FIXTURE_STATION_PATH, GENERATED_AT } from "./test/fixture.js";

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) };
}
const walk = (dir: string, root = dir): string[] =>
  readdirSync(dir).flatMap((n) =>
    statSync(join(dir, n)).isDirectory()
      ? walk(join(dir, n), root)
      : [relative(root, join(dir, n))],
  );
const tmp = () => mkdtempSync(join(tmpdir(), "ow-gen-"));

describe("outerworld generate", () => {
  it("writes the full layout into --out and exits 0", () => {
    const dir = tmp();
    const { out, stdout, stderr } = io();
    const code = runCli(
      ["generate", "--station", FIXTURE_STATION_PATH, "--out", dir, "--generated-at", GENERATED_AT],
      { stdout, stderr },
    );
    expect(code).toBe(0);
    expect(walk(dir).sort()).toContain("routines/overseer.prompt.md");
    expect(existsSync(join(dir, "status", "runs", ".gitkeep"))).toBe(true);
    expect(out.join("\n")).toMatch(/wrote 15 files/);
  });

  it("--dry-run lists files with sizes and writes nothing", () => {
    const dir = tmp();
    const { out, stdout, stderr } = io();
    const code = runCli(
      ["generate", "--station", FIXTURE_STATION_PATH, "--out", dir, "--dry-run"],
      { stdout, stderr },
    );
    expect(code).toBe(0);
    expect(walk(dir)).toEqual([]);
    expect(out.join("\n")).toMatch(/CLAUDE\.md\s+\d+ B/);
  });

  it("refuses to overwrite protected files unless --force, and regenerates the rest", () => {
    const dir = tmp();
    const q = io();
    runCli(
      ["generate", "--station", FIXTURE_STATION_PATH, "--out", dir, "--generated-at", GENERATED_AT],
      q,
    );
    writeFileSync(join(dir, "ledger", "strength-app.md"), "# my edits\n");
    writeFileSync(join(dir, "agents", "planner.md"), "stale\n");
    const second = io();
    const code = runCli(
      ["generate", "--station", FIXTURE_STATION_PATH, "--out", dir, "--generated-at", GENERATED_AT],
      second,
    );
    expect(code).toBe(0);
    expect(readFileSync(join(dir, "ledger", "strength-app.md"), "utf8")).toBe("# my edits\n");
    expect(readFileSync(join(dir, "agents", "planner.md"), "utf8")).not.toBe("stale\n");
    expect(second.out.join("\n")).toMatch(/kept 6 existing/);
    const forced = io();
    runCli(["generate", "--station", FIXTURE_STATION_PATH, "--out", dir, "--force"], forced);
    expect(readFileSync(join(dir, "ledger", "strength-app.md"), "utf8")).not.toBe("# my edits\n");
  });

  it("exits 1 with the issues when the station is invalid", () => {
    const dir = tmp();
    const bad = join(dir, "station.json");
    writeFileSync(
      bad,
      JSON.stringify({
        schemaVersion: 1,
        id: "x",
        name: "X",
        teams: [],
        agents: [],
        grants: [],
        handoffs: [],
      }),
    );
    const { err, stdout, stderr } = io();
    const code = runCli(["generate", "--station", bad, "--out", join(dir, "out")], {
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/teams/);
    expect(err.join("\n")).toMatch(/overseer/);
  });

  it("exits 2 when the station file cannot be read", () => {
    const { err, stdout, stderr } = io();
    const code = runCli(["generate", "--station", "/nonexistent/station.json", "--out", tmp()], {
      stdout,
      stderr,
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toMatch(/nonexistent/);
  });

  it("validate reports ok for the fixture and issues for a bad document", () => {
    const ok = io();
    expect(runCli(["validate", "--station", FIXTURE_STATION_PATH], ok)).toBe(0);
    expect(ok.out.join("\n")).toMatch(/valid/);
  });

  it("exits 1 when the station file is not JSON, or when --out is missing", () => {
    const dir = tmp();
    const bad = join(dir, "station.json");
    writeFileSync(bad, "{ not json");
    const a = io();
    expect(runCli(["generate", "--station", bad, "--out", dir], a)).toBe(1);
    expect(a.err.join("\n")).toMatch(/not valid JSON/);
    const b = io();
    expect(runCli(["generate", "--station", FIXTURE_STATION_PATH], b)).toBe(1);
    expect(b.err.join("\n")).toMatch(/--out/);
  });

  it("exits 2 when the output directory cannot be written", () => {
    const dir = tmp();
    const file = join(dir, "not-a-dir");
    writeFileSync(file, "x");
    const { err, stdout, stderr } = io();
    expect(
      runCli(["generate", "--station", FIXTURE_STATION_PATH, "--out", file], { stdout, stderr }),
    ).toBe(2);
    expect(err.join("\n")).toMatch(/cannot write/);
  });

  it("prints usage and exits 1 on unknown commands or missing flags", () => {
    const a = io();
    expect(runCli(["frobnicate"], a)).toBe(1);
    expect(a.err.join("\n")).toMatch(/usage/i);
    const b = io();
    expect(runCli(["generate", "--out", tmp()], b)).toBe(1);
    expect(b.err.join("\n")).toMatch(/--station/);
  });
});
