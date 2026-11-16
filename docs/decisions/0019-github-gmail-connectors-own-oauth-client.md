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
