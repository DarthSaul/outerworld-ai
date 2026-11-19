# ADR-0019: GitHub and Gmail connector presets, signed in with the Commander's own OAuth app

## Status
Accepted

## Date
2026-11-16

## Context
Notion was the only connector preset (ADR-0012). The owner asked for GitHub and Gmail too. Both
have hosted MCP servers over streamable HTTP:

- GitHub: `https://api.githubcopilot.com/mcp/` (github/github-mcp-server).
- Gmail: `https://gmailmcp.googleapis.com/mcp/v1` (Google's Gmail MCP reference, a preview).

Neither server supports OAuth dynamic client registration, which is how the runtime signs in to
Notion. A client has to be registered ahead of time with GitHub or Google, and its client id
(and, for those providers, a client secret) has to be sent with the sign-in.

## Decision
- **Presets.** Core's `CONNECTOR_PRESETS` holds Notion, GitHub, and Gmail. `POST /api/connectors`
  takes `{ preset: "notion" | "github" | "gmail" }`. Settings → Connectors offers one Add button
  for each preset the station doesn't have yet.
- **Own OAuth app.** `needsOwnClient(connector)` is true for the GitHub and Gmail server URLs. The
  check uses the URL, not the id, so a connector pointed at another server registers as usual.
  - **What the Commander does.** They register an OAuth app with the provider, using the redirect
    URL the card shows (the daemon's loopback callback), and paste the client id and optional
    secret into the card.
  - **Endpoint.** `PUT /api/connectors/:id/client` takes `{ clientId, clientSecret? }`.
  - **Where it's stored.** The client goes in the keychain at `mcp.<id>.<server hash>.own`. It is
    never returned; the list reports only `ownClient: { set, redirectUrl }`.
  - **How sign-in uses it.** When present, the stored client is used instead of a dynamic
    registration. A secret is sent with `client_secret_post`. Saving a client drops any earlier
    sign-in.
  - **What deletes it.** "Disconnect and forget sign-in" keeps the client. Removing the connector
    deletes it.
- **No client, no connect.** Connecting without a client fails at once, and the error says to add
  the client id.
- **Tool classes.** These come from the servers' MCP annotations (a read-only hint without a
  destructive one is `read`; everything else is `write`). We keep no hand-written map for
  GitHub or Gmail yet. Every unknown tool therefore asks under *Ask first*.

## Consequences
- More setup for the Commander than Notion's one-click sign-in. GitHub and Google don't offer
  dynamic registration, so this can't be avoided today.
- A client secret now lives in the keychain beside tokens (`docs/PRIVACY.md`).
- Neither server has been smoke-tested from here. They can't be reached in tests, and the URLs
  and auth behaviour come from the providers' docs (checked 2026-11-16). Gmail's server is a
  preview, so its scopes and tools may change.

## Amendment (2026-11-18): sign in before connecting; Gmail's scope and offline access

**What went wrong.** Gmail's server answers `initialize` and `tools/list` without a token and
refuses only `tools/call` (401). The manager signed in only when the server refused the
connection, so Gmail showed as connected without a sign-in ever having happened. Every tool call
then failed with "Unauthorized", and nothing on the card asked the Commander to sign in.

**Decision.**
- **Sign in first.** A connector that needs the Commander's own client and has no stored sign-in
  starts one before connecting (the SDK's `auth()`: discovery, then the authorization URL; tests
  inject a `SignInStarter`). It reports `needs_auth`, never `connected`, until the code exchange.
- **A refused tool call asks again.** When a tool call fails with `UnauthorizedError` or
  `InsufficientScopeError` (the SDK could not refresh), the connection is closed, the refused
  tokens are deleted, and a new sign-in starts. The agent gets an error that says the Commander
  must sign in again. Connector views carry `authorizationUrl` while `needs_auth`, so the card
  offers the sign-in whoever started it.
- **A profile per server.** Core's `ownClientProfile(url)` gives the scope, extra authorization
  parameters, and the setup steps (glossary keys plus links to the provider's console) for each
  server that needs the Commander's own client. `needsOwnClient` is derived from it.
- **Gmail asks for `https://www.googleapis.com/auth/gmail.modify`.** The SDK otherwise asks for
  every scope the server lists, including full mailbox access (`https://mail.google.com/`).
  `gmail.modify` covers every tool the server offers: read, draft, label, trash, and spam. It
  cannot delete permanently, and the server has no send tool. Google's own guide suggests
  `gmail.readonly` plus `gmail.compose`, but that pair cannot label, and labeling is most of
  triage.
- **Gmail asks for offline access.** `access_type=offline` and `prompt=consent` make Google issue
  a refresh token. Without one, the sign-in lapses after about an hour.
- GitHub keeps the server's scopes and no extra parameters.

**Consequences.** Saving an OAuth app starts the sign-in straight away. Google's setup has a step
that is easy to miss, enabling the Gmail MCP API (`gmailmcp.googleapis.com`) as well as the Gmail
API, so the card lists it first. The sign-in URL was checked against Google's live discovery on
2026-11-18 (scope, `access_type`, `prompt`, `resource`, PKCE). A full sign-in with a real account
has not been run from the tests.

Later the same day, the first real sign-in got past OAuth and then hit a project-level refusal on
every tool call: "Access to this tool requires that your Google Cloud project … is enrolled in the
Google Workspace Developer Preview Program". The Gmail MCP server is a Developer Preview, so the
card now lists enrolling in that program as Gmail's first setup step.

**Superseded in part by ADR-0022 (2026-11-18).** The `gmail` id is now the Gmail REST API
service. This server stays in the catalog as **Gmail MCP** (`gmail-mcp`), shown but not
available until the preview access comes through.
