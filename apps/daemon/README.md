# daemon

The Outerworld AI daemon (ADR-0010): one Node process per station. Thin by design: it resolves
config, prepares the station directory, and wires `@darthsaul/outerworld-ai-runtime` to HTTP.
All runtime logic lives in the runtime package.

## Run

```
pnpm --filter daemon build
OUTERWORLD_HOME=~/.outerworld node apps/daemon/dist/main.js
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `OUTERWORLD_HOME` | `~/.outerworld` | Station data directory (brief §9); relative paths resolve against the working directory. Created with mode 0700. |
| `OUTERWORLD_PORT` | `4317` | Port on `127.0.0.1` (never another interface). `0` picks a free port. |
| `OUTERWORLD_MODEL` | `openrouter` | `openrouter` uses your key (keychain, or `OPENROUTER_API_KEY` as a dev fallback); `fake` streams a scripted reply with no key and no network. `pnpm dev` on the fixture copy and `browser:verify` use `fake`. |
| `OUTERWORLD_DEV_ORIGIN` | unset | Development only: the Vite dev server's loopback origin, allowed through its proxy. When set, the daemon does not serve the built SPA. |

## HTTP surface

Every request must carry an allowed `Host` (no DNS rebinding) and, when a browser sends them, an
allowed `Origin` and a `Sec-Fetch-Site` other than `cross-site`. Every `/api/*` request also needs
`Authorization: Bearer <token>`, the per-install token in `$OUTERWORLD_HOME/daemon.token` (0600).

| Route | Description |
|-------|-------------|
| `GET /api/health` | `{ ok, version, latestSeq }`. |
| `GET /api/events` | SSE: every runtime event as `id: <seq>` + `data: <event JSON>`, replaying after `Last-Event-ID`, then live; a `: ping` comment every 15 s while idle. |
| `GET /api/station` | `StationView`: station config, crew (`{ id, config }`), and every load issue. |
| `GET /api/models` | The supported model list from core. |
| `GET /api/agents/:id` | `AgentView`: config, the four documents, and the effective tools (core `resolveGrants`). |
| `POST /api/agents` | `CreateAgentInput` → 201 `AgentView`; the id comes from the name. |
| `PATCH /api/agents/:id` | `UpdateAgentInput` (strict) → `AgentView`. |
| `PUT /api/agents/:id/documents/:name` | `{ text }` for `identity`, `purpose`, `standing-orders`, or `context` → 204. |
| `DELETE /api/agents/:id` | 204; the agent's workspace files stay. |
| `POST /api/rooms`, `PATCH /api/rooms/:id`, `DELETE /api/rooms/:id` | Rooms and their props; deleting a room with crew or hallways is 409. |

| `GET /api/agents/:id/sessions` | The agent's sessions, newest first; `?archived=1` includes archived ones. |
| `POST /api/agents/:id/sessions` | `{ title? }` → 201 session. |
| `GET /api/sessions/:id` | `{ session, messages, runs }`: messages oldest first, runs newest first. |
| `PATCH /api/sessions/:id` | `{ title? , archived?: true }`. |
| `POST /api/sessions/:id/messages` | `{ text }` → 202 `{ runId }`; the reply streams as events (deltas are ephemeral, D18). 409 while a run is active or the session is archived. |
| `POST /api/runs/:id/cancel` | 202; a queued or running run becomes cancelled. |
| `POST /api/runs/:id/steer` | `{ text }` → 202: a direction for a running run, added before its next model call. 409 if the run is not running. |
| `GET /api/activity` | `{ runs, dispatches }`: every run in flight and every dispatch still running. Session detail also carries `dispatches` made from that session. |
| `GET /api/consents` | Pending consent requests (write-class calls under *Ask first*). |
| `POST /api/consents/:id` | `{ decision: "approved" \| "denied" }`; the paused run continues. 409 if already decided or expired. |
| `GET /api/kill-switch`, `PUT /api/kill-switch` | `{ engaged }`. Engaging is persisted first, then cancels every queued, running, or waiting run; sends are 409 until cleared. |
| `GET /api/spend?day=YYYY-MM-DD` | USD spent that UTC day (default today), station-wide and per agent. Session detail carries `spend` and `runSpend`. |
| `GET /api/settings` | `{ modelMode, openrouter: { configured, source } }`, never the key. |
| `PUT /api/settings/openrouter` | `{ key }`: checked with OpenRouter's key endpoint (no model call), stored in the OS keychain → 204; a rejected key is 400. |
| `DELETE /api/settings/openrouter` | Removes the stored key → 204. |

On startup the daemon marks every run the last process left unfinished as `interrupted`
(brief §8) before it serves anything. Every event payload is redacted: known key values and
anything shaped like an OpenRouter key never reach the log or the SPA.

Bodies with content must be `application/json` (else 415) and at most 1 MiB (else 413). Invalid input is 400
with `issues`; an unknown id is 404; a change that would break the station is 409 with `issues`.
Every change is logged as `agent.updated` or `station.updated`.

| `GET /*` (built SPA only) | Static assets from `apps/station/dist`; any path without an extension gets `index.html` with the token injected as `<meta name="outerworld-token">`, `Cache-Control: no-store`. |

Known limit: any process of any local user that can reach `127.0.0.1` can fetch `index.html` and
so the token. The daemon assumes a single-user machine (docs/PRIVACY.md).

## Public API (for tests and a future desktop shell)

| Export | Description |
|--------|-------------|
| `resolveConfig(env, { homedir, defaultSpaDir?, cwd? })` | Validated `DaemonConfig`. |
| `startDaemon(config, { quiet?, warn? })` | Starts the daemon; returns `{ url, app, close(reason) }`. Logs `station.started` / `station.stopped`. |
| `createApp(options)` | The Hono app alone, for `app.request()` tests. |
| `ensureToken(path)`, `tokensMatch(a, b)` | Token file handling and constant-time comparison. |
