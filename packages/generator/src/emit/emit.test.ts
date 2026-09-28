import { describe, expect, it } from "vitest";
import { GENERATED_AT, loadStation } from "../test/fixture.js";
import { type EmittedFile, emitLedger, protectedPaths } from "./index.js";

const station = loadStation();
const files = emitLedger(station, { generatedAt: GENERATED_AT });
const byPath = new Map(files.map((f) => [f.path, f.contents]));
const get = (p: string): string => {
  const c = byPath.get(p);
  if (c === undefined) throw new Error(`not emitted: ${p}`);
  return c;
};

describe("emitLedger", () => {
  it("emits the documented layout, sorted by path, with no duplicates", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual([
      "CLAUDE.md",
      "agents/builder.md",
      "agents/planner.md",
      "agents/scribe.md",
      "ledger/project-management.md",
      "ledger/strength-app.md",
      "routines/overseer.prompt.md",
      "routines/project-management.prompt.md",
      "routines/strength-app.prompt.md",
      "scripts/post-digest.sh",
      "skills/ledger/SKILL.md",
      "station.json",
      "status/README.md",
      "status/runs/.gitkeep",
      "status/teams/.gitkeep",
    ]);
  });

  it("is deterministic for the same station and generatedAt", () => {
    expect(emitLedger(station, { generatedAt: GENERATED_AT })).toEqual(files);
  });

  it("names the protected paths: station.json, ledger files, and everything under status/", () => {
    expect(protectedPaths(files).sort()).toEqual([
      "ledger/project-management.md",
      "ledger/strength-app.md",
      "station.json",
      "status/README.md",
      "status/runs/.gitkeep",
      "status/teams/.gitkeep",
    ]);
  });

  it("never emits a secret or a placeholder for one", () => {
    for (const f of files) {
      expect(f.contents, f.path).not.toMatch(/https:\/\/discord(app)?\.com\/api\/webhooks/);
      expect(f.contents, f.path).not.toMatch(/sk-ant-/);
      expect(f.contents, f.path).not.toMatch(/\bTODO\b/);
    }
  });

  it("station.json is the document, pretty-printed and unchanged", () => {
    expect(JSON.parse(get("station.json"))).toEqual(station);
    expect(get("station.json").endsWith("\n")).toBe(true);
  });

  it("each persona carries name, mandate, tone, allowlist, and rig", () => {
    const p = get("agents/planner.md");
    for (const s of [
      "Planner",
      "Turn every project's ledger",
      "Terse, decisive",
      "pm-notion-read",
      "pm-ledger-write",
      "tintHue",
      "230",
    ]) {
      expect(p).toContain(s);
    }
  });

  it("each station report skeleton carries the marker and the three fixed headings", () => {
    const l = get("ledger/strength-app.md");
    expect(l).toMatch(/<!-- ow:ledger v1 · team:strength-app -->/);
    for (const h of ["## Next steps", "## Waiting on", "## Log"]) expect(l).toContain(h);
  });

  it("the routine prompt carries the setup checklist from verified Routines facts", () => {
    const p = get("routines/strength-app.prompt.md");
    expect(p).toContain("claude.ai/code/routines");
    expect(p).toContain("/schedule");
    expect(p).toMatch(/every 360 minutes|every 6 hours/);
    expect(p).toContain("git");
    expect(p).toContain("notion");
    expect(p).toContain("discord");
    expect(p).toMatch(/remove (every|all) other connector/i);
    expect(p).toContain("example-user/strength-app");
    expect(p).toContain("ledger/strength-app.md");
    expect(p).toContain("ledger/project-management.md"); // inbound handoff it may read
    expect(p).toContain("status/runs/strength-app/");
    expect(p).toContain("CLAUDE_CODE_REMOTE_SESSION_ID");
    expect(p).toContain("git pull --rebase origin");
    expect(p).toContain("claude/status-<teamId>-<startedAt>");
    expect(p).not.toContain("Model:");
    expect(p).toMatch(/## If anything fails/);
    expect(p).toMatch(/inbound report is missing/);
    expect(p).toMatch(/newest first/);
    expect(p).toContain("`notes`");
    expect(p).toMatch(/sa-discord-write.*no agent holds it/);
    expect(p).not.toMatch(/sa-git-read.*no agent holds it/);
  });

  it("the overseer prompt names every station report, the digest, the script, and the env var", () => {
    const p = get("routines/overseer.prompt.md");
    expect(p).toContain("ledger/project-management.md");
    expect(p).toContain("ledger/strength-app.md");
    expect(p).toContain("status/digest.md");
    expect(p).toContain("status/overseer.json");
    expect(p).toContain("scripts/post-digest.sh");
    expect(p).toContain("DISCORD_WEBHOOK_URL");
    expect(p).toContain("discord.com");
    expect(p).toMatch(/every 720 minutes|every 12 hours/);
    expect(p).toMatch(/BEFORE posting/);
    expect(p).toMatch(/attention.*else.*reported.*else.*idle/s);
    expect(p).toContain('"<number of reports read>"');
  });

  it("CLAUDE.md carries the handoff table and the status contract", () => {
    const c = get("CLAUDE.md");
    expect(c).toContain("Strength App");
    expect(c).toContain("Project Management");
    expect(c).toMatch(/strength-app.*→.*project-management/);
    expect(c).toContain("status/teams/<teamId>.json");
    expect(c).toContain("schemaVersion");
    expect(c).toContain(GENERATED_AT);
    expect(c).toContain("notes");
  });

  it("the digest script reads the webhook from the environment and fails loudly without it", () => {
    const s = get("scripts/post-digest.sh");
    expect(s.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(s).toContain('"${DISCORD_WEBHOOK_URL');
    expect(s).toMatch(/set -euo pipefail/);
    expect(s).toContain("status/digest.md");
    expect(s).toMatch(/exit 1/);
    expect(s).toMatch(/command -v node/);
    expect(s).toMatch(/2000/);
    expect(s).not.toMatch(/slice\(/);
  });

  it("status/README.md is stamped with the schema version", () => {
    expect(get("status/README.md")).toMatch(/schemaVersion.*1/);
  });

  it.each(files.map((f: EmittedFile) => f.path))("%s matches its committed snapshot", async (p) => {
    await expect(get(p)).toMatchFileSnapshot(`__snapshots__/${p}.snap`);
  });
});
