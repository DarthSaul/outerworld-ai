import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import { agentSkillsView, skillCatalog } from "./catalog.js";
import { skillsForAgent } from "./enablement.js";
import type { Skill } from "./skill.js";

const skill = (id: string, category: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name: id,
  description: `About ${id}.`,
  category,
  requires: [],
  default: false,
  body: "secret recipe",
  ...over,
});

const library = [
  skill("plan", "Planning", { default: true }),
  skill("web-research", "Research", { requires: ["web", "files"] }),
  skill("debugger", "Engineering", { requires: ["shell"], default: true }),
  skill("brief", "Planning"),
];

const station: StationConfig = {
  schemaVersion: 1,
  name: "S",
  rooms: [
    { id: "lab", name: "Lab", props: [{ kind: "web" }, { kind: "files" }] },
    { id: "desk", name: "Desk", props: [] },
  ],
  lanes: [],
  connectors: [],
  budgets: { perTreeUsd: null },
  dispatch: { maxDepth: 1, maxRunsPerTree: 12, autoReview: true },
  skills: { enabled: [], disabled: ["plan"] },
};

const agent = (roomId: string, skills: string[] = []): AgentConfig => ({
  schemaVersion: 1,
  name: roomId,
  roomId,
  role: "crew",
  model: "m",
  approvalMode: "ask",
  connectorGrants: [],
  skills,
  schedules: [],
});

describe("skillCatalog", () => {
  const agents = [
    { id: "ada", config: agent("lab", ["web-research"]) },
    { id: "bo", config: agent("desk", ["web-research", "brief"]) },
  ];
  const rows = skillCatalog(library, station, agents);

  it("lists every skill by category then name, never with its body", () => {
    expect(rows.map((r) => r.id)).toEqual(["debugger", "brief", "plan", "web-research"]);
    expect(JSON.stringify(rows)).not.toContain("secret recipe");
  });

  it("reports default, override, and the resulting station-wide state", () => {
    const plan = rows.find((r) => r.id === "plan");
    expect(plan).toMatchObject({ default: true, override: false, globallyEnabled: false });
    const brief = rows.find((r) => r.id === "brief");
    expect(brief).toMatchObject({ default: false, override: null, globallyEnabled: false });
  });

  it("says who added it, who is actually offered it, and what no one on the station has", () => {
    const research = rows.find((r) => r.id === "web-research");
    expect(research).toMatchObject({ addedBy: ["ada", "bo"], offeredTo: ["ada"], missing: [] });
    const debug = rows.find((r) => r.id === "debugger");
    expect(debug).toMatchObject({ globallyEnabled: true, offeredTo: [], missing: ["shell"] });
  });
});

describe("agentSkillsView", () => {
  it("shows offered and held-back skills without bodies", () => {
    const view = agentSkillsView(skillsForAgent(agent("desk", ["web-research"]), station, library));
    expect(view).toEqual({
      offered: [],
      unavailable: [
        {
          id: "web-research",
          name: "web-research",
          description: "About web-research.",
          missing: ["web", "files"],
        },
        { id: "debugger", name: "debugger", description: "About debugger.", missing: ["shell"] },
      ],
    });
  });
});
