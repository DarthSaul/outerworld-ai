import type { Connector } from "../config/station-config.js";
import type { GlossaryKey } from "../glossary.js";
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

/** One step of registering the Commander's own OAuth app: its words, and where to do it. */
export interface OwnClientSetupStep {
  readonly step: GlossaryKey;
  readonly href?: string;
}

/**
 * How to sign in to a server that registers no clients itself (ADR-0019): the Commander's own
 * OAuth app, set up with these steps.
 */
export interface OwnClientProfile {
  /** The scope to ask for, in place of every scope the server lists; absent: the server's. */
  readonly scope?: string;
  /** Extra parameters for the authorization request. */
  readonly authorizationParams?: Readonly<Record<string, string>>;
  readonly setup: readonly OwnClientSetupStep[];
}

/**
 * Gmail (ADR-0019 amendment). `gmail.modify` covers every tool the server offers (read, draft,
 * label, trash) and nothing it does not (no permanent delete); the server has no send tool.
 * Google returns a refresh token only for `access_type=offline`, and again only with consent.
 */
const GMAIL_PROFILE: OwnClientProfile = {
  scope: "https://www.googleapis.com/auth/gmail.modify",
  authorizationParams: { access_type: "offline", prompt: "consent" },
  setup: [
    // The server is a Developer Preview: a project outside the program is refused on every tool.
    {
      step: "connector.setup.google.preview",
      href: "https://developers.google.com/workspace/preview",
    },
    {
      step: "connector.setup.google.apis",
      href: "https://console.cloud.google.com/apis/library/gmailmcp.googleapis.com",
    },
    {
      step: "connector.setup.google.audience",
      href: "https://console.cloud.google.com/auth/audience",
    },
    { step: "connector.setup.google.scope", href: "https://console.cloud.google.com/auth/scopes" },
    {
      step: "connector.setup.google.client",
      href: "https://console.cloud.google.com/auth/clients/create",
    },
    { step: "connector.setup.paste" },
  ],
};

/** GitHub: an OAuth app; the server names its own scopes. */
const GITHUB_PROFILE: OwnClientProfile = {
  setup: [
    { step: "connector.setup.github.app", href: "https://github.com/settings/applications/new" },
    { step: "connector.setup.github.callback" },
    { step: "connector.setup.github.secret" },
    { step: "connector.setup.paste" },
  ],
};

/** Servers that register no clients themselves, by their one spelling. */
const OWN_CLIENT_SERVERS: ReadonlyMap<string, OwnClientProfile> = new Map(
  [
    [GITHUB_URL, GITHUB_PROFILE],
    [GMAIL_URL, GMAIL_PROFILE],
  ].map(([u, p]) => [serverKey(u as string) ?? (u as string), p as OwnClientProfile]),
);

/**
 * The sign-in profile of a server that needs the Commander's own OAuth client (id, and a secret
 * where the provider requires one), kept in the keychain (ADR-0019); undefined for any other.
 */
export function ownClientProfile(url: string | undefined): OwnClientProfile | undefined {
  const key = url === undefined ? undefined : serverKey(url);
  return key === undefined ? undefined : OWN_CLIENT_SERVERS.get(key);
}

/** Whether signing in to this connector needs an OAuth client the Commander registered. */
export function needsOwnClient(connector: Connector): boolean {
  return (
    connector.transport.type === "http" && ownClientProfile(connector.transport.url) !== undefined
  );
}
