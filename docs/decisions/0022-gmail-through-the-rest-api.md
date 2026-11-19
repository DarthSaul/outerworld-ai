# ADR-0022: Gmail through the Gmail REST API; Gmail MCP shown but not available yet

## Status
Accepted

## Date
2026-11-18

## Context
ADR-0019 added Gmail as Google's hosted Gmail MCP server (`gmailmcp.googleapis.com`). The first
real sign-in worked, but Google refused every tool call with "Access to this tool requires that
your Google Cloud project … is enrolled in the Google Workspace Developer Preview Program". The
owner has applied, and approval takes days or more. Meanwhile the owner wants Gmail working.

The Gmail REST API (`gmail.googleapis.com`) is generally available. It covers everything the MCP
server offered and needs only the Gmail API enabled in the Cloud project. Google's docs were
checked on 2026-11-18 through the Google developer knowledge server:
- the native-app OAuth guide;
- the Gmail API scopes;
- `threads.list` / `get` / `modify` / `trash`;
- `drafts.create` and threading;
- `labels.list`.

## Decision
- **Four abilities.**
  - **Gmail** (`gmail`): the Gmail REST API.
  - **Gmail MCP** (`gmail-mcp`): Google's MCP server, renamed. Discover shows it with
    "Not yet available" and no Add button. `isPresetAvailable` and `AVAILABLE_PRESET_IDS` in core
    gate it, so `POST /api/connectors` refuses it with 400.
  - Notion and GitHub are unchanged.
- **The new ability keeps the `gmail` id.** The redirect URL the owner already registered with
  Google (`…/oauth/callback/gmail`) stays valid, and so do crew grants.
- **A builtin transport.** `ConnectorTransport` gains `{ type: "builtin", service: "gmail" }`. The
  runtime reaches the service itself, and station.json still holds no secrets.
- **An in-process MCP adapter, not a new code path.** The Gmail service is an `McpServer` that
  runs in memory inside the daemon, over `InMemoryTransport`, with no port and no process. Its
  six tool handlers call the Gmail API with `fetch`. `ConnectorManager` therefore handles it like
  any connector: grants, the catalog, `gmail__<tool>` names, read/write classes, consent, status
  events, the own OAuth client in the keychain, and the `/oauth/callback/:id` sign-in. The
  alternative was native runtime tools. It would have needed a second, non-MCP branch through the
  manager, grant resolution, and the views, so the owner chose the adapter.
- **Tools.** The same set as the MCP server.
  - Read: `search_threads` (Gmail search syntax, at most 20 per call, each summarized from
    `format=metadata`), `get_thread` (text bodies, HTML made readable, 8000 characters per
    message), and `list_labels`.
  - Write: `create_draft`, `modify_thread_labels`, and `trash_thread`. These classes are listed in
    core's `KNOWN_TOOL_CLASSES`, which is authoritative.
  - `create_draft` with a `threadId` replies inside the thread. It takes the subject (`Re:` once)
    and `In-Reply-To`/`References` from the last message, which is what Gmail requires to thread
    a message.
  - **Nothing sends.** No tool calls `messages.send` or `drafts.send`; the Commander sends drafts
    from Gmail.
- **Building and reading mail is pure and lives in core** (`packages/core/src/mail/`).
  - Building: an RFC 2822 plain-text message with a base64 UTF-8 body and RFC 2047 subjects, then
    base64url for Gmail's `raw`.
  - Reading: decoding `format=full` parts in their charset.
  - Header values with CR or LF are refused, so a tool input can't add a header.
- **OAuth is ours, with fixed Google endpoints and no discovery** (`runtime/src/gmail/google-oauth.ts`).
  - The authorization-code flow uses PKCE S256, `state`, the loopback redirect, and the
    Commander's own client. The secret is sent in the token request body when there is one.
  - Scope is `gmail.modify` with `access_type=offline` and `prompt=consent`, as for Gmail MCP.
  - Tokens are stored with `expires_at`, renewed a minute before expiry, and renewed once more if
    Gmail answers 401.
  - `invalid_grant` deletes the stored tokens. The tool result is then an error, and the manager
    sees the sign-in gone and asks the Commander to sign in again. That is the ADR-0019 amendment's
    behaviour, reached through a dropped token instead of a thrown `UnauthorizedError`.
- **Setup steps.**
  1. Enable the Gmail API.
  2. Set up the consent screen and add test users. This step says that in Testing, Google ends
     each sign-in after seven days.
  3. Add the scope under Data Access.
  4. Create a Web application client with the redirect URL. A client made for Gmail MCP works.
  5. Paste the client ID and secret.
- **Migration.** At daemon start, a `gmail` connector at the MCP server's URL moves onto the
  builtin transport (`migrateLegacyGmailConnector`):
  - its stored OAuth app is copied to the new keychain key;
  - the MCP server's tokens and registration are deleted;
  - the Commander only signs in again.

  It runs before the HTTP app exists, so nothing else writes station.json at the same time.
- A builtin connector has no server URL. `PATCH /api/connectors/:id` with a `url` returns 409 for
  it, and its card has no URL field. Its view reports `service: "gmail"` in place of `url`. The SPA
  finds its setup steps with `ownClientProfileOf({ url, service })`.
- Cards show the kind: Gmail as `API`, the others as `MCP server`. Both Gmail cards use Gmail's
  logo.

## Consequences
- Gmail works without the preview program.
- A consent screen left in Testing means a weekly sign-in. Publishing the app (in production,
  unverified, for the owner's own account) avoids it.
- `gmail.modify` is a restricted scope. Google requires verification before a public app may ask
  for it. An app kept in Testing for its owner's account shows Google's unverified-app warning
  instead. The owner should expect that screen, not a failure.
- Mail content now reaches the model through tool results and is stored in SQLite like any tool
  result (`docs/PRIVACY.md`).
- When preview access arrives, making Gmail MCP available is a one-line change in core
  (`UNAVAILABLE_PRESETS`). Both abilities can be installed side by side.
- Tested with a fake Google, with no network. A real sign-in and tool call have not been run from
  the tests.
