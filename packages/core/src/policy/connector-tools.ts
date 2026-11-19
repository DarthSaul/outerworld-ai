import type { Connector, ConnectorTransport } from "../config/station-config.js";
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

/**
 * The station's own services' tools, by service (ADR-0022). Their names are generic, so they
 * apply only to that service: another server's `get_thread` is classified from its annotations.
 * Gmail: drafting, labeling, and trashing change the mailbox; nothing sends.
 */
export const BUILTIN_TOOL_CLASSES: Readonly<Record<string, Readonly<Record<string, ToolClass>>>> = {
  gmail: {
    search_threads: "read",
    get_thread: "read",
    list_labels: "read",
    create_draft: "write",
    modify_thread_labels: "write",
    trash_thread: "write",
  },
};

/** The subset of MCP tool annotations classification looks at. They are hints, never trusted alone. */
export interface ToolHints {
  readonly readOnlyHint?: boolean | undefined;
  readonly destructiveHint?: boolean | undefined;
}

const lookup = (map: Readonly<Record<string, ToolClass>> | undefined, tool: string) =>
  map && Object.hasOwn(map, tool) ? map[tool] : undefined;

/**
 * Read or write for a connector tool: our map wins (for a builtin `service`, that service's map
 * instead); for a tool we do not know, a read-only hint (without a destructive one) seeds `read`;
 * anything else is `write`, so it asks under Ask first.
 */
