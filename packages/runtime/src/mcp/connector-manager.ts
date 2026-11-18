import {
  type Connector,
  type ConnectorToolCatalog,
  classifyConnectorTool,
  needsOwnClient,
  ownClientProfile,
  type ToolClass,
} from "@darthsaul/outerworld-ai-core";
import {
  auth,
  Client,
  InsufficientScopeError,
  IssuerMismatchError,
  StreamableHTTPClientTransport,
  type Transport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { ConflictError, NotFoundError } from "../crew/crew-service.js";
import type { SecretStore } from "../secrets/store.js";
import type { EventStore } from "../storage/event-store.js";
import { loadStationDir } from "../storage/station-dir.js";
import { KeychainOAuthProvider, type OwnClient } from "./oauth-provider.js";

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
  /**
   * For a server that registers no clients (ADR-0019): whether the Commander's own OAuth client
   * is stored, and the redirect URL to register it with. Never the client itself.
   */
  readonly ownClient?: { readonly set: boolean; readonly redirectUrl: string };
  /** While it needs sign-in: where to sign in, so the card can offer it whoever asked. */
  readonly authorizationUrl?: string;
}

/** Builds the transport for a connector; tests pass an in-memory one. */
export type TransportFactory = (
  connector: Connector,
  provider: KeychainOAuthProvider,
) => Promise<Transport> | Transport;

/**
 * Starts a sign-in without a connection: discovery, then the authorization URL through the
 * provider. For a server that answers without a token until a tool is called (Gmail's does), so
 * an unsigned connection is never taken for a working one. Tests pass a fake.
 */
export type SignInStarter = (
  connector: Connector,
  provider: KeychainOAuthProvider,
) => Promise<void>;

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
  /** Whether the Commander's own OAuth client is stored, for a server that needs one. */
  ownClient: boolean;
  /** Bumped by every disconnect: a connect that began before one never installs its client. */
  generation: number;
  /**
   * Bumped only by a disconnect the Commander (or the daemon) asked for, not by the one a client
   * replacement makes: a connect waiting on that replacement gives up if this changes meanwhile.
   */
  cancels: number;
  /** Sign-in completions and client replacements, one at a time, in order. */
  auth: Promise<unknown>;
  /** How many of those are queued or running. */
  authQueued: number;
}

const httpTransport: TransportFactory = (connector, provider) => {
  if (connector.transport.type !== "http") {
    throw new Error("only HTTP connectors are supported in v1 (ADR-0012)");
  }
  return new StreamableHTTPClientTransport(new URL(connector.transport.url), {
    authProvider: provider,
  });
};

const sdkSignIn: SignInStarter = async (connector, provider) => {
  if (connector.transport.type !== "http") {
    throw new Error("only HTTP connectors are supported in v1 (ADR-0012)");
  }
  await auth(provider, { serverUrl: new URL(connector.transport.url) });
};

