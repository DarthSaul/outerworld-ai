import { describe, expect, it } from "vitest";
import { parseStationConfig, type StationConfig } from "./station-config.js";

const valid = (): Record<string, unknown> => ({
  schemaVersion: 1,
  name: "Demo Station",
  rooms: [
    { id: "command", name: "Command", props: [{ kind: "web" }, { kind: "memory" }] },
    { id: "operations", name: "Operations", props: [{ kind: "files" }] },
  ],
  lanes: [{ id: "ops-to-command", from: "operations", to: "command" }],
  connectors: [
    {
      id: "notion",
      name: "Notion",
      transport: { type: "http", url: "https://mcp.example.test/mcp" },
    },
  ],
  budgets: { perRunUsd: 0.5, perAgentDailyUsd: 2, stationDailyUsd: 5 },
  dispatch: { maxDepth: 1, autoReview: true },
});

const paths = (input: unknown) => {
  const r = parseStationConfig(input);
  return r.issues.map((i) => `${i.level} ${i.path}`);
};

describe("parseStationConfig", () => {
  it("accepts a full valid station.json with no issues", () => {
    const r = parseStationConfig(valid());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("fills defaults for a minimal station: no lanes, connectors, budgets; dispatch depth 1 with auto review", () => {
    const r = parseStationConfig({
      schemaVersion: 1,
      name: "Tiny",
      rooms: [{ id: "command", name: "Command" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s: StationConfig = r.value;
    expect(s.rooms[0]?.props).toEqual([]);
    expect(s.lanes).toEqual([]);
    expect(s.connectors).toEqual([]);
    expect(s.budgets).toEqual({});
    expect(s.dispatch).toEqual({ maxDepth: 1, autoReview: true });
  });

  it("keeps unknown fields so a newer file round-trips (ADR-0009)", () => {
    const input = { ...valid(), futureField: { a: 1 } };
    const r = parseStationConfig(input);
    expect(r.ok && (r.value as Record<string, unknown>).futureField).toEqual({ a: 1 });
  });

  it("round-trips through JSON unchanged", () => {
    const r = parseStationConfig(valid());
    if (!r.ok) throw new Error("expected ok");
    const again = parseStationConfig(JSON.parse(JSON.stringify(r.value)));
    expect(again.ok && again.value).toEqual(r.value);
  });

  it("requires at least one room", () => {
    expect(paths({ ...valid(), rooms: [], lanes: [] })).toContain("error rooms");
  });

  it("rejects an unknown prop kind", () => {
    const input = valid();
    input.rooms = [{ id: "command", name: "Command", props: [{ kind: "terminal" }] }];
    input.lanes = [];
    expect(paths(input)).toContain("error rooms.0.props.0.kind");
  });

  it("rejects the same prop placed twice in one room", () => {
    const input = valid();
    input.rooms = [{ id: "command", name: "Command", props: [{ kind: "web" }, { kind: "web" }] }];
    input.lanes = [];
    expect(paths(input)).toContain("error rooms.0.props.1");
  });

  it("rejects duplicate room, lane, and connector ids", () => {
    const input = valid();
    input.rooms = [
      { id: "command", name: "A" },
      { id: "command", name: "B" },
    ];
    input.lanes = [
      { id: "l", from: "command", to: "command-2" },
      { id: "l", from: "command", to: "command-2" },
    ];
    input.connectors = [
      { id: "notion", name: "N", transport: { type: "http", url: "https://a.test/mcp" } },
      { id: "notion", name: "N", transport: { type: "http", url: "https://a.test/mcp" } },
    ];
    const p = paths(input);
    expect(p).toContain("error rooms.1.id");
    expect(p).toContain("error lanes.1.id");
    expect(p).toContain("error connectors.1.id");
  });

  it("rejects lanes to unknown rooms, to themselves, and repeated directions", () => {
    const input = valid();
    input.lanes = [
      { id: "a", from: "operations", to: "nowhere" },
      { id: "b", from: "command", to: "command" },
      { id: "c", from: "operations", to: "command" },
      { id: "d", from: "operations", to: "command" },
    ];
    const p = paths(input);
    expect(p).toContain("error lanes.0.to");
    expect(p).toContain("error lanes.1");
    expect(p).toContain("error lanes.3");
    expect(p).not.toContain("error lanes.2");
  });

  it("accepts a stdio connector and rejects a connector URL that is not http(s)", () => {
    const input = valid();
    input.connectors = [
      { id: "local", name: "Local", transport: { type: "stdio", command: "node", args: ["x.js"] } },
      { id: "bad", name: "Bad", transport: { type: "http", url: "file:///etc/passwd" } },
    ];
    const p = paths(input);
    expect(p).not.toContain("error connectors.0.transport");
    expect(p).toContain("error connectors.1.transport.url");
  });

  it("rejects secrets-shaped connector fields: no headers or env values in station.json", () => {
    const input = valid();
    input.connectors = [
      {
        id: "notion",
        name: "Notion",
        transport: { type: "http", url: "https://a.test/mcp", headers: { Authorization: "x" } },
      },
    ];
    const issue = parseStationConfig(input).issues.find((i) => i.path === "connectors.0.transport");
    expect(issue?.message).toMatch(/headers/);
  });

  it("rejects non-positive budgets", () => {
    const input = { ...valid(), budgets: { perRunUsd: 0, stationDailyUsd: -1 } };
    const p = paths(input);
    expect(p).toContain("error budgets.perRunUsd");
    expect(p).toContain("error budgets.stationDailyUsd");
  });

  it("limits dispatch depth to 0 or 1 in v1", () => {
    expect(paths({ ...valid(), dispatch: { maxDepth: 2 } })).toContain("error dispatch.maxDepth");
    expect(parseStationConfig({ ...valid(), dispatch: { maxDepth: 0 } }).ok).toBe(true);
  });

  it("warns on a newer schema version and errors on an older one", () => {
    expect(paths({ ...valid(), schemaVersion: 2 })).toEqual(["warn schemaVersion"]);
    expect(parseStationConfig({ ...valid(), schemaVersion: 2 }).ok).toBe(true);
    expect(parseStationConfig({ ...valid(), schemaVersion: 0 }).ok).toBe(false);
  });

  it("never throws on garbage", () => {
    for (const bad of [null, 42, "x", [], { rooms: "no" }]) {
      expect(parseStationConfig(bad).ok).toBe(false);
    }
  });
});
