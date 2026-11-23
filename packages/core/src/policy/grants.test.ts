import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/agent-config.js";
import type { PropKind, StationConfig } from "../config/station-config.js";
import {
  BUILTIN_TOOLS,
  type ConnectorToolCatalog,
  connectorToolName,
  type EffectiveTool,
  resolveGrants,
  SKILL_VIEW_TOOL,
  withSkillTool,
} from "./grants.js";

const station = (props: Record<string, PropKind[]>, maxDepth = 1): StationConfig => ({
  schemaVersion: 1,
  name: "S",
  rooms: Object.entries(props).map(([id, kinds]) => ({
    id,
    name: id,
    props: kinds.map((kind) => ({ kind })),
  })),
  lanes: [],
  connectors: [
    { id: "notion", name: "Notion", transport: { type: "http", url: "https://a.test/mcp" } },
    { id: "wiki", name: "Wiki", transport: { type: "http", url: "https://b.test/mcp" } },
  ],
  budgets: { perTreeUsd: null },
  dispatch: { maxDepth, maxRunsPerTree: 12, autoReview: true },
});

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  schemaVersion: 1,
  name: "A",
  roomId: "ops",
  role: "crew",
  model: "anthropic/claude-sonnet-5.5",
  approvalMode: "ask",
  connectorGrants: [],
  skills: [],
  schedules: [],
  ...over,
});

const catalog: ConnectorToolCatalog = {
  notion: [
    { name: "notion-search", class: "read" },
    { name: "notion-update-page", class: "write" },
  ],
  wiki: [{ name: "search", class: "read" }],
};

const names = (tools: readonly EffectiveTool[]) => tools.map((t) => t.name);

