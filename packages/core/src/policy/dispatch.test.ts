import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import type { CrewMember } from "../config/station-crew.js";
import { checkDispatch, dispatchTargets } from "./dispatch.js";

const station = (maxDepth = 1): StationConfig => ({
  schemaVersion: 1,
  name: "S",
  rooms: [
    { id: "command", name: "Command", props: [] },
    { id: "ops", name: "Operations", props: [] },
  ],
  lanes: [],
  connectors: [],
  budgets: {},
  dispatch: { maxDepth, autoReview: true },
});

const agent = (role: "overseer" | "crew", roomId = "ops"): AgentConfig => ({
  schemaVersion: 1,
  name: "A",
  roomId,
  role,
  model: "m",
  approvalMode: "ask",
  connectorGrants: [],
  schedules: [],
});

const crew: CrewMember[] = [
  { id: "vesper", config: agent("overseer", "command") },
  { id: "quill", config: agent("crew") },
  { id: "scout", config: agent("crew") },
];

describe("dispatchTargets", () => {
  it("lets the Overseer reach every other crew member (v1 graph)", () => {
    expect(dispatchTargets("vesper", station(), crew)).toEqual(["quill", "scout"]);
  });

  it("gives crew no targets", () => {
    expect(dispatchTargets("quill", station(), crew)).toEqual([]);
  });

  it("gives no one targets when delegation is off (depth 0)", () => {
    expect(dispatchTargets("vesper", station(0), crew)).toEqual([]);
  });
});

describe("checkDispatch", () => {
  const ok = { from: "vesper", to: "quill", depth: 0 };

  it("allows the Overseer, from a top-level run, to reach a crew member", () => {
    expect(checkDispatch({ ...ok, station: station(), crew })).toEqual({ ok: true });
  });

  it("refuses a worker that attempts to dispatch", () => {
    expect(checkDispatch({ ...ok, from: "quill", to: "scout", station: station(), crew })).toEqual({
      ok: false,
      reason: "only the Overseer can dispatch work",
    });
  });

  it("refuses beyond the depth limit: a dispatched run cannot dispatch again", () => {
    expect(checkDispatch({ ...ok, depth: 1, station: station(), crew })).toEqual({
      ok: false,
      reason: "dispatch depth 1 is the limit; this run was itself dispatched",
    });
  });

  it("refuses self-dispatch and unknown targets", () => {
    expect(checkDispatch({ ...ok, to: "vesper", station: station(), crew }).ok).toBe(false);
    expect(checkDispatch({ ...ok, to: "ghost", station: station(), crew })).toEqual({
      ok: false,
      reason: 'no crew member "ghost" can take work from vesper; choose one of: quill, scout',
    });
  });

  it("refuses everything when delegation is turned off", () => {
    expect(checkDispatch({ ...ok, station: station(0), crew }).ok).toBe(false);
  });
});
