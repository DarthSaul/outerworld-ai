import { describe, expect, it } from "vitest";
import { BUILTIN_TOOLS, type EffectiveTool } from "../policy/grants.js";
import {
  capabilitiesOf,
  isGloballyEnabled,
  missingRequirements,
  selectSkills,
  skillOverride,
  skillsForAgent,
  withSkillOverride,
} from "./enablement.js";
import type { Skill } from "./skill.js";

const skill = (id: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name: id.replace(/-/g, " "),
  description: `About ${id}.`,
  category: "Misc",
  requires: [],
  default: false,
  body: `Body of ${id}.`,
  ...over,
});

const prop = (name: string, kind: "web" | "files" | "memory"): EffectiveTool => ({
  name,
  class: name === "write_file" ? "write" : "read",
  source: { kind: "prop", prop: kind },
});
const webTools = [prop("web_fetch", "web")];
const allProps = [
  ...webTools,
  ...BUILTIN_TOOLS.files.map((t) => prop(t.name, "files")),
  prop("remember", "memory"),
];

const library = [
  skill("plan", { default: true }),
  skill("humanizer", { default: true }),
  skill("web-research", { requires: ["web", "files"] }),
  skill("debugger", { requires: ["shell"] }),
  skill("meal-planning"),
];

describe("isGloballyEnabled and overrides", () => {
  it("follows the skill's default when there is no override", () => {
    expect(isGloballyEnabled(skill("a", { default: true }), undefined)).toBe(true);
    expect(isGloballyEnabled(skill("a"), { enabled: [], disabled: [] })).toBe(false);
  });

  it("lets the Commander's override win over the default", () => {
    expect(isGloballyEnabled(skill("a", { default: true }), { disabled: ["a"] })).toBe(false);
    expect(isGloballyEnabled(skill("a"), { enabled: ["a"] })).toBe(true);
    expect(skillOverride("a", { disabled: ["a"] })).toBe(false);
    expect(skillOverride("a", { enabled: ["a"] })).toBe(true);
    expect(skillOverride("a", undefined)).toBeNull();
  });

  it("sets, flips, and clears one override without touching the others", () => {
    const start = { enabled: ["x"], disabled: ["y"] };
    expect(withSkillOverride(start, "a", true)).toEqual({ enabled: ["x", "a"], disabled: ["y"] });
    expect(withSkillOverride(start, "x", false)).toEqual({ enabled: [], disabled: ["y", "x"] });
    expect(withSkillOverride(start, "y", null)).toEqual({ enabled: ["x"], disabled: [] });
    expect(withSkillOverride(undefined, "a", null)).toEqual({ enabled: [], disabled: [] });
  });
});

describe("capability gating", () => {
  it("derives capabilities from the run's tools", () => {
    expect([...capabilitiesOf(allProps)].sort()).toEqual(["files", "memory", "web"]);
    expect([...capabilitiesOf([])]).toEqual([]);
    const dispatch: EffectiveTool = {
      name: "dispatch",
      class: "read",
      source: { kind: "role", role: "overseer" },
    };
    expect(capabilitiesOf([dispatch]).has("dispatch")).toBe(true);
  });

  it("meets files only with all three file tools", () => {
    const two = [prop("read_file", "files"), prop("list_files", "files")];
    expect(capabilitiesOf(two).has("files")).toBe(false);
    expect(capabilitiesOf([...two, prop("write_file", "files")]).has("files")).toBe(true);
  });

  it("never meets shell, media, browser, or an unknown requirement in v1", () => {
    const caps = capabilitiesOf(allProps);
    expect(
      missingRequirements(skill("a", { requires: ["shell", "web", "telepathy"] }), caps),
    ).toEqual(["shell", "telepathy"]);
  });
});

