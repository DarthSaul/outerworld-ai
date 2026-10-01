import { randomBytes } from "node:crypto";
import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import type { SecretStore } from "../secrets/store.js";

/**
 * OAuth for one connector (ADR-0012), with the MCP SDK doing discovery, dynamic client
 * registration, PKCE, and refresh. The registered client and the tokens live in the OS keychain;
 * the PKCE verifier and the `state` live only in memory for the one sign-in in progress. The
 * redirect is the daemon's loopback callback, so a new daemon port means registering again.
 */
export class KeychainOAuthProvider implements OAuthClientProvider {
  readonly #connectorId: string;
  readonly #secrets: SecretStore;
  readonly #redirectUrl: string;
  readonly #onAuthorizationUrl: (url: string) => void;
  #verifier = "";
  #state: string | undefined;

  constructor(options: {
    connectorId: string;
    secrets: SecretStore;
    redirectUrl: string;
    onAuthorizationUrl: (url: string) => void;
  }) {
    this.#connectorId = options.connectorId;
    this.#secrets = options.secrets;
    this.#redirectUrl = options.redirectUrl;
    this.#onAuthorizationUrl = options.onAuthorizationUrl;
  }

  #key(kind: "client" | "tokens") {
    return `mcp.${this.#connectorId}.${kind}`;
  }

  async #read<T>(kind: "client" | "tokens"): Promise<T | undefined> {
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
    const info = await this.#read<StoredOAuthClientInformation & { redirect_uris?: string[] }>(
      "client",
    );
    // Registered for another port: register again rather than send a redirect it does not know.
    if (info?.redirect_uris && !info.redirect_uris.includes(this.#redirectUrl)) return undefined;
    return info;
  }

  async saveClientInformation(info: StoredOAuthClientInformation): Promise<void> {
    await this.#secrets.set(this.#key("client"), JSON.stringify(info));
  }

  async tokens(): Promise<StoredOAuthTokens | undefined> {
    return this.#read<StoredOAuthTokens>("tokens");
  }

  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    await this.#secrets.set(this.#key("tokens"), JSON.stringify(tokens));
  }

  redirectToAuthorization(url: URL): void {
    this.#onAuthorizationUrl(url.href);
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

  /** Disconnect and forget: removes the tokens and the client registration. */
  async forget(): Promise<void> {
    await this.invalidateCredentials("all");
  }
}