describe("resolveGrants", () => {
  it("gives a crew member in a room with no props and no grants nothing at all", () => {
    expect(resolveGrants(agent(), station({ ops: [] }), catalog)).toEqual([]);
  });

  it("grants each prop's built-in tools to every crew member in the room, with their class", () => {
    const tools = resolveGrants(agent(), station({ ops: ["web", "files", "memory"] }), catalog);
    expect(tools).toEqual([
      { name: "web_fetch", class: "read", source: { kind: "prop", prop: "web" } },
      { name: "read_file", class: "read", source: { kind: "prop", prop: "files" } },
      { name: "list_files", class: "read", source: { kind: "prop", prop: "files" } },
      { name: "write_file", class: "write", source: { kind: "prop", prop: "files" } },
      { name: "remember", class: "read", source: { kind: "prop", prop: "memory" } },
    ]);
  });

  it("uses only the agent's own room's props", () => {
    const s = station({ ops: ["web"], command: ["files"] });
    expect(names(resolveGrants(agent({ roomId: "ops" }), s, catalog))).toEqual(["web_fetch"]);
    expect(names(resolveGrants(agent({ roomId: "command" }), s, catalog))).toEqual([
      "read_file",
      "list_files",
      "write_file",
    ]);
  });

  it("gives the overseer dispatch and read_session on top of its room's props", () => {
    const tools = resolveGrants(agent({ role: "overseer" }), station({ ops: ["web"] }), catalog);
    expect(tools.slice(0, 2)).toEqual([
      { name: "dispatch", class: "read", source: { kind: "dispatch" } },
      { name: "read_session", class: "read", source: { kind: "role", role: "overseer" } },
    ]);
    expect(names(tools)).toContain("web_fetch");
  });

  it("never gives crew without the flag the dispatch tool, whatever their room holds", () => {
    const tools = resolveGrants(agent(), station({ ops: ["web", "files", "memory"] }), catalog);
    expect(names(tools)).not.toContain("dispatch");
    expect(names(tools)).not.toContain("read_session");
    const off = resolveGrants(agent({ canDispatch: false }), station({ ops: [] }), catalog);
    expect(names(off)).toEqual([]);
  });

  it("gives crew with canDispatch the dispatch tool, but never read_session (ADR-0025)", () => {
    const tools = resolveGrants(agent({ canDispatch: true }), station({ ops: ["web"] }), catalog);
    expect(tools[0]).toEqual({ name: "dispatch", class: "read", source: { kind: "dispatch" } });
    expect(names(tools)).toEqual(["dispatch", "web_fetch"]);
  });

  it("withholds dispatch from a run at the depth limit, and offers it below", () => {
    const s = station({ ops: [] }, 2);
    const crewMember = agent({ canDispatch: true });
    expect(names(resolveGrants(crewMember, s, catalog, { depth: 0 }))).toEqual(["dispatch"]);
    expect(names(resolveGrants(crewMember, s, catalog, { depth: 1 }))).toEqual(["dispatch"]);
    expect(names(resolveGrants(crewMember, s, catalog, { depth: 2 }))).toEqual([]);
    const overseer = agent({ role: "overseer" });
    expect(names(resolveGrants(overseer, s, catalog, { depth: 2 }))).toEqual(["read_session"]);
  });

  it("withholds dispatch from the overseer when the station turns delegation off (depth 0)", () => {
    const tools = resolveGrants(agent({ role: "overseer" }), station({ ops: [] }, 0), catalog);
    expect(names(tools)).toEqual(["read_session"]);
  });

  it("grants every tool of a granted connector, namespaced by connector, with our class", () => {
    const tools = resolveGrants(
      agent({ connectorGrants: ["notion"] }),
      station({ ops: [] }),
      catalog,
    );
    expect(tools).toEqual([
      {
        name: "notion__notion-search",
        class: "read",
        source: { kind: "connector", connectorId: "notion", tool: "notion-search" },
      },
      {
        name: "notion__notion-update-page",
        class: "write",
        source: { kind: "connector", connectorId: "notion", tool: "notion-update-page" },
      },
    ]);
  });

  it("grants nothing from a connector the agent was not granted", () => {
    const tools = resolveGrants(
      agent({ connectorGrants: ["wiki"] }),
      station({ ops: [] }),
      catalog,
    );
    expect(names(tools)).toEqual(["wiki__search"]);
  });

  it("grants nothing for a connector with no known tools yet (not connected)", () => {
    expect(resolveGrants(agent({ connectorGrants: ["notion"] }), station({ ops: [] }), {})).toEqual(
      [],
    );
  });

  it("ignores a grant for a connector the station no longer has installed", () => {
    const s = { ...station({ ops: [] }), connectors: [] };
    expect(resolveGrants(agent({ connectorGrants: ["notion"] }), s, catalog)).toEqual([]);
  });

  it("gives nothing to an agent whose room does not exist (the cross-file check reports it)", () => {
    expect(resolveGrants(agent({ roomId: "attic" }), station({ ops: ["web"] }), catalog)).toEqual(
      [],
    );
  });

  it("keeps tool names unique and within provider limits", () => {
    const tools = resolveGrants(
      agent({ role: "overseer", connectorGrants: ["notion", "wiki"] }),
      station({ ops: ["web", "files", "memory"] }),
      catalog,
    );
    expect(new Set(names(tools)).size).toBe(tools.length);
    for (const t of tools) expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it("classifies every built-in tool, and only side-effectful ones as write", () => {
    const writes = Object.values(BUILTIN_TOOLS)
      .flat()
      .filter((t) => t.class === "write")
      .map((t) => t.name);
    expect(writes).toEqual(["write_file"]);
  });

  it("adds skill_view, as a read tool, only when a skill is offered", () => {
    const base = resolveGrants(agent(), station({ ops: ["web"] }), catalog);
    expect(withSkillTool(base, 0)).toEqual(base);
    const withSkills = withSkillTool(base, 2);
    expect(withSkills.slice(0, -1)).toEqual(base);
    expect(withSkills.at(-1)).toEqual({
      name: SKILL_VIEW_TOOL,
      class: "read",
      source: { kind: "skill" },
    });
  });

  it("builds connector tool names that fit provider limits even for long names", () => {
    const name = connectorToolName("notion", "x".repeat(100));
    expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(connectorToolName("notion", "has spaces.and/dots")).toBe("notion__has_spaces_and_dots");
  });
});
