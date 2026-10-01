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
