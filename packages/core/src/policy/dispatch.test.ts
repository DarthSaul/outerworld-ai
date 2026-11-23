import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import type { CrewMember } from "../config/station-crew.js";
import { checkDispatch, dispatchReach, dispatchTargets, hasDispatch } from "./dispatch.js";

const station = (over: Partial<StationConfig["dispatch"]> = {}, perTreeUsd: number | null = 15) =>
  ({
    schemaVersion: 1,
    name: "S",
    rooms: [
      { id: "command", name: "Command", props: [] },
      { id: "ops", name: "Operations", props: [] },
      { id: "research", name: "Research", props: [] },
      { id: "lab", name: "Lab", props: [] },
    ],
    lanes: [
      { id: "ops-to-research", from: "ops", to: "research" },
      { id: "lab-to-ops", from: "lab", to: "ops" },
      { id: "ops-to-command", from: "ops", to: "command" },
    ],
    connectors: [],
    budgets: { perTreeUsd },
    dispatch: { maxDepth: 3, maxRunsPerTree: 12, autoReview: true, ...over },
  }) satisfies StationConfig;

const agent = (role: "overseer" | "crew", roomId: string, canDispatch?: boolean): AgentConfig => ({
  schemaVersion: 1,
  name: "A",
  roomId,
  role,
  model: "m",
  approvalMode: "ask",
  ...(canDispatch === undefined ? {} : { canDispatch }),
  connectorGrants: [],
  skills: [],
  schedules: [],
});

const crew: CrewMember[] = [
  { id: "vesper", config: agent("overseer", "command") },
  { id: "quill", config: agent("crew", "ops", true) },
  { id: "scout", config: agent("crew", "ops") },
  { id: "wren", config: agent("crew", "research", true) },
  { id: "moth", config: agent("crew", "lab", true) },
];

const fresh = { dispatchedRuns: 0, spentUsd: 0 };
const check = (over: Partial<Parameters<typeof checkDispatch>[0]> = {}) =>
  checkDispatch({
    from: "quill",
    to: "scout",
    depth: 0,
    station: station(),
    crew,
    chain: [over.from ?? "quill"],
    tree: fresh,
    ...over,
  });
const refusal = (over: Partial<Parameters<typeof checkDispatch>[0]> = {}) => {
  const r = check(over);
  return r.ok ? "allowed" : r.reason;
};

describe("hasDispatch", () => {
  it("is always true for the Overseer and true for crew only with the flag", () => {
    expect(hasDispatch({ role: "overseer" })).toBe(true);
    expect(hasDispatch({ role: "overseer", canDispatch: false })).toBe(true);
    expect(hasDispatch({ role: "crew" })).toBe(false);
    expect(hasDispatch({ role: "crew", canDispatch: false })).toBe(false);
    expect(hasDispatch({ role: "crew", canDispatch: true })).toBe(true);
  });
});

describe("dispatchReach", () => {
  it("lets the Overseer reach every other crew member, whatever the hallways", () => {
    expect(dispatchReach("vesper", station(), crew)).toEqual([
      { agentId: "quill", roomId: "ops", via: { kind: "overseer" } },
      { agentId: "scout", roomId: "ops", via: { kind: "overseer" } },
      { agentId: "wren", roomId: "research", via: { kind: "overseer" } },
      { agentId: "moth", roomId: "lab", via: { kind: "overseer" } },
    ]);
  });

  it("lets crew reach roommates and rooms a hallway leads to, never the Overseer", () => {
    // ops → research and ops → command exist; lab → ops points the other way.
    expect(dispatchReach("quill", station(), crew)).toEqual([
      { agentId: "scout", roomId: "ops", via: { kind: "room" } },
      { agentId: "wren", roomId: "research", via: { kind: "lane", laneId: "ops-to-research" } },
    ]);
  });

  it("follows hallway direction: from → to only", () => {
    expect(dispatchTargets("moth", station(), crew)).toEqual(["quill", "scout"]);
    expect(dispatchTargets("wren", station(), crew)).toEqual([]);
  });

  it("gives crew without the flag, and everyone when delegation is off, no reach", () => {
    expect(dispatchReach("scout", station(), crew)).toEqual([]);
    expect(dispatchReach("vesper", station({ maxDepth: 0 }), crew)).toEqual([]);
    expect(dispatchReach("quill", station({ maxDepth: 0 }), crew)).toEqual([]);
    expect(dispatchReach("ghost", station(), crew)).toEqual([]);
  });

  it("lets a room with no incoming hallway be reached only by the Overseer and its own crew", () => {
    // Nothing leads into the lab.
    const intoLab = crew.filter((c) => dispatchTargets(c.id, station(), crew).includes("moth"));
    expect(intoLab.map((c) => c.id)).toEqual(["vesper"]);
  });
});

