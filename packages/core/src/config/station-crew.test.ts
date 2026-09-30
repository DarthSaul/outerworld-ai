import { describe, expect, it } from "vitest";
import type { AgentConfig } from "./agent-config.js";
import type { StationConfig } from "./station-config.js";
import { type CrewMember, stationCrewIssues } from "./station-crew.js";

const station: StationConfig = {
  schemaVersion: 1,
  name: "Demo",
  rooms: [
    { id: "command", name: "Command", props: [] },
    { id: "operations", name: "Operations", props: [] },
  ],
  lanes: [],
  connectors: [
    { id: "notion", name: "Notion", transport: { type: "http", url: "https://a.test/mcp" } },
  ],
  budgets: {},
  dispatch: { maxDepth: 1, autoReview: true },
};

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  schemaVersion: 1,
  name: "A",
  roomId: "command",
  role: "crew",
  model: "vendor/model-a",
  approvalMode: "ask",
  connectorGrants: [],
  schedules: [],
  ...over,
});

const paths = (crew: CrewMember[]) =>
  stationCrewIssues(station, crew).map((i) => `${i.level} ${i.path}`);

describe("stationCrewIssues", () => {
  it("accepts one overseer and crew in known rooms with installed connectors", () => {
    expect(
      paths([
        { id: "overseer", config: agent({ role: "overseer" }) },
        { id: "pm", config: agent({ roomId: "operations", connectorGrants: ["notion"] }) },
      ]),
    ).toEqual([]);
  });

  it("accepts a station with no crew yet (onboarding creates the overseer)", () => {
    expect(paths([])).toEqual([]);
  });

  it("rejects an agent in an unknown room", () => {
    expect(paths([{ id: "a", config: agent({ roomId: "attic" }) }])).toEqual([
      "error agents.a.roomId",
    ]);
  });

  it("rejects a grant for a connector the station has not installed", () => {
    expect(paths([{ id: "a", config: agent({ connectorGrants: ["slack"] }) }])).toEqual([
      "error agents.a.connectorGrants.0",
    ]);
  });

  it("rejects a second overseer", () => {
    expect(
      paths([
        { id: "a", config: agent({ role: "overseer" }) },
        { id: "b", config: agent({ role: "overseer" }) },
      ]),
    ).toEqual(["error agents.b.role"]);
  });

  it("rejects an agent id that is not a lowercase kebab id", () => {
    expect(paths([{ id: "Bad Id", config: agent() }])).toEqual(["error agents.Bad Id"]);
  });
});
