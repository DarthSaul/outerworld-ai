import type { Connector } from "../config/station-config.js";
import type { ToolClass } from "./grants.js";

/**
 * Our classification of connector tools (ADR-0012): authoritative for every tool it names.
 * Notion's hosted MCP tools, from https://developers.notion.com/guides/mcp/mcp-supported-tools
 * (checked 2026-09-29). `write` means it changes something in Notion, so it waits for consent
 * under *Ask first*.
 */
export const KNOWN_TOOL_CLASSES: Readonly<Record<string, ToolClass>> = {
  "notion-search": "read",
  "notion-ai-search": "read",
  "notion-fetch": "read",
  "notion-get-comments": "read",
  "notion-get-users": "read",
  "notion-get-teams": "read",
  "notion-query-data-sources": "read",
  "notion-query-meeting-notes": "read",
  "notion-download-attachment": "read",
  "notion-get-async-task": "read",
  "notion-create-pages": "write",
  "notion-update-page": "write",
  "notion-move-pages": "write",
  "notion-duplicate-page": "write",
  "notion-create-database": "write",
  "notion-update-data-source": "write",
  "notion-create-view": "write",
  "notion-update-view": "write",
  "notion-create-folder": "write",
  "notion-create-comment": "write",
  "notion-create-file-upload": "write",
  "notion-create-attachment": "write",
};

/** The subset of MCP tool annotations classification looks at. They are hints, never trusted alone. */
export interface ToolHints {
  readonly readOnlyHint?: boolean | undefined;
  readonly destructiveHint?: boolean | undefined;
}

/**
 * Read or write for a connector tool: our map wins; for a tool we do not know, a read-only hint
 * (without a destructive one) seeds `read`; anything else is `write`, so it asks under Ask first.
 */
export function classifyConnectorTool(tool: string, hints: ToolHints = {}): ToolClass {
  const known = KNOWN_TOOL_CLASSES[tool];
  if (known) return known;
  return hints.readOnlyHint === true && hints.destructiveHint !== true ? "read" : "write";
}

/** Notion's hosted MCP server (ADR-0012): OAuth, station-wide, all tools per granted agent. */
export const NOTION_PRESET: Connector = {
  id: "notion",
  name: "Notion",
  transport: { type: "http", url: "https://mcp.notion.com/mcp" },
};

const GITHUB_URL = "https://api.githubcopilot.com/mcp/";
const GMAIL_URL = "https://gmailmcp.googleapis.com/mcp/v1";

/**
 * GitHub's hosted MCP server (https://github.com/github/github-mcp-server, checked 2026-11-16).
 * It does not offer dynamic client registration, so the Commander signs in through an OAuth app
 * of their own (ADR-0019).
 */
export const GITHUB_PRESET: Connector = {
  id: "github",
  name: "GitHub",
  transport: { type: "http", url: GITHUB_URL },
};

/**
 * Google's Gmail MCP server (https://developers.google.com/workspace/gmail/api/reference/mcp,
 * checked 2026-11-16). Like GitHub, sign-in goes through the Commander's own OAuth client.
 */
export const GMAIL_PRESET: Connector = {
  id: "gmail",
  name: "Gmail",
  transport: { type: "http", url: GMAIL_URL },
};

/** The connectors the station offers to add in one click, by preset id. */
export const CONNECTOR_PRESETS = {
  notion: NOTION_PRESET,
  github: GITHUB_PRESET,
  gmail: GMAIL_PRESET,
} as const satisfies Readonly<Record<string, Connector>>;

export type ConnectorPresetId = keyof typeof CONNECTOR_PRESETS;
export const CONNECTOR_PRESET_IDS = Object.keys(CONNECTOR_PRESETS) as ConnectorPresetId[];

/**
 * Servers that register no clients themselves: their sign-in needs the Commander's own OAuth
 * client (id, and a secret where the provider requires one), kept in the keychain (ADR-0019).
 */
/**
 * One spelling per server: the parser drops a default port and lowercases the host; trailing
 * slashes on the path are ignored. Host, path, and query otherwise still tell servers apart.
 */
const serverKey = (url: string): string | undefined => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return undefined;
  }
};

const OWN_CLIENT_SERVERS: readonly string[] = [GITHUB_URL, GMAIL_URL].map((u) => serverKey(u) ?? u);

/** Whether signing in to this connector needs an OAuth client the Commander registered. */
export function needsOwnClient(connector: Connector): boolean {
  if (connector.transport.type !== "http") return false;
  const key = serverKey(connector.transport.url);
  return key !== undefined && OWN_CLIENT_SERVERS.includes(key);
}