describe("checkDispatch", () => {
  it("allows the Overseer and enabled crew within reach", () => {
    expect(check({ from: "vesper", to: "moth" })).toEqual({ ok: true });
    expect(check({ to: "scout" })).toEqual({ ok: true });
    expect(check({ to: "wren" })).toEqual({ ok: true });
  });

  it("refuses crew that has not been given dispatch", () => {
    expect(refusal({ from: "scout", to: "quill" })).toBe(
      "scout has not been given dispatch; report back instead",
    );
    expect(refusal({ from: "ghost", to: "quill" })).toBe(
      "ghost has not been given dispatch; report back instead",
    );
  });

  it("refuses everything when delegation is turned off", () => {
    expect(refusal({ from: "vesper", station: station({ maxDepth: 0 }) })).toBe(
      "delegation is turned off for this station",
    );
  });

  it("allows dispatch at every depth below the limit, and refuses at it", () => {
    for (const maxDepth of [1, 2, 3]) {
      for (let depth = 0; depth < maxDepth; depth++) {
        expect(check({ depth, station: station({ maxDepth }) })).toEqual({ ok: true });
      }
      expect(refusal({ depth: maxDepth, station: station({ maxDepth }) })).toBe(
        `dispatch depth ${maxDepth} is the limit and this run is at depth ${maxDepth}; do the work yourself or report back`,
      );
    }
  });

  it("refuses self-dispatch and unknown targets", () => {
    expect(refusal({ to: "quill" })).toBe("an agent cannot dispatch to itself");
    expect(refusal({ to: "ghost" })).toBe('no crew member "ghost"; choose one of: scout, wren');
    expect(refusal({ from: "wren", to: "ghost" })).toBe(
      'no crew member "ghost"; choose one of: nobody',
    );
  });

  it("refuses crew dispatch to the Overseer, even along a hallway into its room", () => {
    expect(refusal({ to: "vesper" })).toBe(
      "crew cannot dispatch to the Overseer; report back instead",
    );
  });

  it("names the missing hallway", () => {
    expect(refusal({ from: "wren", to: "moth", chain: ["wren"] })).toBe(
      "no hallway from Research to Lab; a hallway from Research to Lab is needed, or ask the Overseer",
    );
  });

  it("refuses against a hallway's direction and says which way it runs", () => {
    expect(refusal({ to: "moth" })).toBe(
      "the hallway between Operations and Lab only leads from Lab to Operations; a hallway from Operations to Lab is needed",
    );
  });

  it("refuses a cycle: a target already in the chain above", () => {
    // vesper → moth → quill, and quill tries to hand work back to moth.
    expect(refusal({ from: "moth", to: "quill", depth: 1, chain: ["moth", "vesper"] })).toBe(
      "allowed",
    );
    expect(refusal({ to: "wren", depth: 2, chain: ["quill", "wren", "vesper"] })).toBe(
      "wren is already working on this request above you; report back instead",
    );
  });

  it("refuses once the tree has used its dispatched runs", () => {
    expect(check({ tree: { dispatchedRuns: 11, spentUsd: 0 } })).toEqual({ ok: true });
    expect(refusal({ tree: { dispatchedRuns: 12, spentUsd: 0 } })).toBe(
      "this request has used 12 dispatched runs, the station's limit of 12",
    );
    expect(
      refusal({
        station: station({ maxRunsPerTree: 2 }),
        tree: { dispatchedRuns: 2, spentUsd: 0 },
      }),
    ).toBe("this request has used 2 dispatched runs, the station's limit of 2");
  });

  it("refuses once the tree has spent its budget, and enforces nothing with no cap", () => {
    expect(check({ tree: { dispatchedRuns: 0, spentUsd: 14.99 } })).toEqual({ ok: true });
    expect(refusal({ tree: { dispatchedRuns: 0, spentUsd: 15 } })).toBe(
      "this request has spent $15.00 of its $15.00 budget; no more dispatches",
    );
    expect(
      check({ station: station({}, null), tree: { dispatchedRuns: 0, spentUsd: 999 } }),
    ).toEqual({ ok: true });
  });

  it("checks in order: dispatch, delegation, depth, self, target, reach, cycle, runs, spend", () => {
    const spent = { dispatchedRuns: 99, spentUsd: 99 };
    expect(refusal({ from: "scout", depth: 9, station: station({ maxDepth: 0 }) })).toMatch(
      /not been given dispatch/,
    );
    expect(refusal({ depth: 9, station: station({ maxDepth: 0 }) })).toMatch(/turned off/);
    expect(refusal({ to: "quill", depth: 3, tree: spent })).toMatch(/depth 3 is the limit/);
    expect(refusal({ to: "quill", tree: spent })).toMatch(/itself/);
    expect(refusal({ to: "moth", chain: ["quill", "moth"], tree: spent })).toMatch(/hallway/);
    expect(refusal({ to: "wren", chain: ["quill", "wren"], tree: spent })).toMatch(/above you/);
    expect(refusal({ tree: spent })).toMatch(/dispatched runs/);
  });
});
