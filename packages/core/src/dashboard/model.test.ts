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
      ["wren", false, "echo"],
      ["vesper", true, "kestrel"],
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
      ["operations-to-research", "L-03", 0, "research"],
    ]);
    expect(quiet.lanes.every((l) => l.route.length >= 2 && l.tag)).toBe(true);
    const busy = dashboardModel(
      input({ dispatches: [{ workerAgentId: "quill" }, { workerAgentId: "quill" }] }),
    );
    expect(busy.lanes.map((l) => l.traffic)).toEqual([2, 0, 0]);
  });

  it("draws a one-way hallway on its route with two chevrons in its direction", () => {
    const lane = dashboardModel(input()).lanes.find((l) => l.id === "operations-to-research");
    expect(lane?.paired).toBe(false);
    expect(lane?.arrows).toHaveLength(2);
    expect(lane?.arrows.every((a) => a.shift[0] === 0 && a.shift[1] === 0)).toBe(true);
    expect(lane?.segments.every((s) => s.startShift.join() === "0,0")).toBe(true);
    expect(lane?.tag?.shift).toEqual([0, 0]);
  });

  it("runs a two-way pair side by side on one route, each shifted right of its travel", () => {
    const both = {
      ...station.value,
      lanes: [
        ...station.value.lanes,
        { id: "research-to-operations", from: "research", to: "operations" },
      ],
    };
    const lanes = dashboardModel(input({ station: both })).lanes;
    const there = lanes.find((l) => l.id === "operations-to-research");
    const back = lanes.find((l) => l.id === "research-to-operations");
    expect([there?.paired, back?.paired]).toEqual([true, true]);
    // One route, travelled in opposite directions.
    expect(back?.route).toEqual([...(there?.route ?? [])].reverse());
    expect(there?.route[0]).not.toEqual(back?.route[0]);
    // Every run of each lane is shifted, so they land on opposite sides of the route.
    const firstThere = there?.segments[0]?.startShift ?? [0, 0];
    const lastBack = back?.segments.at(-1)?.endShift ?? [0, 0];
    expect(firstThere.some((v) => v !== 0)).toBe(true);
    // The same end of the shared route: shifted exactly the opposite way.
    expect(lastBack.map((v) => -v || 0)).toEqual(firstThere);
    // Their tags never sit on top of each other; the other lanes stay unpaired.
    expect(there?.tag?.at).not.toEqual(back?.tag?.at);
    expect(lanes.filter((l) => l.paired).map((l) => l.id)).toEqual([
      "operations-to-research",
      "research-to-operations",
    ]);
  });

  it("runs a crew member's dispatch along the hallway policy let it use (ADR-0024)", () => {
    const d = dashboardModel(
      input({
        dispatches: [
          { workerAgentId: "wren", leadAgentId: "quill" },
          { workerAgentId: "wren", leadAgentId: "vesper" },
        ],
      }),
    );
    expect(d.lanes.map((l) => [l.id, l.traffic])).toEqual([
      ["operations-to-command", 0],
      ["research-to-command", 1],
      ["operations-to-research", 1],
    ]);
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
    expect(d.lanes.map((l) => l.traffic)).toEqual([0, 0, 0]);
  });
});
