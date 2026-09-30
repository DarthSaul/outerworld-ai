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
| Sessions, messages, runs, tool calls and results, dispatches, memory, schedule history, spend, events | `$OUTERWORLD_HOME/station.db` (SQLite) | Never | Tool results include web pages and Notion content your agents fetched. |
| Files your agents write | `$OUTERWORLD_HOME/workspaces/<agent-id>/` | Never | The only place Files-prop tools can read or write. |
| Daemon logs | `$OUTERWORLD_HOME/logs/` | Never | Secrets are redacted before anything is written. |
| Daemon access token | `$OUTERWORLD_HOME/daemon.token`, file mode 0600 | Never | Generated on first start; lets the SPA talk to the daemon. Given to the page the daemon (or the dev server) serves. |
| OpenRouter API key | OS keychain | Never | `OPENROUTER_API_KEY` in the environment is a development fallback. Never written to the station directory. |
| Connector OAuth tokens and client registration (Notion) | OS keychain | Never | Refreshed by the daemon. |
| The demo station | `fixtures/demo-station/` | Yes | A fictional station. Every test, screenshot, and example uses it. |
| Local scratch (`.outerworld/` in this checkout) | Your machine | Never (gitignored) | `pnpm dev`'s working copy of the fixture and `browser:verify` screenshots (of the fixture), which CI uploads as a build artifact. |
| Theme preference | Your browser's `localStorage` | n/a | A per-viewer convenience; the SPA stores nothing else in the browser. |

The daemon assumes a single-user machine: any local process that can reach `127.0.0.1` can load
the SPA page and so obtain the daemon token. Other websites cannot (Host, Origin, and
`Sec-Fetch-Site` checks).

**Secrets never** enter the station directory (other than the 0600 daemon token), the SQLite
database, logs, events, or anything sent to the SPA. The Settings screen only learns *whether* a
key is configured and where it came from (keychain or environment).

## What leaves the machine

Exactly three kinds of request, all made by the daemon, all caused by your configuration or by an
agent you created:

1. **Model calls to OpenRouter** (`openrouter.ai`): the assembled prompt (the agent's documents,
   its role briefing, approved memories, recent session history, and the new input), tool
   definitions, and tool results. OpenRouter forwards them to the model provider you picked. One
   extra call checks your key when you save it.
2. **Connector calls to Notion** (`mcp.notion.com`) for agents granted Notion: searches, fetches,
   and page changes the agent requests, plus the OAuth flow when you connect.
3. **`web_fetch` requests** to public http(s) URLs an agent with the Web prop chooses. Loopback,
   private-network, and link-local addresses are refused.

Nothing else. The SPA talks only to the daemon on `127.0.0.1`. Fonts are self-hosted. Tests and CI
make no network calls: they use a scripted fake model and a fake MCP server; a real-network smoke
test runs only when you set its environment variable by hand.

## Rules

- Never commit a real station, real agent documents, real session data, real usernames, real
  Notion IDs, API keys, or tokens to this repo. Extend the fixture instead.
- Never add a gitleaks allowlist entry to get CI green.
- Never add a network destination to the daemon or the SPA without updating this file and asking
  first.
- Never log, persist, emit in an event, or send to the SPA any secret.
