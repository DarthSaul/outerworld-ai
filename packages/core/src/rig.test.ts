import { describe, expect, it } from "vitest";
import { deriveRig, overseerRig } from "./rig.js";
import type { Agent, Station } from "./schema/station.js";

const station = (overrides: Partial<Station> = {}): Station => ({
  schemaVersion: 1,
  id: "s",
  name: "S",
  teams: [
    {
      id: "alpha",
      name: "Alpha",
      mission: "m",
      category: "build",
      emblem: { hue: 1, mark: "none" },
      scope: { repos: [] },
      schedule: { kind: "interval", everyMinutes: 60 },
    },
    {
      id: "beta",
      name: "Beta",
      mission: "m",
      category: "build",
      emblem: { hue: 1, mark: "none" },
      scope: { repos: [] },
      schedule: { kind: "interval", everyMinutes: 60 },
    },
  ],
  agents: [],
  grants: [
    { id: "r", teamId: "alpha", tool: "notion", mode: "read", kind: "connector" },
    { id: "w", teamId: "alpha", tool: "ledger", mode: "write", kind: "skill" },
  ],
  handoffs: [],
  overseer: {
    persona: { name: "M", mandate: "m", tone: "t" },
    schedule: { kind: "interval", everyMinutes: 60 },
    outward: { kind: "discord-webhook" },
  },
  ...overrides,
});

const agent = (allowlist: string[]): Agent => ({
  id: "a",
  teamId: "alpha",
  persona: {
    name: "A",
    mandate: "m",
    tone: "t",
    allowlist,
    rig: { tintHue: 0, trimHue: 0, head: "dome", trace: "core" },
  },
});

describe("deriveRig", () => {
  it("gives a pauldron shoulder when the agent's allowlist includes any write grant", () => {
    expect(deriveRig(agent(["w"]), station()).shoulder).toBe("pauldron");
  });

  it("gives a ball shoulder when the agent can only read", () => {
    expect(deriveRig(agent(["r"]), station()).shoulder).toBe("ball");
  });

  it("gives no accessory with no inbound handoff and no repo access", () => {
    expect(deriveRig(agent(["r"]), station()).accessory).toBe("none");
  });

  it("gives an antenna when the agent's team reads an inbound handoff", () => {
    const s = station({ handoffs: [{ id: "h", from: "beta", to: "alpha" }] });
    expect(deriveRig(agent(["r"]), s).accessory).toBe("antenna");
  });

  it("gives a thruster when the agent's team has repo access", () => {
    const s = station();
    s.teams[0]!.scope.repos = ["example/repo"];
    expect(deriveRig(agent(["r"]), s).accessory).toBe("thruster");
  });

  it("gives a plate when both an inbound handoff and repo access exist", () => {
    const s = station({ handoffs: [{ id: "h", from: "beta", to: "alpha" }] });
    s.teams[0]!.scope.repos = ["example/repo"];
    expect(deriveRig(agent(["r"]), s).accessory).toBe("plate");
  });

  it("ignores outbound handoffs when deriving the accessory", () => {
    const s = station({ handoffs: [{ id: "h", from: "alpha", to: "beta" }] });
    expect(deriveRig(agent(["r"]), s).accessory).toBe("none");
  });
});

describe("overseerRig", () => {
  it("is fixed: crest head, frame trace, pauldron, crest accessory", () => {
    expect(overseerRig()).toEqual({
      head: "crest",
      trace: "frame",
      shoulder: "pauldron",
      accessory: "crest",
    });
  });
});
