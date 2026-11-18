import { createHash, randomBytes } from "node:crypto";
import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import type { SecretStore } from "../secrets/store.js";

/** A dynamic registration, the tokens, or the Commander's own OAuth client (ADR-0019). */
type SecretKind = "client" | "tokens" | "own";

/** The Commander's own OAuth client for a server that registers none (ADR-0019). */
export interface OwnClient {
  readonly clientId: string;
  readonly clientSecret?: string | undefined;
}

/**
 * What a server's sign-in asks for beyond the SDK's defaults (ADR-0019): a scope in place of every
 * scope the server lists, and extra authorization parameters (Google's offline access).
 */
export interface AuthorizationRequest {
  readonly scope?: string | undefined;
  readonly params?: Readonly<Record<string, string>> | undefined;
}

/**
 * The keychain account for a connector's sign-in: the connector id plus a hash of the server URL
 * the sign-in was made for. A sign-in is only ever read back for that same server, so a station
 * whose connector shares an id but points elsewhere (a demo placeholder, a changed URL) never
 * sends another server's tokens, and two stations never overwrite each other's sign-in.
 */
export function connectorSecretKey(connectorId: string, server: string, kind: SecretKind): string {
  const hash = createHash("sha256").update(server).digest("hex").slice(0, 16);
  return `mcp.${connectorId}.${hash}.${kind}`;
}

/** Where sign-ins were kept before they were tied to a server; never read, only forgotten. */
const legacyKey = (connectorId: string, kind: "client" | "tokens") => `mcp.${connectorId}.${kind}`;

/**
 * OAuth for one connector (ADR-0012), with the MCP SDK doing discovery, dynamic client
 * registration, PKCE, and refresh. The registered client and the tokens live in the OS keychain;
 * the PKCE verifier and the `state` live only in memory for the one sign-in in progress. The
 * redirect is the daemon's loopback callback, so a new daemon port means registering again.
 * Both are kept per server (`connectorSecretKey`).
 */
export class KeychainOAuthProvider implements OAuthClientProvider {
  readonly #connectorId: string;
  readonly #server: string;
  readonly #secrets: SecretStore;
  readonly #redirectUrl: string;
  readonly #onAuthorizationUrl: (url: string) => void;
  readonly #authorization: AuthorizationRequest;
  #verifier = "";
  #state: string | undefined;
  /** Bumped by forget and by a new own client: attempts begun before never write credentials. */
  #epoch = 0;
  /** Bumped by every attempt: only the newest one sets the verifier, the state, and the URL. */
  #attempts = 0;

  constructor(options: {
    connectorId: string;
    /** The server URL the sign-in is for. */
    server: string;
    secrets: SecretStore;
    redirectUrl: string;
    onAuthorizationUrl: (url: string) => void;
    authorization?: AuthorizationRequest | undefined;
  }) {
    this.#connectorId = options.connectorId;
    this.#server = options.server;
    this.#secrets = options.secrets;
    this.#redirectUrl = options.redirectUrl;
    this.#onAuthorizationUrl = options.onAuthorizationUrl;
    this.#authorization = options.authorization ?? {};
  }

  #key(kind: SecretKind) {
    return connectorSecretKey(this.#connectorId, this.#server, kind);
  }

