import { InMemoryTransport, type Transport } from "@modelcontextprotocol/client";
import type { KeychainOAuthProvider } from "../mcp/oauth-provider.js";
import { GmailApi } from "./gmail-api.js";
import { createGmailServer } from "./gmail-server.js";
import { type Fetch, finishGoogleSignIn, googleAccessToken } from "./google-oauth.js";

/** A transport that can finish a sign-in, as the connector manager's callback expects. */
export type SignInTransport = Transport & { finishAuth(code: string): Promise<void> };

/**
 * The Gmail service as a connector transport (ADR-0021): the client end of an in-memory pair
 * whose other end is the Gmail MCP adapter, calling Google with the connector's keychain sign-in.
 * `finishAuth` exchanges the callback's code with Google.
 */
export async function gmailTransport(
  provider: KeychainOAuthProvider,
  fetchFn: Fetch,
  now: () => number = Date.now,
): Promise<SignInTransport> {
  const api = new GmailApi({
    fetch: fetchFn,
    token: (o) => googleAccessToken(provider, fetchFn, { ...o, now }),
  });
  // Gmail refused even a renewed token: drop it, so the manager asks the Commander to sign in.
  const server = createGmailServer(api, {
    onSignInRequired: () => provider.invalidateCredentials("tokens"),
  });
  const [client, serverEnd] = InMemoryTransport.createLinkedPair();
  await server.connect(serverEnd);
  return Object.assign(client, {
    finishAuth: (code: string) => finishGoogleSignIn(provider, code, fetchFn, now),
  });
}
