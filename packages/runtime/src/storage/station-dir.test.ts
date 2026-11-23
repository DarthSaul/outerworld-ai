import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig, StationConfig } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import {
  AGENT_DOCUMENTS,
  loadStationDir,
  saveAgentConfig,
  saveAgentDocument,
  saveStationConfig,
  stationPaths,
} from "./station-dir.js";

const station: StationConfig = {
  schemaVersion: 1,
  name: "Test Station",
  rooms: [{ id: "command", name: "Command", props: [{ kind: "web" }] }],
  lanes: [],
  connectors: [],
  budgets: { perTreeUsd: null },
  dispatch: { maxDepth: 1, maxRunsPerTree: 12, autoReview: true },
};

const overseer: AgentConfig = {
  schemaVersion: 1,
  name: "Vesper",
  roomId: "command",
  role: "overseer",
  model: "anthropic/claude-sonnet-5.5",
  approvalMode: "ask",
  connectorGrants: [],
  skills: [],
  schedules: [],
};

const home = () => mkdtempSync(join(tmpdir(), "ow-home-"));

const seed = async (h: string) => {
  await saveStationConfig(h, station);
  await saveAgentConfig(h, "vesper", overseer);
  await saveAgentDocument(h, "vesper", "identity", "# Vesper\n");
  await saveAgentDocument(h, "vesper", "purpose", "Lead the station.\n");
};

