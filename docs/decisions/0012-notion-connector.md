# ADR-0012: Notion connector over hosted MCP with OAuth; per-agent grant is on or off

## Status
Accepted

## Date
2026-09-29

## Context
v1 ships one connector, Notion (brief §12). The brief preferred Notion's hosted MCP server with
OAuth, with a local stdio server and an integration token as the fallback, and described
per-agent *Read-only* / *Read-write* presets expanding to tool allowlists.

Checked 2026-09-29:
- **Hosted** (`https://mcp.notion.com/mcp`): Streamable HTTP; OAuth only, with dynamic client
  registration, PKCE (S256), and refresh tokens. It acts as the connecting user and can reach
  everything that user can; there is no per-page scoping. Notion's FAQ says it cannot yet be used
  without an interactive authorization.
- **Local** (`@notionhq/notion-mcp-server` 2.5.2): stdio with an internal integration token,
  scoped by Notion to the pages shared with the integration. Notion marks it "no longer actively
  maintained". Its tool annotations are derived from HTTP verbs, so search is marked destructive.

The owner decided on 2026-09-29 that the connector does not need page scoping: an agent is
either granted Notion or not.

## Decision
- **Hosted Notion MCP over Streamable HTTP with OAuth**, installed once station-wide. The daemon
  runs the OAuth flow with a loopback callback; the registered client and tokens live in the OS
  keychain; a 401 triggers a refresh, then a reconnect prompt on the Connectors screen.
- **Per-agent access is binary.** `agent.json` `connectorGrants: ["notion"]` grants every tool the
  connector exposes; without it, none are sent to the model or executable.
- **Read/write classification stays, for consent.** Our explicit map of Notion tool names is
  authoritative; MCP annotations only seed a default for a tool the map does not know, and an
  unknown tool is `write`. Under *Ask first*, `write` calls pause for consent; `read` calls
  (search, fetch, get comments, users, teams) run.
- The brief is amended to match (§3 goal 5, §6, §12, §16.2, §17).

## Alternatives considered
- **Local stdio server with an integration token.** Rejected: its only advantage was page
  scoping, which is not required, and it is unmaintained.
- **Calling Notion's REST API directly.** Rejected: the runtime is an MCP client so later
  connectors reuse one path.
- **Read-only / read-write presets and custom allowlists.** Dropped by the owner's decision; one
  toggle is simpler to explain and to enforce. Can return later as an additive `agent.json` field.

## Consequences
- Every granted agent acts as the owner's Notion identity on everything that identity can reach.
  `docs/connectors/notion.md` says so plainly and suggests connecting a dedicated Notion account
  if the owner wants a smaller blast radius.
- Consent under *Ask first* is the only runtime brake on Notion writes; *Full power* agents with
  the grant can write without asking.
- The OAuth flow needs a browser; there is no headless setup. Tokens are refreshed automatically;
  an expired refresh token surfaces as a `connector.*` status event, never a silent failure.
- Tests use a fake MCP server over `InMemoryTransport`; one env-gated smoke test runs against the
  real server manually.
