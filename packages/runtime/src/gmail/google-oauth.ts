import { createHash, randomBytes } from "node:crypto";
import type { StoredOAuthTokens } from "@modelcontextprotocol/client";
import type { KeychainOAuthProvider } from "../mcp/oauth-provider.js";

/**
 * Google's OAuth 2.0 for the Gmail service (ADR-0021), with the Commander's own client: the
 * authorization-code flow with PKCE (S256) and a loopback redirect, per
 * https://developers.google.com/identity/protocols/oauth2/native-app (checked 2026-11-18). The
 * endpoints are fixed, so there is no discovery. Credentials go through the connector's
 * `KeychainOAuthProvider`, as for every other connector: the client and the tokens in the
 * keychain; the verifier and `state` in memory for the one sign-in in progress.
 */
export const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Renew an access token this long before Google's stated expiry. */
const EXPIRY_MARGIN_MS = 60_000;

export type Fetch = typeof fetch;

/** Tokens as stored here: Google's, plus when the access token expires. */
type GoogleTokens = StoredOAuthTokens & { expires_at?: number };

/**
 * The sign-in was refused or is missing: Google will not give a token without the Commander.
 * The stored tokens are gone by the time this is thrown.
 */
export class SignInRequiredError extends Error {
  constructor(message = "the Gmail sign-in is missing or was refused; sign in again") {
    super(message);
    this.name = "SignInRequiredError";
  }
}

const own = async (provider: KeychainOAuthProvider) => {
  const client = await provider.clientInformation();
  if (!client?.client_id)
    throw new Error("Gmail needs your own OAuth app: add its client ID first");
  return client;
};

/**
 * Starts a sign-in: a PKCE verifier and `state` kept by the provider, and the authorization URL
 * handed to it. The provider sets the profile's scope and Google's offline-access parameters.
 */
export async function startGoogleSignIn(provider: KeychainOAuthProvider): Promise<void> {
  const client = await own(provider);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  provider.saveCodeVerifier(verifier);
  const url = new URL(GOOGLE_AUTHORIZATION_URL);
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", provider.redirectUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", provider.state());
  provider.redirectToAuthorization(url);
}

/** Google's token endpoint, form-encoded, with the client secret when there is one. */
async function tokenRequest(
  provider: KeychainOAuthProvider,
  params: Record<string, string>,
  fetchFn: Fetch,
): Promise<{ ok: true; tokens: GoogleTokens } | { ok: false; status: number; error: string }> {
  const client = await own(provider);
  const body = new URLSearchParams({ ...params, client_id: client.client_id });
  if (client.client_secret) body.set("client_secret", client.client_secret);
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    // Google's error code only (`invalid_grant`, `invalid_client`), never the body as a whole.
    const error = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
    return { ok: false, status: res.status, error };
  }
  return { ok: true, tokens: json as unknown as GoogleTokens };
}

const withExpiry = (tokens: GoogleTokens, now: number): GoogleTokens => ({
  ...tokens,
  ...(typeof tokens.expires_in === "number" ? { expires_at: now + tokens.expires_in * 1000 } : {}),
});

/** The callback's code, exchanged for tokens that the provider stores in the keychain. */
export async function finishGoogleSignIn(
  provider: KeychainOAuthProvider,
  code: string,
  fetchFn: Fetch,
  now: () => number = Date.now,
): Promise<void> {
  const verifier = provider.codeVerifier();
  if (!verifier) throw new Error("no Gmail sign-in is in progress; start again");
  const got = await tokenRequest(
    provider,
    {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: provider.redirectUrl,
    },
    fetchFn,
  );
  if (!got.ok) throw new Error(`Google refused the sign-in (${got.error})`);
  await provider.saveTokens(withExpiry(got.tokens, now()));
  await provider.invalidateCredentials("verifier");
}

/**
 * A current access token: the stored one while it has a minute left, else a refreshed one
 * (Google keeps the refresh token, so the old one is kept). A refusal (`invalid_grant`:
 * revoked, expired after Testing's seven days, password changed) deletes the stored tokens and
 * throws `SignInRequiredError`. `force` refreshes even a token that looks current, after Gmail
 * refused it.
 */
export async function googleAccessToken(
  provider: KeychainOAuthProvider,
  fetchFn: Fetch,
  options: { force?: boolean; now?: () => number } = {},
): Promise<string> {
  const now = options.now ?? Date.now;
  const tokens = (await provider.tokens()) as GoogleTokens | undefined;
  if (!tokens?.access_token) throw new SignInRequiredError("Gmail is not signed in");
  const fresh =
    typeof tokens.expires_at === "number" && tokens.expires_at - EXPIRY_MARGIN_MS > now();
  if (fresh && !options.force) return tokens.access_token;
  if (!tokens.refresh_token) {
    await provider.invalidateCredentials("tokens");
    throw new SignInRequiredError("the Gmail sign-in expired and cannot be renewed; sign in again");
  }
  const got = await tokenRequest(
    provider,
    { grant_type: "refresh_token", refresh_token: tokens.refresh_token },
    fetchFn,
  );
  if (!got.ok) {
    // A refused grant needs the Commander; anything else (a 5xx, a network hiccup) may pass.
    if (got.error === "invalid_grant" || got.status === 401) {
      await provider.invalidateCredentials("tokens");
      throw new SignInRequiredError();
    }
    throw new Error(`Google could not renew the Gmail sign-in (${got.error})`);
  }
  const renewed = withExpiry(
    { ...got.tokens, refresh_token: got.tokens.refresh_token ?? tokens.refresh_token },
    now(),
  );
  await provider.saveTokens(renewed);
  return renewed.access_token;
}