describe("selectSkills", () => {
  it("offers station-wide skills plus the agent's own, the union", () => {
    const { offered } = selectSkills({
      skills: library,
      overrides: undefined,
      agentSkills: ["meal-planning"],
      tools: allProps,
    });
    expect(offered.map((s) => s.id)).toEqual(["meal-planning", "humanizer", "plan"]);
  });

  it("puts the agent's own skills first, then station-wide, each by name", () => {
    const { offered } = selectSkills({
      skills: library,
      overrides: { enabled: ["web-research"] },
      agentSkills: ["plan", "meal-planning"],
      tools: allProps,
    });
    expect(offered.map((s) => s.id)).toEqual([
      "meal-planning",
      "plan",
      "humanizer",
      "web-research",
    ]);
  });

  it("never lets an agent's list take away a station-wide skill", () => {
    const { offered } = selectSkills({
      skills: library,
      overrides: undefined,
      agentSkills: [],
      tools: [],
    });
    expect(offered.map((s) => s.id)).toEqual(["humanizer", "plan"]);
  });

  it("offers an agent's own skill even when it is turned off station-wide", () => {
    const { offered } = selectSkills({
      skills: library,
      overrides: { disabled: ["plan"] },
      agentSkills: ["plan"],
      tools: [],
    });
    expect(offered.map((s) => s.id)).toEqual(["plan", "humanizer"]);
  });

  it("holds back an enabled skill whose tools the run does not have, saying what is missing", () => {
    const { offered, unavailable } = selectSkills({
      skills: library,
      overrides: undefined,
      agentSkills: ["web-research", "debugger"],
      tools: webTools,
    });
    expect(offered.map((s) => s.id)).toEqual(["humanizer", "plan"]);
    expect(unavailable.map((u) => [u.skill.id, u.missing])).toEqual([
      ["debugger", ["shell"]],
      ["web-research", ["files"]],
    ]);
  });

  it("ignores ids that are not in the library", () => {
    const { offered } = selectSkills({
      skills: [],
      overrides: { enabled: ["ghost"] },
      agentSkills: ["ghost"],
      tools: allProps,
    });
    expect(offered).toEqual([]);
  });
});

describe("skillsForAgent", () => {
  it("gates on the agent's room props and reads overrides and its own list from config", () => {
    const station = {
      schemaVersion: 1,
      name: "S",
      rooms: [{ id: "lab", name: "Lab", props: [{ kind: "web" as const }] }],
      lanes: [],
      connectors: [],
      budgets: { perTreeUsd: null },
      dispatch: { maxDepth: 1, maxRunsPerTree: 12, autoReview: true },
      skills: { enabled: [], disabled: ["humanizer"] },
    };
    const agent = {
      schemaVersion: 1,
      name: "A",
      roomId: "lab",
      role: "crew" as const,
      model: "m",
      approvalMode: "ask" as const,
      connectorGrants: [],
      skills: ["web-research", "meal-planning"],
      schedules: [],
    };
    const { offered, unavailable } = skillsForAgent(agent, station, library);
    expect(offered.map((s) => s.id)).toEqual(["meal-planning", "plan"]);
    expect(unavailable.map((u) => [u.skill.id, u.missing])).toEqual([["web-research", ["files"]]]);
  });

  it("offers dispatch skills to crew with canDispatch, and not at the depth limit (ADR-0024)", () => {
    const station = {
      schemaVersion: 1,
      name: "S",
      rooms: [{ id: "lab", name: "Lab", props: [] }],
      lanes: [],
      connectors: [],
      budgets: { perTreeUsd: null },
      dispatch: { maxDepth: 2, maxRunsPerTree: 12, autoReview: true },
      skills: { enabled: ["work-splitting"], disabled: [] },
    };
    const splitting = [skill("work-splitting", { requires: ["dispatch"] })];
    const crewMember = {
      schemaVersion: 1,
      name: "A",
      roomId: "lab",
      role: "crew" as const,
      model: "m",
      approvalMode: "ask" as const,
      connectorGrants: [],
      skills: [],
      schedules: [],
    };
    const offeredIds = (agent: typeof crewMember & { canDispatch?: boolean }, depth?: number) =>
      skillsForAgent(agent, station, splitting, depth === undefined ? {} : { depth }).offered.map(
        (s) => s.id,
      );
    expect(offeredIds(crewMember)).toEqual([]);
    expect(offeredIds({ ...crewMember, canDispatch: true })).toEqual(["work-splitting"]);
    expect(offeredIds({ ...crewMember, canDispatch: true }, 1)).toEqual(["work-splitting"]);
    expect(offeredIds({ ...crewMember, canDispatch: true }, 2)).toEqual([]);
  });
});
