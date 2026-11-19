# Privacy: the data map

What lives where, and what leaves your machine. Keep this current whenever a data flow changes;
a change that adds a network destination updates this file in the same commit.

Outerworld AI v1 is a local daemon plus a browser SPA (ADR-0010). There is no Outerworld server,
no telemetry, no analytics, and no error reporting.

## Where data lives

| Data | Lives in | Committed to this repo? | Notes |
|------|----------|-------------------------|-------|
| Station config: name, rooms, hallways, props, connector metadata, budgets | `$OUTERWORLD_HOME/station.json` (default `~/.outerworld/`) | Never | Human-editable. Connector entries hold names and URLs only, no tokens. |
| Crew documents and config: `identity.md`, `purpose.md`, `standing-orders.md`, `context.md`, `agent.json` | `$OUTERWORLD_HOME/agents/<id>/` | Never | Edited in the SPA or by hand. |
| Sessions, messages, runs, tool calls and results, dispatches, memory, schedule history, spend, events | `$OUTERWORLD_HOME/station.db` (SQLite) | Never | Tool results include web pages and Notion, GitHub, or Gmail content your agents fetched. |
| Files your agents write | `$OUTERWORLD_HOME/workspaces/<agent-id>/` | Never | The only place Files-prop tools can read or write. |
| Daemon logs | `$OUTERWORLD_HOME/logs/` | Never | Secrets are redacted before anything is written. |
| Daemon access token | `$OUTERWORLD_HOME/daemon.token`, file mode 0600 | Never | Generated on first start; lets the SPA talk to the daemon. Given to the page the daemon (or the dev server) serves. |
| OpenRouter API key | OS keychain (account `openrouter-api-key`) | Never | Sent only to OpenRouter. `OPENROUTER_API_KEY` in the environment is a development fallback. Never written to the station directory. |
| Anthropic API key | OS keychain (account `anthropic-api-key`) | Never | Sent only to Anthropic. `ANTHROPIC_API_KEY` in the environment is a development fallback. Never written to the station directory (ADR-0015). |
| Connector OAuth client you registered yourself (GitHub, Gmail; ADR-0019) | OS keychain (account `mcp.<id>.<server hash>.own`) | Never | The client id and optional secret you pasted. Sent only to that server's authorization server during sign-in. The API never returns them, only whether one is saved. Removing the connector deletes them; "Disconnect and forget sign-in" keeps them. |
| Connector OAuth tokens and client registration (Notion, GitHub, Gmail) | OS keychain (service `outerworld-ai`, accounts `mcp.<id>.<server hash>.tokens` / `.client`, the hash being the first 16 hex characters of SHA-256 of the server URL, or of the transport JSON for the Gmail API service, ADR-0022) | Never | Sent only to the server they were issued by. Refreshed by the daemon; "Disconnect and forget sign-in" deletes them (and any older `mcp.<id>.tokens` / `mcp.<id>.client` entry). The PKCE verifier and sign-in `state` exist only in memory. Keychain entries belong to your OS user, not to one station directory: stations whose connector has the same id **and the same server URL** share a sign-in; a connector pointing at any other URL never sees it, and no connection is attempted at startup without a sign-in for its own server. `OUTERWORLD_SECRETS=memory` keeps a daemon off the keychain entirely (`browser:verify` uses it). |
| The demo station | `fixtures/demo-station/` | Yes | A fictional station. Every test, screenshot, and example uses it. |
| The skills library | `packages/runtime/skills/library/` | Yes | Recipes shipped with the runtime, read-only (ADR-0023); no station data. Which skills are on lives in `station.json` (`skills`) and each `agent.json` (`skills`). A fictional test library is in `fixtures/skills/`. |
| Local scratch (`.outerworld/` in this checkout) | Your machine | Never (gitignored) | `pnpm dev`'s working copy of the fixture, `pnpm dev:fresh`'s empty station, and `browser:verify`'s seeded copy and screenshots (of the fixture, with history the fake model made), which CI uploads as a build artifact. |
| Display preferences, and the open Overseer order | Your browser's `localStorage` (`outerworld.*` keys) | n/a | Per-viewer conveniences: display size, map style, CRT overlay, map/comms split, scanner folded or not, and the session id of the Overseer order open on the Station. No message text; the SPA stores nothing else in the browser. |

