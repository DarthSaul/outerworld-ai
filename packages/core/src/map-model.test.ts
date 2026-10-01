import { describe, expect, it } from "vitest";
import type { AgentConfig } from "./config/agent-config.js";
import type { StationConfig } from "./config/station-config.js";
import { mapModelFor } from "./map-model.js";
import type { CrewActivityEntry } from "./run/crew-activity.js";
import { parseStationState } from "./schema/state.js";
import { parseStation } from "./schema/station.js";

const station: StationConfig = {
  schemaVersion: 1,
  name: "Demo Station",
  rooms: [
    {
      id: "command",
      name: "Command",
      description: "Takes requests.",
      props: [{ kind: "web" }, { kind: "memory" }],
    },
    { id: "operations", name: "Operations", props: [{ kind: "files" }, { kind: "web" }] },
  ],
  lanes: [{ id: "ops-to-command", from: "operations", to: "command" }],
  connectors: [
    { id: "notion", name: "Notion", transport: { type: "http", url: "https://mcp.example/mcp" } },
  ],
  budgets: {},
  dispatch: { maxDepth: 1, autoReview: true },
};

const agent = (over: Partial<AgentConfig>): AgentConfig => ({
  schemaVersion: 1,
  name: "A",
  roomId: "operations",
  role: "crew",
  model: "anthropic/claude-sonnet-5.5",
  approvalMode: "ask",
  connectorGrants: [],
  schedules: [],
  ...over,
});

const crew = [
  { id: "vesper", config: agent({ name: "Vesper", role: "overseer", roomId: "command" }) },
  {
    id: "quill",
    config: agent({ name: "Quill", connectorGrants: ["notion"], approvalMode: "full" }),
  },
  {
    id: "pip",
    config: agent({ name: "Pip", rig: { tintHue: 10, trimHue: 20, head: "wedge", trace: "bar" } }),
  },
];

const at = "2026-10-01T09:00:00.000Z";
const idle: CrewActivityEntry = { state: "idle", runs: 0 };

describe("mapModelFor", () => {
  it("draws rooms as panels, props and granted connectors as chips, hallways as handoffs", () => {
    const { station: map } = mapModelFor(station, crew, {}, at);
    expect(parseStation(map).ok).toBe(true);
    expect(map.name).toBe("Demo Station");
    expect(map.teams.map((t) => [t.id, t.name, t.mission])).toEqual([
      ["command", "Command", "Takes requests."],
      ["operations", "Operations", "Operations"],
    ]);
    expect(map.grants.map((g) => [g.teamId, g.label, g.mode, g.kind])).toEqual([
      ["command", "Web", "read", "skill"],
      ["command", "Memory", "read", "skill"],
      ["operations", "Files", "write", "skill"],
      ["operations", "Web", "read", "skill"],
      ["operations", "Notion", "write", "connector"],
    ]);
    expect(map.handoffs).toEqual([{ id: "ops-to-command", from: "operations", to: "command" }]);
  });

  it("puts the Overseer at the edge and the rest of the crew in their rooms", () => {
    const { station: map } = mapModelFor(station, crew, {}, at);
    expect(map.overseer.persona.name).toBe("Vesper");
    expect(map.agents.map((a) => [a.id, a.teamId, a.persona.name, a.persona.mandate])).toEqual([
      ["quill", "operations", "Quill", "Full power"],
      ["pip", "operations", "Pip", "Ask first"],
    ]);
    const quill = map.agents[0];
    expect(quill?.persona.allowlist).toEqual([
      "operations--files",
      "operations--web",
      "operations--notion",
    ]);
    expect(map.agents[1]?.persona.rig).toEqual({
      tintHue: 10,
      trimHue: 20,
      head: "wedge",
      trace: "bar",
    });
    // A crew member without a rig gets a stable one from its id; never the overseer's crest.
    const again = mapModelFor(station, crew, {}, at).station.agents[0]?.persona.rig;
    expect(again).toEqual(quill?.persona.rig);
    expect(quill?.persona.rig.head).not.toBe("crest");
  });

  it("shows live state: working, waiting for approval, stopped, failed, and what it means for a room", () => {
    const { state } = mapModelFor(
      station,
      [...crew, { id: "rue", config: agent({ name: "Rue", roomId: "command" }) }],
      {
        quill: { state: "awaiting_consent", runs: 1, sessionId: "s1", at },
        pip: { state: "running", runs: 2, sessionId: "s2", at },
        rue: { state: "blocked", runs: 0, detail: "budget", at },
        vesper: { state: "running", runs: 1, at },
      },
      at,
    );
    expect(parseStationState(state).ok).toBe(true);
    expect(state.agents.quill).toEqual({ state: "working", note: "waiting for your approval" });
    expect(state.agents.pip).toEqual({ state: "working" });
    expect(state.agents.rue).toEqual({ state: "failed", note: "stopped by a budget" });
    expect(state.teams.operations).toMatchObject({
      health: "attention",
      healthReason: "waiting for your approval",
      run: "working",
    });
    expect(state.teams.command).toMatchObject({ health: "stalled", run: "failed" });
    expect(state.overseer.state).toBe("reconciling");
    expect(state.overseer.attention.map((a) => a.teamId).sort()).toEqual(["command", "operations"]);
    expect(state.handoffs["ops-to-command"]).toEqual({ carrying: false });
  });

  it("maps the Overseer's own state, and rests everything idle without activity", () => {
    const of = (entry: CrewActivityEntry) =>
      mapModelFor(station, crew, { vesper: entry }, at).state.overseer.state;
    expect(of({ state: "awaiting_consent", runs: 1, at })).toBe("attention");
    expect(of({ state: "failed", runs: 0, at })).toBe("attention");
    expect(of({ state: "done", runs: 0, at })).toBe("reported");
    expect(of(idle)).toBe("idle");
    const { state } = mapModelFor(station, crew, {}, at);
    expect(state.teams.operations).toMatchObject({ health: "ok", run: "idle" });
    expect(state.agents.quill).toEqual({ state: "idle" });
  });

  it("works without an Overseer (a station mid-setup)", () => {
    const { station: map, state } = mapModelFor(station, crew.slice(1), {}, at);
    expect(map.overseer.persona.name).toBe("Overseer");
    expect(state.overseer.state).toBe("idle");
  });
});
