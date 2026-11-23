import type { PropKind } from "../config/station-config.js";
import { type GlossaryKey, term } from "../glossary.js";
import type { ConnectorPresetId } from "../policy/connector-tools.js";
import type { BUILTIN_TOOLS } from "../policy/grants.js";

/**
 * How a capability looks to people: one place that turns a code name (`web_fetch`, the `files`
 * prop, a connector) into a readable title, a one-line description, and an icon id. The words come
 * from the glossary; the ui draws each icon id as an emoji (`Icon`, ADR-0026).
 */
export const ITEM_ICONS = [
  "dispatch",
  "session",
  "web",
  "files",
  "file-read",
  "file-list",
  "file-write",
  "memory",
  "skill",
  "connector",
  "tool",
] as const;
export type ItemIconName = (typeof ITEM_ICONS)[number];

export interface ItemDisplay {
  readonly title: string;
  /** One plain line; empty when there is nothing to say (an unknown tool). */
  readonly description: string;
  readonly icon: ItemIconName;
}

type BuiltinToolName = (typeof BUILTIN_TOOLS)[keyof typeof BUILTIN_TOOLS][number]["name"];

interface Entry {
  readonly title: GlossaryKey;
  readonly description: GlossaryKey;
  readonly icon: ItemIconName;
}

const TOOLS = {
  dispatch: { title: "item.dispatch", description: "item.dispatch.hint", icon: "dispatch" },
  read_session: {
    title: "item.read_session",
    description: "item.read_session.hint",
    icon: "session",
  },
  web_fetch: { title: "item.web_fetch", description: "item.web_fetch.hint", icon: "web" },
  read_file: { title: "item.read_file", description: "item.read_file.hint", icon: "file-read" },
  list_files: { title: "item.list_files", description: "item.list_files.hint", icon: "file-list" },
  write_file: {
    title: "item.write_file",
    description: "item.write_file.hint",
    icon: "file-write",
  },
  remember: { title: "item.remember", description: "item.remember.hint", icon: "memory" },
  skill_view: { title: "item.skill_view", description: "item.skill_view.hint", icon: "skill" },
} as const satisfies Record<BuiltinToolName, Entry>;

const PROPS = {
  web: { title: "prop.web", description: "item.prop.web.hint", icon: "web" },
  files: { title: "prop.files", description: "item.prop.files.hint", icon: "files" },
  memory: { title: "prop.memory", description: "item.prop.memory.hint", icon: "memory" },
} as const satisfies Record<PropKind, Entry>;

const shown = (entry: Entry): ItemDisplay => ({
  title: term(entry.title),
  description: term(entry.description),
  icon: entry.icon,
});

/**
 * A table's own entry for `key`, never one inherited from Object.prototype: a tool named
 * `constructor` or `toString` (a connector may offer any name) is just an unknown name.
 */
const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** A tool by its name; a name it does not know (a connector's tool) shows as itself. */
export function toolDisplay(name: string): ItemDisplay {
  const entry = own<Entry>(TOOLS, name);
  return entry ? shown(entry) : { title: name, description: "", icon: "tool" };
}

/** A prop placed in a room. */
export function propDisplay(kind: PropKind): ItemDisplay {
  return shown(PROPS[kind]);
}

/** A connector, by its display name. */
export function connectorDisplay(name: string): ItemDisplay {
  return { title: name, description: term("item.connector.hint"), icon: "connector" };
}

/** The services whose logos the ui draws (`BrandIcon`); both Gmail abilities share one. */
export const ABILITY_BRANDS = ["notion", "github", "gmail"] as const;
export type AbilityBrand = (typeof ABILITY_BRANDS)[number];

/**
 * What an ability is underneath: an MCP server, or a service's API the runtime calls itself
 * (ADR-0022). Toolsets and skills join later.
 */
export type AbilityKind = "mcp" | "api";

export interface AbilityDisplay {
  readonly title: string;
  readonly description: string;
  readonly kind: AbilityKind;
  /** The service's logo; absent for a server the station has no preset for. */
  readonly brand?: AbilityBrand;
}

const ABILITIES = {
  notion: { description: "ability.notion.hint", brand: "notion", kind: "mcp" },
  github: { description: "ability.github.hint", brand: "github", kind: "mcp" },
  gmail: { description: "ability.gmail.hint", brand: "gmail", kind: "api" },
  "gmail-mcp": { description: "ability.gmailMcp.hint", brand: "gmail", kind: "mcp" },
} as const satisfies Record<
  ConnectorPresetId,
  { readonly description: GlossaryKey; readonly brand: AbilityBrand; readonly kind: AbilityKind }
>;

/**
 * An ability as a card shows it, by its id and display name: a preset gets its logo, its kind,
 * and its own description; any other connector reads as a plain MCP server.
 */
export function abilityDisplay(id: string, name: string): AbilityDisplay {
  const entry = own<(typeof ABILITIES)[ConnectorPresetId]>(ABILITIES, id);
  return entry
    ? { title: name, description: term(entry.description), kind: entry.kind, brand: entry.brand }
    : { title: name, description: term("item.connector.hint"), kind: "mcp" };
}