  async #read<T>(kind: SecretKind): Promise<T | undefined> {
    const raw = await this.#secrets.get(this.#key(kind));
    return raw ? (JSON.parse(raw) as T) : undefined;
  }

  get redirectUrl(): string {
    return this.#redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Outerworld AI",
      redirect_uris: [this.#redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(this.#authorization.scope ? { scope: this.#authorization.scope } : {}),
    };
  }

  state(): string {
    this.#state = randomBytes(24).toString("base64url");
    return this.#state;
  }

  /** True once for the state of the sign-in in progress; any other value is refused. */
  consumeState(state: string): boolean {
    if (this.#state === undefined || state !== this.#state) return false;
    this.#state = undefined;
    return true;
  }

  async clientInformation(): Promise<StoredOAuthClientInformation | undefined> {
    // The Commander's own client wins; it is registered with the provider, not here, so it is
    // never dropped for a changed port.
    const own = await this.#read<OwnClient>("own");
    if (own) {
      return {
        client_id: own.clientId,
        redirect_uris: [this.#redirectUrl],
        ...(own.clientSecret
          ? { client_secret: own.clientSecret, token_endpoint_auth_method: "client_secret_post" }
          : {}),
      };
    }
    const info = await this.#read<StoredOAuthClientInformation & { redirect_uris?: string[] }>(
      "client",
    );
    // Registered for another port: register again rather than send a redirect it does not know.
    if (info?.redirect_uris && !info.redirect_uris.includes(this.#redirectUrl)) return undefined;
    return info;
  }

  /**
   * This provider as one connection attempt sees it. The SDK saves tokens (a refresh, a code
   * exchange) and client registrations through it, and clears them on some errors; once a forget
   * or a new own client lands after the attempt began, those writes and clears are dropped, so a
   * superseded attempt never restores what was deleted nor deletes what replaced it. Attempts
   * begun afterwards get a view of their own and write as usual.
   *
   * The sign-in in progress (PKCE verifier, `state`, authorization URL) belongs to the newest
   * attempt alone, even across a disconnect and reconnect that leave the epoch unchanged: an
   * older attempt that finishes discovery late never replaces them.
   */
  forAttempt(): KeychainOAuthProvider {
    const epoch = this.#epoch;
    const attempt = ++this.#attempts;
    const current = () => this.#epoch === epoch;
    const newest = () => this.#attempts === attempt;
    return new Proxy(this, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        const method = value as (...args: unknown[]) => unknown;
        // Writes and deletes alike: a superseded attempt neither restores credentials nor wipes
        // the ones a newer attempt saved.
        if (prop === "saveCodeVerifier" || prop === "redirectToAuthorization") {
          return (...args: unknown[]) => (newest() ? method.apply(target, args) : undefined);
        }
        // A superseded attempt gets a state of its own that no callback will ever match.
        if (prop === "state") {
          return () => (newest() ? method.apply(target) : randomBytes(24).toString("base64url"));
        }
        if (
          prop === "saveTokens" ||
          prop === "saveClientInformation" ||
          prop === "invalidateCredentials"
        ) {
          return async (...args: unknown[]) => {
            if (current()) await method.apply(target, args);
          };
        }
        return method.bind(target);
      },
    });
  }

  async saveClientInformation(info: StoredOAuthClientInformation): Promise<void> {
    await this.#secrets.set(this.#key("client"), JSON.stringify(info));
  }

  /** Stores the Commander's own OAuth client; a sign-in made with another client is dropped. */
  async setOwnClient(client: OwnClient): Promise<void> {
    this.#epoch++;
    await this.#secrets.set(
      this.#key("own"),
      JSON.stringify({
        clientId: client.clientId,
        ...(client.clientSecret ? { clientSecret: client.clientSecret } : {}),
      }),
    );
    await this.invalidateCredentials("all");
  }

  /** Whether the Commander's own OAuth client is stored (never what it is). */
  async hasOwnClient(): Promise<boolean> {
    return (await this.#secrets.get(this.#key("own"))) !== undefined;
  }

  async tokens(): Promise<StoredOAuthTokens | undefined> {
    return this.#read<StoredOAuthTokens>("tokens");
  }

  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    await this.#secrets.set(this.#key("tokens"), JSON.stringify(tokens));
  }

  /**
   * Hands the sign-in URL to the daemon. The SDK picks the scope from the server's metadata;
   * a profiled server's own scope and parameters (ADR-0019) replace what it picked.
   */
  redirectToAuthorization(url: URL): void {
    const out = new URL(url.href);
    if (this.#authorization.scope) out.searchParams.set("scope", this.#authorization.scope);
    for (const [k, v] of Object.entries(this.#authorization.params ?? {})) {
      out.searchParams.set(k, v);
    }
    this.#onAuthorizationUrl(out.href);
  }

  saveCodeVerifier(verifier: string): void {
    this.#verifier = verifier;
  }

  codeVerifier(): string {
    return this.#verifier;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "all" || scope === "client") await this.#secrets.delete(this.#key("client"));
    if (scope === "all" || scope === "tokens") await this.#secrets.delete(this.#key("tokens"));
    if (scope === "all" || scope === "verifier") this.#verifier = "";
  }

  /** Whether a sign-in is stored (so the daemon can reconnect on startup without asking). */
  async hasTokens(): Promise<boolean> {
    return (await this.#secrets.get(this.#key("tokens"))) !== undefined;
  }

  /**
   * Disconnect and forget: removes the tokens and the client registration, and any sign-in this
   * connector id had from before sign-ins were tied to a server. The Commander's own OAuth client
   * stays unless `ownClient` is set (the connector is being removed).
   */
  async forget(options: { ownClient?: boolean } = {}): Promise<void> {
    this.#epoch++;
    await this.invalidateCredentials("all");
    if (options.ownClient) await this.#secrets.delete(this.#key("own"));
    await this.#secrets.delete(legacyKey(this.#connectorId, "client"));
    await this.#secrets.delete(legacyKey(this.#connectorId, "tokens"));
  }
}
