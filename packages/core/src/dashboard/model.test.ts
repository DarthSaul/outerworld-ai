import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lookFor } from "../characters.js";
import { parseAgentConfig } from "../config/agent-config.js";
import { parseStationConfig } from "../config/station-config.js";
import { BRIDGE_RECT } from "./layout.js";
import { type DashboardInput, dashboardModel } from "./model.js";

const here = dirname(fileURLToPath(import.meta.url));
const home = join(here, "..", "..", "..", "..", "fixtures", "demo-station");
const read = (path: string) => JSON.parse(readFileSync(join(home, path), "utf8"));

const station = parseStationConfig(read("station.json"));
const agents = ["quill", "vesper", "wren"].map((id) => {
  const config = parseAgentConfig(read(`agents/${id}/agent.json`));
  if (!config.ok) throw new Error(id);
  return { id, config: config.value };
});
if (!station.ok) throw new Error("fixture station invalid");

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  station: station.value,
  agents,
  activity: {},
  runs: [],
  dispatches: [],
  activeRunCount: 0,
  pendingMemoryProposals: 0,
  ...over,
});

describe("dashboardModel on the demo station", () => {
  it("puts the Overseer's room (Command) on the Bridge and the others around it", () => {
    const d = dashboardModel(input());
    expect(d.bridgeId).toBe("command");
    expect(d.rooms.map((r) => [r.id, r.sector, r.bridge, r.colorIndex])).toEqual([
      ["command", "HQ", true, 0],
      ["operations", "A-1", false, 0],
      ["research", "B-1", false, 1],
    ]);
    expect(d.rooms[0]?.rect).toEqual(BRIDGE_RECT);
  });

  it("lists crew with the Overseer last, each with its look", () => {
    const d = dashboardModel(input());
    expect(d.crew.map((c) => [c.id, c.overseer, c.look])).toEqual([
      ["quill", false, lookFor("quill", undefined)],
      ["wren", false, 14],
      ["vesper", true, 3],
    ]);
    expect(d.overseer?.name).toBe("Vesper");
    expect(d.crew.every((c) => c.status === "idle")).toBe(true);
  });

  it("shows a room's props and the connectors its crew hold as placed objects", () => {
    const ops = dashboardModel(input()).rooms.find((r) => r.id === "operations");
    expect(ops?.grants).toEqual([
      { key: "prop:web", object: "object.web", real: { term: "prop.web" }, scope: "read" },
      { key: "prop:files", object: "object.files", real: { term: "prop.files" }, scope: "write" },
      { key: "prop:memory", object: "object.memory", real: { term: "prop.memory" }, scope: "read" },
      {
        key: "connector:notion",
        object: "object.connector",
        real: { name: "Notion" },
        scope: "write",
      },
    ]);
  });

  it("routes each hallway, labels it in order, and runs packets only for running dispatches", () => {
    const quiet = dashboardModel(input());
    expect(quiet.lanes.map((l) => [l.id, l.label, l.traffic, l.packetRoom])).toEqual([
      ["operations-to-command", "L-01", 0, "operations"],
      ["research-to-command", "L-02", 0, "research"],
    ]);
    expect(quiet.lanes.every((l) => l.route.length >= 2 && l.tag)).toBe(true);
    const busy = dashboardModel(
      input({ dispatches: [{ workerAgentId: "quill" }, { workerAgentId: "quill" }] }),
    );
    expect(busy.lanes.map((l) => l.traffic)).toEqual([2, 0]);
  });

  it("maps live activity to statuses, flags a blocked room, and counts alerts", () => {
    const d = dashboardModel(
      input({
        activity: {
          quill: { state: "awaiting_consent", runs: 1, sessionId: "s1" },
          wren: { state: "running", runs: 1 },
        },
        activeRunCount: 2,
        pendingMemoryProposals: 1,
      }),
    );
    expect(d.crew.map((c) => c.status)).toEqual(["blocked", "active", "idle"]);
    expect(d.rooms.find((r) => r.id === "operations")?.alert).toBe(true);
    expect(d.rooms.find((r) => r.id === "research")?.alert).toBe(false);
    expect(d.liveCount).toBe(2);
    expect(d.alerts).toBe(2);
    expect(d.crew[0]?.sessionId).toBe("s1");
  });

  it("sorts missions the design's way and puts each in its agent's room", () => {
    const run = (id: string, agentId: string, state: DashboardInput["runs"][number]["state"]) => ({
      id,
      agentId,
      sessionId: `s-${id}`,
      state,
      createdAt: `2026-10-01T10:00:0${id}Z`,
      steps: 1,
      title: `Mission ${id}`,
    });
    const d = dashboardModel(
      input({
        runs: [
          run("1", "quill", "completed"),
          run("2", "wren", "running"),
          run("3", "ghost", "awaiting_consent"),
        ],
      }),
    );
    expect(d.missions.map((m) => [m.id, m.status, m.roomId])).toEqual([
      ["3", "blocked", undefined],
      ["2", "running", "research"],
      ["1", "done", "operations"],
    ]);
  });

  it("works on a station with no Overseer yet", () => {
    const d = dashboardModel(input({ agents: agents.filter((a) => a.id !== "vesper") }));
    expect(d.bridgeId).toBeUndefined();
    expect(d.overseer).toBeUndefined();
    expect(d.rooms.every((r) => !r.bridge)).toBe(true);
    expect(d.lanes.map((l) => l.traffic)).toEqual([0, 0]);
  });
});
