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
| `OUTERWORLD_MODEL` | `live` | `live` calls real models with your keys: Claude straight to Anthropic when an Anthropic key is set, everything else through OpenRouter (keychain, or `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` as dev fallbacks; ADR-0015). `openrouter` is an older name for `live`. `fake` streams a scripted reply with no key and no network. `pnpm dev` on the fixture copy and `browser:verify` use `fake`. |
| `OUTERWORLD_SECRETS` | `keychain` | `memory` keeps secrets in memory only and never reads or writes the OS keychain: for throwaway stations (`browser:verify` uses it). |
| `OUTERWORLD_DEV_ORIGIN` | unset | Development only: the Vite dev server's loopback origin, allowed through its proxy. When set, the daemon does not serve the built SPA. |

## HTTP surface

Every request must carry an allowed `Host` (no DNS rebinding) and, when a browser sends them, an
allowed `Origin` and a `Sec-Fetch-Site` other than `cross-site`. Every `/api/*` request also needs
`Authorization: Bearer <token>`, the per-install token in `$OUTERWORLD_HOME/daemon.token` (0600).

| Route | Description |
|-------|-------------|
| `GET /api/health` | `{ ok, version, latestSeq, startedAt }`; `startedAt` is when this daemon started (the dashboard's uptime). |
| `GET /api/events` | SSE: every runtime event as `id: <seq>` + `data: <event JSON>`, replaying after `Last-Event-ID`, then live; a `: ping` comment every 15 s while idle. |
| `GET /api/station` | `StationView`: station config, crew (`{ id, config }`), every load issue, and `stationFile` (`present`, `missing`, or `unknown` when it could not be checked). Setup is offered only for `missing`; no `station` otherwise means station.json is there (or may be) but does not load, and the SPA shows the issues instead. |
| `GET /api/models` | The supported model list from core. |
| `GET /api/agents/:id` | `AgentView`: config, the four documents, the effective tools (core `resolveGrants`, plus `skill_view` when a skill is offered), and its skills (`{ offered, unavailable }`, ADR-0023). |
| `POST /api/agents` | `CreateAgentInput` → 201 `AgentView`; the id comes from the name. |
| `PATCH /api/agents/:id` | `UpdateAgentInput` (strict) → `AgentView`. `skills` sets the crew member's own skills. |
| `GET /api/skills` | `SkillListItem[]`: the bundled library by category, each with its default, the Commander's override, whether it is on for all crew, who added it, who it is offered to, and what no one has (`missing`). Never the bodies. |
| `PUT /api/skills/:id` | `{ enabled: boolean \| null }`: on or off for all crew in `station.json`, or `null` for the skill's default → the updated `SkillListItem`. 404 for a skill not in the library. Emits `station.updated`. |
| `PUT /api/agents/:id/documents/:name` | `{ text }` for `identity`, `purpose`, `standing-orders`, or `context` → 204. |
| `DELETE /api/agents/:id` | 204; the agent's workspace files stay. |
| `POST /api/rooms`, `PATCH /api/rooms/:id`, `DELETE /api/rooms/:id` | Rooms and their props; deleting a room with crew or hallways is 409. |
| `POST /api/lanes {from, to, note?}`, `DELETE /api/lanes/:id` | Open and close a hallway (ADR-0013). Hallways are directed and enforced: a crew member reaches rooms a hallway leads to from its own (ADR-0025). The reverse of a hallway is a hallway of its own, so two-way reach takes two. A loop, or a second hallway the same way, is 409. |

| `GET /api/sessions` | Every crew member's sessions, the same shape as below plus `origin` (`dispatch` for a session the Overseer opened to hand work to crew, else `commander`); `?archived=1` includes archived ones. |
| `GET /api/agents/:id/sessions` | The agent's sessions, most recently active first, each with `messageCount`, `lastMessageAt?`, `lastMessage? {role, text}` (clipped), and `active`; `?archived=1` includes archived ones. |
| `POST /api/agents/:id/sessions` | `{ title? }` → 201 session. Without a title, the first message names it (one short model call, ADR-0014). |
| `GET /api/sessions/:id` | `{ session, messages, runs }`: messages oldest first, runs newest first. |
| `PATCH /api/sessions/:id` | `{ title?, archived?: true, modelSettings?, agentId? }`; `agentId` hands the conversation to another crew member, whose next run it is (404 unknown agent, 409 while a run is going or for a dispatched session, ADR-0018); `modelSettings` is `{ model?, provider?, reasoning? }` for this conversation, `null` to go back to the crew member's (ADR-0016). |
| `POST /api/sessions/:id/messages` | `{ text }` → 202 `{ runId }`; the reply streams as events (deltas are ephemeral, D18). 409 while a run is active, the session is archived, or it is a worker's session whose dispatch has not reported yet (steer its run instead, ADR-0025). |
| `POST /api/runs/:id/cancel` | 202; a queued or running run becomes cancelled. |
| `POST /api/runs/:id/steer` | `{ text }` → 202: a direction for a running run, added before its next model call. 409 if the run is not running. |
| `GET /api/activity` | `{ runs, dispatches, crew }`: every run in flight, every dispatch still running, and what each crew member is doing now (`crew`, folded from the event log: `running`, `awaiting_consent`, `done`, `failed`, `blocked`; absent means idle). The station map renders it. Session detail also carries `dispatches` made from that session. |
| `GET /api/consents` | Pending consent requests (write-class calls under *Ask first*), each with `chain`: who asked whom for its run, root first, read from the event log (ADR-0025). |
| `POST /api/consents/:id` | `{ decision: "approved" \| "denied" }`; the paused run continues. 409 if already decided or expired. |
| `GET /api/kill-switch`, `PUT /api/kill-switch` | `{ engaged }`. Engaging is persisted first, then cancels every queued, running, or waiting run; sends are 409 until cleared. |
| `GET /api/spend?day=YYYY-MM-DD` | USD spent that UTC day (default today), station-wide and per agent, and `tokens` (input plus output) for the day. Session detail carries `spend` and `runSpend`. |
| `GET /api/runs?limit=1..200` | The station's latest runs (default 40), newest first, each with a `title`: the task for a dispatch, else the session title, and for a dispatched run `askedBy` (the agents above it, root first, ADR-0025). The dashboard's missions. |
| `GET /api/connectors` | Each connector: status (`disconnected`, `needs_auth`, `connected`, `error`), its classified tools, `grantedTo`, and `url` for a server or `service` for the station's own (`gmail`, ADR-0022). |
| `POST /api/connectors` | `{ preset: "notion" \| "github" \| "gmail" }` installs that preset: Notion's or GitHub's hosted MCP server (ADR-0012, ADR-0019), or the Gmail API service the daemon calls itself (`transport: { type: "builtin", service: "gmail" }`, ADR-0022). `gmail-mcp` is listed in the catalog but not available yet: 400. |
| `PUT /api/connectors/:id/client` | `{ clientId, clientSecret? }`: your own OAuth app, for a server with no dynamic registration (GitHub, Gmail). Kept in the keychain, never returned; the list shows `ownClient: { set, redirectUrl }`. 409 for a server that registers its own. |
| `PATCH /api/connectors/:id` | `{ url?, name? }` (a `url` for the Gmail service is 409: it has none); `DELETE` removes it (409 while any crew member is granted it). |
| `POST /api/connectors/:id/connect` | `{ status, authorizationUrl? }`: when the server needs sign-in, open `authorizationUrl`; Notion returns to the callback below. |
| `POST /api/connectors/:id/disconnect` | `{ forget? }`: `forget: true` also removes the stored sign-in from the keychain. |
| `GET /api/agents/:id/schedules` | Each schedule: cron, the zone it runs in (`timezoneSet: false` means the machine's), prompt, `enabled`, `catchUp`, `nextRunAt`, its session, a cron `error`, and the last 10 fires (`fired` with the run's state, or `missed` with `down`, `busy`, `stopped`, `error`). |
| `POST /api/agents/:id/schedules` | `{ cron, prompt, timezone?, catchUp?, enabled? }` → 201; the id comes from the prompt. A cron croner refuses is 409 with the reason. |
| `PATCH /api/agents/:id/schedules/:scheduleId` | Any of those fields; `timezone: null` goes back to the machine's zone. `DELETE` removes it (204). The scheduler re-arms from the `agent.updated` that follows. |
| `POST /api/agents/:id/schedules/:scheduleId/run` | Run now → 202 with the fire (`sessionId`, `runId`); 409 when the kill switch is on or the session is busy. |
| `GET /api/agents/:id/memories` | `{ proposals, beliefs }`: `remember` proposals awaiting the Commander, and approved beliefs (own and station-wide, newest decided first) that go into every prompt. |
| `POST /api/memories/:id/approve` | Optional `{ text }` to approve an edited version; `POST /api/memories/:id/reject` rejects. 409 once decided. |
| `PATCH /api/memories/:id` | `{ text }` edits a stored belief; `DELETE` forgets it (204). |
| `GET /oauth/callback/:id` | Where sign-in returns (no API token: the browser comes from Notion). Accepts only the one-time `state` of a sign-in in progress; shows a small page saying whether it worked. The only cross-site navigation allowed. |
| `GET /api/notifications?before=&limit=` | A page of the Notifications feed, newest first: `{ items, unread, readSeq, nextBefore? }` (core's `notificationFor` over the event log; limit 50, at most 200). |
| `POST /api/notifications/read` | `{ seq }` marks everything up to it read (the marker never moves back) → `{ readSeq, unread }`. |
| `POST /api/onboarding` | `{ overseerName, tone: "calm" \| "warm" \| "brisk", stationName? }` → 201 `AgentView` of the new Overseer, on a station with no `station.json` file only: 409 once one exists, including one that does not load, so setup never replaces a Commander's file. Writes the Command room and the default budgets (D22). |
| `POST /api/templates/project-manager` | Optional `{ name }` → 201 `AgentView`: the Project Manager (brief §17), adding the Operations room, a hallway to Command, and the Notion connector when missing. Unknown template: 404. |
| `PUT /api/budgets` | `{ perRunUsd?, perAgentDailyUsd?, stationDailyUsd?, perTreeUsd? }`: USD caps in `station.json`; `null` removes one (kept as an explicit `null` for `perTreeUsd`, whose missing value means the default), a missing field keeps it. Current caps are in `GET /api/station`. |
| `PUT /api/dispatch` | `{ maxDepth?: 0–3, maxRunsPerTree?: 1–50, autoReview? }`: the station's dispatch policy (ADR-0025); a missing field keeps it. `PATCH /api/agents/:id` takes `canDispatch`. |
| `GET /api/settings` | `{ modelMode, timezone, openrouter: { configured, source }, anthropic: { configured, source } }` (`timezone`: the machine's zone, used by schedules without one), never a key. |
| `PUT /api/settings/openrouter` | `{ key }`: checked with OpenRouter's key endpoint (no model call), stored in the OS keychain → 204; a rejected key is 400. |
| `PUT /api/settings/anthropic` | `{ key }`: checked with Anthropic's model list (no tokens spent), stored in the OS keychain → 204; a rejected key is 400 (ADR-0015). |
| `DELETE /api/settings/openrouter`, `DELETE /api/settings/anthropic` | Removes that stored key → 204. |

On startup the daemon marks every run the last process left unfinished as `interrupted`
(brief §8) before it serves anything, then starts the scheduler (which catches up or records an
occurrence missed while it was down, D21). Every event payload is redacted: known key values and
anything shaped like an OpenRouter or Anthropic key never reach the log or the SPA.

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