export function classifyConnectorTool(
  tool: string,
  hints: ToolHints = {},
  service?: string,
): ToolClass {
  const map =
    service === undefined
      ? KNOWN_TOOL_CLASSES
      : Object.hasOwn(BUILTIN_TOOL_CLASSES, service)
        ? BUILTIN_TOOL_CLASSES[service]
        : undefined;
  const known = lookup(map, tool);
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
/** Google's Gmail MCP server, a Developer Preview (ADR-0019, ADR-0022). */
export const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";

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
 * Gmail through the Gmail REST API (https://developers.google.com/workspace/gmail/api, checked
 * 2026-11-18), which the runtime calls itself (ADR-0022). Sign-in goes through the Commander's
 * own OAuth client, like GitHub.
 */
export const GMAIL_PRESET: Connector = {
  id: "gmail",
  name: "Gmail",
  transport: { type: "builtin", service: "gmail" },
};

/**
 * Google's Gmail MCP server (https://developers.google.com/workspace/gmail/api/reference/mcp,
 * checked 2026-11-16). A Developer Preview that refuses projects outside the program, so the
 * catalog shows it but cannot add it yet (ADR-0022).
 */
export const GMAIL_MCP_PRESET: Connector = {
  id: "gmail-mcp",
  name: "Gmail MCP",
  transport: { type: "http", url: GMAIL_MCP_URL },
};

/** The connectors the station offers to add in one click, by preset id, in catalog order. */
export const CONNECTOR_PRESETS = {
  notion: NOTION_PRESET,
  github: GITHUB_PRESET,
  gmail: GMAIL_PRESET,
  "gmail-mcp": GMAIL_MCP_PRESET,
} as const satisfies Readonly<Record<string, Connector>>;

export type ConnectorPresetId = keyof typeof CONNECTOR_PRESETS;
export const CONNECTOR_PRESET_IDS = Object.keys(CONNECTOR_PRESETS) as ConnectorPresetId[];

/** Presets the catalog shows but cannot add yet (ADR-0022): Gmail MCP, until preview access. */
const UNAVAILABLE_PRESETS: ReadonlySet<ConnectorPresetId> = new Set<ConnectorPresetId>([
  "gmail-mcp",
]);

/** Whether a preset can be added to the station today. */
export function isPresetAvailable(id: ConnectorPresetId): boolean {
  return !UNAVAILABLE_PRESETS.has(id);
}

/** The presets that can be added today, in catalog order. */
export const AVAILABLE_PRESET_IDS = CONNECTOR_PRESET_IDS.filter(isPresetAvailable) as [
  ConnectorPresetId,
  ...ConnectorPresetId[],
];

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
 * Gmail's MCP server (ADR-0019 amendment). `gmail.modify` covers every tool the server offers
 * (read, draft, label, trash) and nothing it does not (no permanent delete); the server has no
 * send tool. Google returns a refresh token only for `access_type=offline`, and again only with
 * consent.
 */
const GMAIL_MCP_PROFILE: OwnClientProfile = {
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

/**
 * Gmail through the REST API (ADR-0022): the same scope and offline access as the MCP server,
 * without the preview program or the MCP API. A consent screen left in Testing gets refresh
 * tokens that lapse after seven days, and the audience step says so.
 */
const GMAIL_API_PROFILE: OwnClientProfile = {
  scope: "https://www.googleapis.com/auth/gmail.modify",
  authorizationParams: { access_type: "offline", prompt: "consent" },
  setup: [
    {
      step: "connector.setup.gmailApi.enable",
      href: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    },
    {
      step: "connector.setup.gmailApi.audience",
      href: "https://console.cloud.google.com/auth/audience",
    },
    { step: "connector.setup.google.scope", href: "https://console.cloud.google.com/auth/scopes" },
    {
      step: "connector.setup.gmailApi.client",
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
    [GMAIL_MCP_URL, GMAIL_MCP_PROFILE],
  ].map(([u, p]) => [serverKey(u as string) ?? (u as string), p as OwnClientProfile]),
);

/** Builtin services that sign in with the Commander's own OAuth client (ADR-0022). */
const OWN_CLIENT_SERVICES: Readonly<Record<string, OwnClientProfile>> = {
  gmail: GMAIL_API_PROFILE,
};

/**
 * The sign-in profile of a server that needs the Commander's own OAuth client (id, and a secret
 * where the provider requires one), kept in the keychain (ADR-0019); undefined for any other.
 */
export function ownClientProfile(url: string | undefined): OwnClientProfile | undefined {
  const key = url === undefined ? undefined : serverKey(url);
  return key === undefined ? undefined : OWN_CLIENT_SERVERS.get(key);
}

/**
 * Where a connector's sign-in profile is found: its server URL, or its builtin service. A
 * connector view carries one or the other, so the SPA and the runtime look it up the same way.
 */
export interface ProfileSource {
  readonly url?: string | undefined;
  readonly service?: string | undefined;
}

/** The sign-in profile for a server URL or a builtin service (ADR-0019, ADR-0022). */
export function ownClientProfileOf(source: ProfileSource): OwnClientProfile | undefined {
  if (source.service !== undefined) {
    return Object.hasOwn(OWN_CLIENT_SERVICES, source.service)
      ? OWN_CLIENT_SERVICES[source.service]
      : undefined;
  }
  return ownClientProfile(source.url);
}

/** Where a transport's sign-in profile is found. */
export function profileSource(transport: ConnectorTransport): ProfileSource {
  if (transport.type === "http") return { url: transport.url };
  if (transport.type === "builtin") return { service: transport.service };
  return {};
}

/** Whether signing in to this connector needs an OAuth client the Commander registered. */
export function needsOwnClient(connector: Connector): boolean {
  return ownClientProfileOf(profileSource(connector.transport)) !== undefined;
}

/**
 * A station installed before ADR-0022 has a `gmail` connector that points at the Gmail MCP
 * server. The `gmail` id now names the Gmail API service, so that connector is moved onto it:
 * same id, so crew grants and the registered redirect URL still hold. Returns the connector list
 * unchanged (the same array) when there is nothing to move.
 */
export function migrateLegacyGmail(connectors: readonly Connector[]): readonly Connector[] {
  const legacy = (c: Connector) =>
    c.id === GMAIL_PRESET.id &&
    c.transport.type === "http" &&
    serverKey(c.transport.url) === serverKey(GMAIL_MCP_URL);
  if (!connectors.some(legacy)) return connectors;
  return connectors.map((c) =>
    legacy(c) ? { ...c, name: GMAIL_PRESET.name, transport: GMAIL_PRESET.transport } : c,
  );
}
