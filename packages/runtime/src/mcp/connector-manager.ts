import {
  type Connector,
  type ConnectorToolCatalog,
  classifyConnectorTool,
  type ToolClass,
} from "@darthsaul/outerworld-ai-core";
import {
  Client,
  StreamableHTTPClientTransport,
  type Transport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type { SecretStore } from "../secrets/store.js";
import type { EventStore } from "../storage/event-store.js";
import { loadStationDir } from "../storage/station-dir.js";
import { KeychainOAuthProvider } from "./oauth-provider.js";

export type ConnectorStatus = "disconnected" | "needs_auth" | "connected" | "error";

export interface ConnectorTool {
  readonly name: string;
  readonly class: ToolClass;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface ConnectorView {
  readonly id: string;
  readonly name: string;
  readonly url?: string;
  readonly status: ConnectorStatus;
  readonly detail?: string;
  readonly tools: readonly ConnectorTool[];
}

/** Builds the transport for a connector; tests pass an in-memory one. */
export type TransportFactory = (
  connector: Connector,
  provider: KeychainOAuthProvider,
) => Promise<Transport> | Transport;

/** A connector tool's result is text for the model, capped like other tool output. */
const MAX_RESULT_CHARS = 64 * 1024;

interface Entry {
  connector: Connector;
  provider: KeychainOAuthProvider;
  status: ConnectorStatus;
  detail?: string;
  client?: Client | undefined;
  /** The transport of a sign-in in progress, to finish the code exchange on. */
  pending?: Transport | undefined;
  authorizationUrl?: string | undefined;
  tools: ConnectorTool[];
  /** Whether the connection should be kept up (reconnect after a drop). */
  wanted: boolean;
  retryTimer?: ReturnType<typeof setTimeout>;
  retries: number;
}

const httpTransport: TransportFactory = (connector, provider) => {
  if (connector.transport.type !== "http") {
    throw new Error("only HTTP connectors are supported in v1 (ADR-0012)");
  }
  return new StreamableHTTPClientTransport(new URL(connector.transport.url), {
    authProvider: provider,
  });
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The runtime's MCP client (brief §12): connectors are installed station-wide in station.json and
 * connected here; agents get their tools through grants. Keeps each connection up, asks for
 * sign-in when a server needs it, classifies tools with our map, and reports every status change
 * as a `connector.status` event.
 */
export class ConnectorManager {
  readonly #home: string;
  readonly #events: EventStore;
  readonly #secrets: SecretStore;
  readonly #redirectUrl: (connectorId: string) => string;
  readonly #transports: TransportFactory;
  readonly #reconnect: { baseMs: number; maxMs: number };
  readonly #entries = new Map<string, Entry>();

  constructor(options: {
    home: string;
    events: EventStore;
    secrets: SecretStore;
    redirectUrl: (connectorId: string) => string;
    transports?: TransportFactory;
    reconnect?: { baseMs: number; maxMs: number };
  }) {
    this.#home = options.home;
    this.#events = options.events;
    this.#secrets = options.secrets;
    this.#redirectUrl = options.redirectUrl;
    this.#transports = options.transports ?? httpTransport;
    this.#reconnect = options.reconnect ?? { baseMs: 1000, maxMs: 60_000 };
  }

  /** On daemon start: read station.json and reconnect connectors that already have a sign-in. */
  async start(): Promise<void> {
    await this.refresh();
    for (const entry of this.#entries.values()) {
      if (await entry.provider.hasTokens()) await this.connect(entry.connector.id);
    }
  }

  async stop(): Promise<void> {
    for (const id of this.#entries.keys()) await this.disconnect(id);
  }

  /** Syncs with station.json: new connectors appear disconnected; removed or changed ones drop. */
  async refresh(): Promise<void> {
    const loaded = await loadStationDir(this.#home);
    const connectors = loaded.station?.connectors ?? [];
    for (const [id, entry] of this.#entries) {
      const now = connectors.find((c) => c.id === id);
      if (!now || JSON.stringify(now.transport) !== JSON.stringify(entry.connector.transport)) {
        await this.disconnect(id);
        this.#entries.delete(id);
      }
    }
    for (const connector of connectors) {
      const existing = this.#entries.get(connector.id);
      if (existing) {
        existing.connector = connector;
        continue;
      }
      const entry: Entry = {
        connector,
        status: "disconnected",
        tools: [],
        wanted: false,
        retries: 0,
        provider: new KeychainOAuthProvider({
          connectorId: connector.id,
          secrets: this.#secrets,
          redirectUrl: this.#redirectUrl(connector.id),
          onAuthorizationUrl: (url) => {
            entry.authorizationUrl = url;
          },
        }),
      };
      this.#entries.set(connector.id, entry);
    }
  }

  views(): ConnectorView[] {
    return [...this.#entries.values()].map((e) => ({
      id: e.connector.id,
      name: e.connector.name,
      ...(e.connector.transport.type === "http" ? { url: e.connector.transport.url } : {}),
      status: e.status,
      ...(e.detail !== undefined ? { detail: e.detail } : {}),
      tools: e.tools,
    }));
  }

  /** Classified tools of every connected connector, for grant resolution. */
  catalog(): ConnectorToolCatalog {
    const out: Record<string, Array<{ name: string; class: ToolClass }>> = {};
    for (const e of this.#entries.values()) {
      if (e.status === "connected")
        out[e.connector.id] = e.tools.map((t) => ({ name: t.name, class: t.class }));
    }
    return out;
  }

  describe(connectorId: string, tool: string): ConnectorTool | undefined {
    return this.#entries.get(connectorId)?.tools.find((t) => t.name === tool);
  }

  /**
   * Connects (or reconnects). When the server needs sign-in, returns `needs_auth` with the URL
   * the Commander must open; the daemon's callback then calls `finishAuth`.
   */
  async connect(
    id: string,
  ): Promise<{ status: ConnectorStatus; authorizationUrl?: string; detail?: string }> {
    const entry = this.#entry(id);
    entry.wanted = true;
    clearTimeout(entry.retryTimer);
    await entry.client?.close().catch(() => undefined);
    entry.client = undefined;
    entry.authorizationUrl = undefined;
    let transport: Transport | undefined;
    try {
      transport = await this.#transports(entry.connector, entry.provider);
      const client = new Client({ name: "outerworld-ai", version: "0.1.0" });
      await client.connect(transport);
      const listed = await client.listTools();
      entry.client = client;
      entry.pending = undefined;
      entry.retries = 0;
      entry.tools = listed.tools.map((t) => ({
        name: t.name,
        class: classifyConnectorTool(t.name, t.annotations ?? {}),
        description: t.description ?? t.name,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
      client.onclose = () => this.#dropped(entry, client);
      this.#set(entry, "connected");
      return { status: "connected" };
    } catch (error) {
      if (error instanceof UnauthorizedError || entry.authorizationUrl) {
        entry.pending = transport;
        entry.tools = [];
        this.#set(entry, "needs_auth", "Sign in to connect");
        return {
          status: "needs_auth",
          ...(entry.authorizationUrl ? { authorizationUrl: entry.authorizationUrl } : {}),
        };
      }
      entry.tools = [];
      this.#set(entry, "error", message(error));
      return { status: "error", detail: message(error) };
    }
  }

  /** The OAuth callback: checks `state`, exchanges the code, and connects. */
  async finishAuth(
    id: string,
    code: string,
    state: string,
  ): Promise<{ status: ConnectorStatus; detail?: string }> {
    const entry = this.#entry(id);
    if (!entry.provider.consumeState(state)) {
      throw new Error("the sign-in link has expired or its state does not match; start again");
    }
    const pending = entry.pending as
      | (Transport & { finishAuth?: (code: string) => Promise<void> })
      | undefined;
    if (!pending?.finishAuth) throw new Error("no sign-in is in progress for this connector");
    await pending.finishAuth(code);
    entry.pending = undefined;
    const result = await this.connect(id);
    return { status: result.status, ...(result.detail ? { detail: result.detail } : {}) };
  }

  async disconnect(id: string, options: { forget?: boolean } = {}): Promise<void> {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.wanted = false;
    clearTimeout(entry.retryTimer);
    const client = entry.client;
    entry.client = undefined;
    entry.pending = undefined;
    entry.tools = [];
    await client?.close().catch(() => undefined);
    if (options.forget) await entry.provider.forget();
    if (entry.status !== "disconnected") this.#set(entry, "disconnected");
  }

  /** Calls a connector tool; a tool-level error (`isError`) is thrown with the server's text. */
  async call(
    connectorId: string,
    tool: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const entry = this.#entry(connectorId);
    if (!entry.client || entry.status !== "connected") {
      throw new Error(`${entry.connector.name} is not connected`);
    }
    const result = await entry.client.callTool(
      { name: tool, arguments: (input ?? {}) as Record<string, unknown> },
      { signal },
    );
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_RESULT_CHARS);
    if (result.isError) throw new Error(text || `${tool} failed`);
    return text || (result.structuredContent ?? null);
  }

  #entry(id: string): Entry {
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`no connector "${id}" on this station`);
    return entry;
  }

  #set(entry: Entry, status: ConnectorStatus, detail?: string) {
    entry.status = status;
    if (detail === undefined) delete entry.detail;
    else entry.detail = detail;
    this.#events.append({
      type: "connector.status",
      payload: {
        connectorId: entry.connector.id,
        status,
        ...(detail !== undefined ? { detail } : {}),
      },
    });
  }

  /** The connection dropped: report it and reconnect with capped backoff while still wanted. */
  #dropped(entry: Entry, client: Client) {
    if (entry.client !== client || !entry.wanted) return;
    entry.client = undefined;
    entry.tools = [];
    this.#set(entry, "disconnected");
    const delay = Math.min(this.#reconnect.baseMs * 2 ** entry.retries, this.#reconnect.maxMs);
    entry.retries++;
    entry.retryTimer = setTimeout(() => {
      if (entry.wanted) void this.connect(entry.connector.id);
    }, delay);
  }
}