describe("station directory", () => {
  it("names the four agent documents from the brief", () => {
    expect(AGENT_DOCUMENTS).toEqual(["identity", "purpose", "standing-orders", "context"]);
  });

  it("round-trips station.json, agent.json, and documents through disk", async () => {
    const h = home();
    await seed(h);
    const loaded = await loadStationDir(h);
    expect(loaded.issues).toEqual([]);
    expect(loaded.station).toEqual(station);
    expect(loaded.agents).toEqual([
      {
        id: "vesper",
        config: overseer,
        documents: {
          identity: "# Vesper\n",
          purpose: "Lead the station.\n",
          "standing-orders": "",
          context: "",
        },
      },
    ]);
  });

  it("writes pretty JSON with a trailing newline, so files diff well by hand", async () => {
    const h = home();
    await saveStationConfig(h, station);
    const text = readFileSync(stationPaths(h).stationJson, "utf8");
    expect(text).toBe(`${JSON.stringify(station, null, 2)}\n`);
  });

  it("refuses to save an invalid station or agent and writes nothing", async () => {
    const h = home();
    await expect(saveStationConfig(h, { ...station, rooms: [] })).rejects.toThrow(/rooms/);
    await expect(saveAgentConfig(h, "Bad Id", overseer)).rejects.toThrow(/id/);
    await expect(saveAgentConfig(h, "ok", { ...overseer, model: "" })).rejects.toThrow(/model/);
    expect(() => readFileSync(stationPaths(h).stationJson)).toThrow();
  });

  it("reports a missing station.json as an error, not a throw", async () => {
    const loaded = await loadStationDir(home());
    expect(loaded.station).toBeUndefined();
    expect(loaded.stationFile).toBe("missing");
    expect(loaded.issues[0]).toMatchObject({ level: "error", path: "station.json" });
  });

  it("reports unreadable JSON with the file path, and that the file is there", async () => {
    const h = home();
    writeFileSync(join(h, "station.json"), "{ nope");
    const loaded = await loadStationDir(h);
    expect(loaded.station).toBeUndefined();
    expect(loaded.stationFile).toBe("present");
    expect(loaded.issues[0]).toMatchObject({ level: "error", path: "station.json" });
  });

  it("calls station.json unknown, never missing, when it cannot be checked", async () => {
    // A file where the station folder should be: every path under it fails with ENOTDIR.
    const h = join(home(), "not-a-folder");
    writeFileSync(h, "");
    const loaded = await loadStationDir(h);
    expect(loaded.station).toBeUndefined();
    expect(loaded.stationFile).toBe("unknown");
    expect(loaded.issues).toContainEqual({
      level: "error",
      path: "station.json",
      message: "cannot tell whether it is there: ENOTDIR",
    });
  });

  it("skips an invalid agent with an issue and still loads the rest", async () => {
    const h = home();
    await seed(h);
    mkdirSync(join(h, "agents", "broken"), { recursive: true });
    writeFileSync(join(h, "agents", "broken", "agent.json"), JSON.stringify({ name: "x" }));
    const loaded = await loadStationDir(h);
    expect(loaded.agents.map((a) => a.id)).toEqual(["vesper"]);
    expect(loaded.issues.some((i) => i.path.startsWith("agents/broken/agent.json"))).toBe(true);
  });

  const scout = (look: unknown) => ({
    ...overseer,
    name: "Scout",
    role: "crew",
    look,
    schedules: [{ id: "daily", cron: "0 9 * * *", prompt: "Go.", catchUp: false, enabled: true }],
  });

  it.each([
    ["a numeric look from before ADR-0021", 30, undefined],
    ["a look naming a deleted character", "rivet", "rivet"],
  ])("still loads an agent with %s, schedules intact, with a warning", async (_, look, kept) => {
    const h = home();
    await seed(h);
    mkdirSync(join(h, "agents", "scout"), { recursive: true });
    writeFileSync(join(h, "agents", "scout", "agent.json"), JSON.stringify(scout(look)));
    const loaded = await loadStationDir(h);
    const agent = loaded.agents.find((a) => a.id === "scout");
    expect(agent?.config.look).toBe(kept);
    expect(agent?.config.schedules.map((s) => s.id)).toEqual(["daily"]);
    expect(loaded.issues).toContainEqual(
      expect.objectContaining({ level: "warn", path: "agents/scout/agent.json.look" }),
    );
  });

  it("reports cross-file problems (an agent in an unknown room)", async () => {
    const h = home();
    await seed(h);
    await saveAgentConfig(h, "lost", { ...overseer, role: "crew", roomId: "attic" });
    const loaded = await loadStationDir(h);
    expect(loaded.issues.map((i) => i.path)).toContain("agents.lost.roomId");
  });

  it("ignores stray files in agents/ and does not follow a symlinked agent directory", async () => {
    const h = home();
    await seed(h);
    writeFileSync(join(h, "agents", ".DS_Store"), "");
    const outside = mkdtempSync(join(tmpdir(), "ow-outside-"));
    writeFileSync(join(outside, "agent.json"), JSON.stringify(overseer));
    symlinkSync(outside, join(h, "agents", "sneaky"));
    const loaded = await loadStationDir(h);
    expect(loaded.agents.map((a) => a.id)).toEqual(["vesper"]);
    expect(loaded.issues.map((i) => i.path)).toContain("agents/sneaky");
  });

  it("truncates an oversized document with a warning", async () => {
    const h = home();
    await seed(h);
    await saveAgentDocument(h, "vesper", "context", "x".repeat(300 * 1024));
    const loaded = await loadStationDir(h);
    expect(loaded.agents[0]?.documents.context).toHaveLength(256 * 1024);
    expect(loaded.issues).toContainEqual(
      expect.objectContaining({ level: "warn", path: "agents/vesper/context.md" }),
    );
  });

  it("reports an agent directory whose name is not an id, and a station.json it cannot read", async () => {
    const h = home();
    mkdirSync(join(h, "station.json"));
    mkdirSync(join(h, "agents", "Not An Id"), { recursive: true });
    writeFileSync(join(h, "agents", "notes.txt"), "");
    const loaded = await loadStationDir(h);
    expect(loaded.issues.map((i) => i.path)).toEqual(["station.json", "agents/Not An Id"]);
    expect(loaded.issues[0]?.message).not.toBe("missing");
  });

  it("refuses an agent document name outside the four documents", async () => {
    const h = home();
    await expect(
      saveAgentDocument(h, "vesper", "../../station" as "identity", "x"),
    ).rejects.toThrow(/document/);
    await expect(saveAgentDocument(h, "Bad", "identity", "x")).rejects.toThrow(/id/);
  });

  it("lays out the directory from brief §9", () => {
    const p = stationPaths("/h");
    expect(p).toMatchObject({
      stationJson: "/h/station.json",
      agentsDir: "/h/agents",
      workspacesDir: "/h/workspaces",
      database: "/h/station.db",
      logsDir: "/h/logs",
      token: "/h/daemon.token",
    });
    expect(p.agentDir("pm")).toBe("/h/agents/pm");
  });
});