/** What a sign-in is tied to: the server URL, or the whole transport for a non-HTTP one. */
const serverOf = (connector: Connector) =>
  connector.transport.type === "http"
    ? connector.transport.url
    : JSON.stringify(connector.transport);

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
  readonly #signIn: SignInStarter;
  readonly #reconnect: { baseMs: number; maxMs: number };
  readonly #entries = new Map<string, Entry>();

  constructor(options: {
    home: string;
    events: EventStore;
    secrets: SecretStore;
    redirectUrl: (connectorId: string) => string;
    transports?: TransportFactory;
    signIn?: SignInStarter;
    reconnect?: { baseMs: number; maxMs: number };
  }) {
    this.#home = options.home;
    this.#events = options.events;
    this.#secrets = options.secrets;
    this.#redirectUrl = options.redirectUrl;
    this.#transports = options.transports ?? httpTransport;
    this.#signIn = options.signIn ?? sdkSignIn;
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
      const profile = ownClientProfile(
        connector.transport.type === "http" ? connector.transport.url : undefined,
      );
      const entry: Entry = {
        connector,
        status: "disconnected",
        tools: [],
        wanted: false,
        retries: 0,
        ownClient: false,
        generation: 0,
        cancels: 0,
        auth: Promise.resolve(),
        authQueued: 0,
        provider: new KeychainOAuthProvider({
          connectorId: connector.id,
          server: serverOf(connector),
          secrets: this.#secrets,
          redirectUrl: this.#redirectUrl(connector.id),
          onAuthorizationUrl: (url) => {
            entry.authorizationUrl = url;
          },
          authorization: { scope: profile?.scope, params: profile?.authorizationParams },
        }),
      };
      this.#entries.set(connector.id, entry);
      if (needsOwnClient(connector)) entry.ownClient = await entry.provider.hasOwnClient();
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
      ...(needsOwnClient(e.connector)
        ? { ownClient: { set: e.ownClient, redirectUrl: this.#redirectUrl(e.connector.id) } }
        : {}),
      ...(e.status === "needs_auth" && e.authorizationUrl
        ? { authorizationUrl: e.authorizationUrl }
        : {}),
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
    // Waits for sign-in completions and client replacements already queued, so it reads the
    // client they leave. It does not join the queue: a slow server never holds up a replacement,
    // whose disconnect makes this attempt stale instead. With none queued it does not yield, so a
    // disconnect right after it still supersedes it.
    if (entry.authQueued > 0) {
      const cancels = entry.cancels;
      await entry.auth;
      // Disconnected while it waited: that stands.
      if (entry.cancels !== cancels) return { status: entry.status };
    }
    if (needsOwnClient(entry.connector) && !entry.ownClient) {
      const detail = `${entry.connector.name} needs your own OAuth app: add its client ID first`;
      this.#set(entry, "error", detail);
      return { status: "error", detail };
    }
    entry.wanted = true;
    const generation = entry.generation;
    // A disconnect landed while this connect waited: it is superseded and changes nothing.
    const stale = () => entry.generation !== generation;
    clearTimeout(entry.retryTimer);
    await entry.client?.close().catch(() => undefined);
    entry.client = undefined;
    entry.authorizationUrl = undefined;
    // A server that needs the Commander's own client may answer without a token until a tool is
    // called: without a stored sign-in, sign in first rather than trust that answer.
    if (needsOwnClient(entry.connector) && !(await entry.provider.hasTokens())) {
      return this.#beginSignIn(entry, stale);
    }
    let transport: Transport | undefined;
    try {
      // Its own view of the provider: a forget after this point drops its credential writes.
      transport = await this.#transports(entry.connector, entry.provider.forAttempt());
      const client = new Client({ name: "outerworld-ai", version: "0.1.0" });
      await client.connect(transport);
      const listed = await client.listTools();
      if (stale()) {
        await client.close().catch(() => undefined);
        return { status: entry.status };
      }
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
      if (stale()) return { status: entry.status };
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

  /** Asks for sign-in without connecting; the callback finishes it on the transport kept here. */
  async #beginSignIn(
    entry: Entry,
    stale: () => boolean,
  ): Promise<{ status: ConnectorStatus; authorizationUrl?: string; detail?: string }> {
    let transport: Transport | undefined;
    try {
      const provider = entry.provider.forAttempt();
      transport = await this.#transports(entry.connector, provider);
      await this.#signIn(entry.connector, provider);
      if (stale()) {
        await transport.close().catch(() => undefined);
        return { status: entry.status };
      }
      if (!entry.authorizationUrl) throw new Error("the server did not offer a sign-in");
      entry.pending = transport;
      entry.tools = [];
      this.#set(entry, "needs_auth", "Sign in to connect");
      return { status: "needs_auth", authorizationUrl: entry.authorizationUrl };
    } catch (error) {
      await transport?.close().catch(() => undefined);
      if (stale()) return { status: entry.status };
      entry.tools = [];
      this.#set(entry, "error", message(error));
      return { status: "error", detail: message(error) };
    }
  }

  /**
   * The OAuth callback: checks `state`, exchanges the code, and connects. `iss` is the callback's
   * issuer, which the SDK checks against the authorization server's (RFC 9207); a server that
   * advertises it (Notion does) is refused without it.
   */
  async finishAuth(
    id: string,
    code: string,
    state: string,
    iss?: string,
  ): Promise<{ status: ConnectorStatus; detail?: string }> {
    const entry = this.#entry(id);
    const generation = entry.generation;
    // Serialized with client replacement: a new client never sees tokens from the old one's
    // exchange, and an exchange after a replacement finds no sign-in in progress.
    await this.#serialAuth(entry, () => this.#exchange(entry, code, state, iss));
    // A disconnect landed during the exchange: it stands, and nothing reconnects.
    if (entry.generation !== generation) {
      return { status: entry.status, ...(entry.detail ? { detail: entry.detail } : {}) };
    }
    const result = await this.connect(id);
    return { status: result.status, ...(result.detail ? { detail: result.detail } : {}) };
  }

  async #exchange(entry: Entry, code: string, state: string, iss?: string): Promise<void> {
    if (!entry.provider.consumeState(state)) {
      throw new Error("the sign-in link has expired or its state does not match; start again");
    }
    const pending = entry.pending as
      | (Transport & { finishAuth?: (code: string, iss?: string) => Promise<void> })
      | undefined;
    if (!pending?.finishAuth) throw new Error("no sign-in is in progress for this connector");
    try {
      await pending.finishAuth(code, iss);
    } catch (error) {
      // The issuer received is attacker-controllable: never repeat it (the SDK's guidance).
      if (error instanceof IssuerMismatchError) {
        throw new Error(
          "the sign-in response could not be verified as coming from the connector's server; start again",
        );
      }
      throw error;
    }
    entry.pending = undefined;
  }

  /** Runs `task` after every earlier sign-in completion or client replacement for this entry. */
  #serialAuth<T>(entry: Entry, task: () => Promise<T>): Promise<T> {
    entry.authQueued++;
    const counted = async () => {
      try {
        return await task();
      } finally {
        entry.authQueued--;
      }
    };
    const run = entry.auth.then(counted, counted);
    entry.auth = run.catch(() => undefined);
    return run;
  }

  /**
   * The service ended a sign-in with an error: spends its `state` so the link cannot be reused.
   * True only when the state is the one this sign-in issued.
   */
  cancelAuth(id: string, state: string): boolean {
    const entry = this.#entries.get(id);
    if (!entry?.provider.consumeState(state)) return false;
    entry.pending = undefined;
    return true;
  }

  /**
   * Stores the Commander's own OAuth client for a server that registers none (ADR-0019), in the
   * keychain. Any sign-in made before is dropped; the next connect signs in with this client.
   */
  async setOwnClient(id: string, client: OwnClient): Promise<void> {
    const entry = this.#entry(id);
    if (!needsOwnClient(entry.connector)) {
      throw new ConflictError(`${entry.connector.name} registers its own sign-in clients`);
    }
    await this.#serialAuth(entry, async () => {
      await this.#takeDown(entry);
      await entry.provider.setOwnClient(client);
      entry.ownClient = true;
    });
  }

  async disconnect(
    id: string,
    options: { forget?: boolean; ownClient?: boolean } = {},
  ): Promise<void> {
    const entry = this.#entries.get(id);
    if (!entry) return;
    entry.cancels++;
    await this.#takeDown(entry);
    if (!options.forget) return;
    // After any code exchange or client replacement already under way, so neither writes its
    // tokens or client back once they are deleted.
    await this.#serialAuth(entry, async () => {
      await entry.provider.forget({ ownClient: options.ownClient ?? false });
      if (options.ownClient) entry.ownClient = false;
    });
  }

  /** Closes the connection and drops any sign-in in progress; a connect under way goes stale. */
  async #takeDown(entry: Entry): Promise<void> {
    entry.wanted = false;
    entry.generation++;
    clearTimeout(entry.retryTimer);
    const client = entry.client;
    entry.client = undefined;
    entry.pending = undefined;
    entry.tools = [];
    await client?.close().catch(() => undefined);
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
    const client = entry.client;
    const asked = entry.authorizationUrl;
    let result: Awaited<ReturnType<Client["callTool"]>>;
    try {
      result = await client.callTool(
        { name: tool, arguments: (input ?? {}) as Record<string, unknown> },
        { signal },
      );
    } catch (error) {
      // The server refused the sign-in (expired with no refresh, revoked, too narrow): the SDK
      // could not renew it without the Commander, so ask them, and say so to the agent.
      const refused =
        error instanceof UnauthorizedError ||
        error instanceof InsufficientScopeError ||
        entry.authorizationUrl !== asked;
      if (!refused) throw error;
      await this.#signInAgain(entry, client);
      throw new Error(
        `${entry.connector.name} refused the sign-in. The Commander must sign in again from the connector's card in Settings; nothing was done.`,
      );
    }
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_RESULT_CHARS);
    if (result.isError) throw new Error(text || `${tool} failed`);
    return text || (result.structuredContent ?? null);
  }

  /** A tool call found the sign-in refused: drop it and ask for a new one, once per client. */
  async #signInAgain(entry: Entry, client: Client): Promise<void> {
    if (entry.client !== client) return;
    await this.#takeDown(entry);
    await entry.provider.invalidateCredentials("tokens");
    await this.connect(entry.connector.id);
  }

  #entry(id: string): Entry {
    const entry = this.#entries.get(id);
    if (!entry) throw new NotFoundError(`no connector "${id}" on this station`);
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
