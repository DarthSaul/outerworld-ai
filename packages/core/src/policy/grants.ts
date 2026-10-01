import type { AgentConfig, AgentRole } from "../config/agent-config.js";
import type { PropKind, StationConfig } from "../config/station-config.js";

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
  | { readonly kind: "prop"; readonly prop: PropKind }
  | { readonly kind: "connector"; readonly connectorId: string; readonly tool: string };

export interface EffectiveTool extends ToolSpec {
  readonly source: ToolSource;
}

/** Connector id → the tools it exposes, already classified (runtime/mcp fills this in Phase 6). */
export type ConnectorToolCatalog = Readonly<Record<string, readonly ToolSpec[]>>;

/**
 * The built-in tools. Classification decisions (tasks/todo.md D16): `dispatch` and `remember`
 * are `read` because they change nothing outside the station and are gated elsewhere (depth and
 * budgets; the Commander's approval of every memory proposal). `web_fetch` is a GET of a public
 * page. Only `write_file` changes something the agent cannot take back on its own.
 */
export const BUILTIN_TOOLS = {
  overseer: [
    { name: "dispatch", class: "read" },
    { name: "read_session", class: "read" },
  ],
  web: [{ name: "web_fetch", class: "read" }],
  files: [
    { name: "read_file", class: "read" },
    { name: "list_files", class: "read" },
    { name: "write_file", class: "write" },
  ],
  memory: [{ name: "remember", class: "read" }],
} as const satisfies Record<"overseer" | PropKind, readonly ToolSpec[]>;

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

/** The agent's effective tools, in a stable order: role, then props, then connectors. Pure. */
export function resolveGrants(
  agent: AgentConfig,
  station: StationConfig,
  connectorTools: ConnectorToolCatalog,
): EffectiveTool[] {
  const tools: EffectiveTool[] = [];

  if (agent.role === "overseer") {
    for (const t of BUILTIN_TOOLS.overseer) {
      if (t.name === "dispatch" && station.dispatch.maxDepth < 1) continue;
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
