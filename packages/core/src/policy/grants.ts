import type { AgentConfig, AgentRole } from "../config/agent-config.js";
import type { PropKind, StationConfig } from "../config/station-config.js";
import { hasDispatch } from "./dispatch.js";

/**
 * Effective grant resolution (brief §6): an agent's tools come from its role, its room's props,
 * and its connector grants. The runtime sends only these to the model and rejects any other call
 * at execution (double enforcement). Every tool has a class: `write` calls pause for consent under
 * *Ask first*; `read` calls do not. Our classification is authoritative (ADR-0012).
 */

export type ToolClass = "read" | "write";

export interface ToolSpec {
  readonly name: string;
  readonly class: ToolClass;
}

export type ToolSource =
  | { readonly kind: "role"; readonly role: AgentRole }
  /** The Overseer's, or a crew member's whose `canDispatch` is on (ADR-0025). */
  | { readonly kind: "dispatch" }
  | { readonly kind: "prop"; readonly prop: PropKind }
  | { readonly kind: "connector"; readonly connectorId: string; readonly tool: string }
  | { readonly kind: "skill" };

export interface EffectiveTool extends ToolSpec {
  readonly source: ToolSource;
}

/** Connector id → the tools it exposes, already classified (runtime/mcp fills this in Phase 6). */
export type ConnectorToolCatalog = Readonly<Record<string, readonly ToolSpec[]>>;

/**
 * The built-in tools. Classification decisions (tasks/todo.md D16): `dispatch` and `remember`
 * are `read` because they change nothing outside the station and are gated elsewhere (depth, reach,
 * the run cap and budgets; the Commander's approval of every memory proposal). `web_fetch` is a GET of a public
 * page. Only `write_file` changes something the agent cannot take back on its own.
 */
export const BUILTIN_TOOLS = {
  dispatch: [{ name: "dispatch", class: "read" }],
  overseer: [{ name: "read_session", class: "read" }],
  web: [{ name: "web_fetch", class: "read" }],
  files: [
    { name: "read_file", class: "read" },
    { name: "list_files", class: "read" },
    { name: "write_file", class: "write" },
  ],
  memory: [{ name: "remember", class: "read" }],
  /** Granted only when at least one skill is offered (`withSkillTool`, ADR-0023). */
  skill: [{ name: "skill_view", class: "read" }],
} as const satisfies Record<"dispatch" | "overseer" | "skill" | PropKind, readonly ToolSpec[]>;

/** Reads one of the agent's offered skills (ADR-0023). */
export const SKILL_VIEW_TOOL = "skill_view";

const PROP_ORDER: readonly PropKind[] = ["web", "files", "memory"];
const MAX_TOOL_NAME = 64;

/** A stable 32-bit FNV-1a hash in hex, to keep truncated names unique. */
const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

/**
 * The name a connector tool has in the model request: `<connectorId>__<tool>`, restricted to
 * `[a-zA-Z0-9_-]` and 64 characters (the common provider limit). Namespacing keeps connector tools
 * from colliding with built-ins or with each other.
 */
export function connectorToolName(connectorId: string, tool: string): string {
  const name = `${connectorId}__${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (name.length <= MAX_TOOL_NAME) return name;
  return `${name.slice(0, MAX_TOOL_NAME - 9)}_${hash(name)}`;
}

/** Where tools are resolved for: a run's depth (0 for a Commander's run, or outside any run). */
export interface GrantContext {
  readonly depth?: number;
}

/**
 * The agent's effective tools, in a stable order: dispatch, role, props, then connectors. Pure.
 * `dispatch` is offered only to an agent that has it (`hasDispatch`) in a run below the station's
 * depth limit, so at the limit the model never sees it (ADR-0025).
 */
export function resolveGrants(
  agent: AgentConfig,
  station: StationConfig,
  connectorTools: ConnectorToolCatalog,
  context: GrantContext = {},
): EffectiveTool[] {
  const tools: EffectiveTool[] = [];

  if (hasDispatch(agent) && (context.depth ?? 0) < station.dispatch.maxDepth) {
    for (const t of BUILTIN_TOOLS.dispatch) tools.push({ ...t, source: { kind: "dispatch" } });
  }
  if (agent.role === "overseer") {
    for (const t of BUILTIN_TOOLS.overseer) {
      tools.push({ ...t, source: { kind: "role", role: "overseer" } });
    }
  }

  const room = station.rooms.find((r) => r.id === agent.roomId);
  // An unknown room grants nothing; the cross-file check reports it.
  if (!room) return tools;
  const placed = new Set(room.props.map((p) => p.kind));
  for (const prop of PROP_ORDER) {
    if (!placed.has(prop)) continue;
    for (const t of BUILTIN_TOOLS[prop]) tools.push({ ...t, source: { kind: "prop", prop } });
  }

  const installed = new Set(station.connectors.map((c) => c.id));
  for (const connectorId of agent.connectorGrants) {
    if (!installed.has(connectorId)) continue;
    for (const t of connectorTools[connectorId] ?? []) {
      tools.push({
        name: connectorToolName(connectorId, t.name),
        class: t.class,
        source: { kind: "connector", connectorId, tool: t.name },
      });
    }
  }
  return tools;
}

/**
 * `tools` plus `skill_view` when at least one skill is offered (ADR-0023). Separate from
 * `resolveGrants` because which skills are offered depends on the other tools: base grants →
 * capabilities → offered skills → this.
 */
export function withSkillTool(
  tools: readonly EffectiveTool[],
  offeredSkills: number,
): EffectiveTool[] {
  if (offeredSkills === 0) return [...tools];
  const skillTools = BUILTIN_TOOLS.skill.map((t) => ({ ...t, source: { kind: "skill" } as const }));
  return [...tools, ...skillTools];
}