The daemon assumes a single-user machine: any local process that can reach `127.0.0.1` can load
the SPA page and so obtain the daemon token. Other websites cannot (Host, Origin, and
`Sec-Fetch-Site` checks).

**Secrets never** enter the station directory (other than the 0600 daemon token), the SQLite
database, logs, events, or anything sent to the SPA. The Settings screen only learns *whether* a
key is configured and where it came from (keychain or environment).

## What leaves the machine

Exactly these kinds of request, all made by the daemon, all caused by your configuration or by an
agent you created:

1. **Model calls to Anthropic** (`api.anthropic.com`) **or OpenRouter** (`openrouter.ai`): the
   assembled prompt (the agent's documents, its role briefing, the index of its installed skills,
   approved memories, recent session history, and the new input), tool definitions, and tool
   results, including any skill recipe the agent reads with `skill_view` (ADR-0023). With an Anthropic key, Claude
   models go straight to Anthropic; every other model, and Claude when there is only an OpenRouter
   key, goes to OpenRouter, which forwards to the model provider you picked (ADR-0015). One extra
   call checks a key when you save it (OpenRouter's key endpoint; Anthropic's model list, which
   spends no tokens). A new session's first message (up to 2,000
   characters) is also sent once, to the same crew member's model, to name the session
   (ADR-0014).
2. **Connector calls to Notion** (`mcp.notion.com`) for agents granted Notion: searches, fetches,
   and page changes the agent requests, plus the OAuth flow when you connect (discovery, client
   registration, token exchange and refresh). Notion's sign-in page opens in your browser and
   returns to the daemon's loopback callback. Every granted agent acts as the Notion account you
   signed in with.
3. **Connector calls to GitHub** (`api.githubcopilot.com`) for agents granted GitHub, if you added
   it: the repository, issue, pull request, and code reads and changes the agent requests, so
   requests and results can carry your repository data. The OAuth flow goes to GitHub
   (`github.com`) with the OAuth app you registered (ADR-0019): discovery, token exchange and
   refresh. Every granted agent acts as the GitHub account you signed in with.
4. **Gmail API calls** (`gmail.googleapis.com`) for agents granted Gmail, if you added it
   (ADR-0022). The daemon calls Google's REST API itself through an in-memory adapter; no MCP
   server is involved. The calls are the mail searches, thread reads, label listings, drafts,
   label changes, and moves to trash the agent requests, so requests and results carry your email.
   Nothing is ever sent: drafts wait in Gmail for you.
   - The OAuth flow goes to Google (`accounts.google.com`, `oauth2.googleapis.com`) with the OAuth
     client you registered.
   - It asks only for `gmail.modify` (read, draft, label, trash; no permanent delete) and for
     offline access, so a refresh token is kept in the keychain.
   - A sign-in Google refuses to renew is deleted at once, and you are asked to sign in again.
   - Every granted agent acts as the Google account you signed in with.
   - **Gmail MCP** (`gmailmcp.googleapis.com`, ADR-0019) is listed in the catalog, but the daemon
     refuses to install it through the preset endpoint until Google's preview access. That is the
     only thing that stops it: a `station.json` you edit by hand can still define an HTTP connector
     at that URL (under any id but `gmail`), and the daemon then contacts that server like any
     other MCP connector, with the sign-in described in ADR-0019.
   - A station that had Gmail MCP under the `gmail` id is moved to the Gmail API on daemon start:
     the OAuth app you saved carries over, and the MCP server's tokens are deleted.
5. **`web_fetch` requests** to public http(s) URLs an agent with the Web prop chooses. Loopback,
   private-network, and link-local addresses are refused. Only text comes back: pages, plain
   text, JSON, and XML, including Atom and RSS feeds; images, PDFs, and other binaries are refused.

Nothing else: no connector you have not added is ever contacted. The SPA talks only to the daemon on `127.0.0.1`. Fonts are self-hosted. Tests and CI
make no network calls: they use a scripted fake model and a fake MCP server; a real-network smoke
test runs only when you set its environment variable by hand.

## Rules

- Never commit a real station, real agent documents, real session data, real usernames, real
  Notion IDs, API keys, or tokens to this repo. Extend the fixture instead.
- Never add a gitleaks allowlist entry to get CI green.
- Never add a network destination to the daemon or the SPA without updating this file and asking
  first.
- Never log, persist, emit in an event, or send to the SPA any secret.
