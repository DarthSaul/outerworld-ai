# Schema and contracts (v1)

The data a station is made of, and the contracts between the daemon and the SPA. The zod schemas
in `packages/core` are the source of truth, and this page summarizes them. JSON Schema exports of
the config and event schemas are committed in `packages/core/schema/`; regenerate them with
`node scripts/write-schemas.mjs` in `packages/core`, and a test fails when they drift.

**Versioning (ADR-0009):**
- Every document carries `schemaVersion` (v1 is `1`). A newer version loads with a warning, never
  a crash.
- Objects keep unknown fields, so a hand-added note or a newer daemon's field survives a round
  trip.
- API *update* inputs are strict, so a typo is refused rather than silently ignored.
- Every id is lowercase letters, digits and hyphens (`^[a-z0-9][a-z0-9-]*$`), and never a
  JavaScript object property name.

## The station directory (`$OUTERWORLD_HOME`, default `~/.outerworld`)

```
station.json              rooms, hallways, connectors, budgets, dispatch policy
agents/<id>/agent.json    a crew member's config
agents/<id>/identity.md   who they are                  ┐
agents/<id>/purpose.md    what they are for             │ the four documents: markdown,
agents/<id>/standing-orders.md   rules they always follow │ up to 256 KiB each, in every prompt
agents/<id>/context.md    background they should know   ┘
workspaces/<id>/          the only place their files tools can read and write
station.db                SQLite: sessions, runs, events, memory, spend, … (below)
daemon.token              the per-install API token (0600)
logs/
```

The files are human-editable and written atomically. The daemon reads them on every request and
run, so a change takes effect on the next run. Secrets are never here (see below).

### `station.json` (`StationConfig`)

| Field | Shape | Notes |
|---|---|---|
| `schemaVersion` | `1` | |
| `name` | string | |
| `rooms` | `Room[]`, at least 1 | `{ id, name, description?, props: [{ kind: "web" \| "files" \| "memory" }] }`. Props grant the room's crew built-in tools. |
| `lanes` | `Lane[]` | Hallways: `{ id, from, to, note? }` between room ids. Drawn on the map; enforced in v2. |
| `connectors` | `Connector[]` | `{ id, name, transport }`, where `transport` is `{ type: "http", url }` (http or https) or `{ type: "stdio", command, args }`. There is no field for headers or environment values, so secrets cannot be put here. v1 connects HTTP connectors only and ships the Notion preset (ADR-0012). |
| `budgets` | `{ perRunUsd?, perAgentDailyUsd?, stationDailyUsd? }` | Positive USD. A missing cap means no cap. Onboarding writes `DEFAULT_BUDGETS` (5 / 25 / 50, D22). |
| `dispatch` | `{ maxDepth: 0 \| 1, autoReview }` | Defaults `{ maxDepth: 1, autoReview: true }`. `0` turns delegation off. |

Cross-file rules (`stationCrewIssues`): agent ids are unique, every room and connector an agent
names exists, and there is at most one Overseer.

### `agents/<id>/agent.json` (`AgentConfig`)

| Field | Shape | Notes |
|---|---|---|
| `schemaVersion` | `1` | |
| `name` | string | Display name; the id is the directory name. |
| `roomId` | room id | Exactly one room. |
| `role` | `"overseer"` \| `"crew"` | The Overseer gets `dispatch` and `read_session`. |
| `model` | string | An OpenRouter model id. One outside `SUPPORTED_MODELS` is a warning. |
| `approvalMode` | `"ask"` \| `"full"` | *Ask first* (default) pauses `write`-class calls for consent. |
| `connectorGrants` | connector ids | Granting a connector grants all of its tools (ADR-0012). |
| `schedules` | `Schedule[]` | `{ id, cron (5 or 6 fields, checked by croner), timezone? (IANA; absent = the machine's), prompt, sessionId?, catchUp (false), enabled (true) }` (D21). |
| `look` | integer 0–23? | The pixel character this agent appears as: an index into core's `CHARACTERS`, set on Crew Select. Absent means a stable pick from the agent id (`lookFor`). ADR-0013. |
| `rig` | `{ tintHue, trimHue, head, trace }`? | Superseded by `look` (ADR-0013); still accepted until the rig is removed. The `crest` head and `frame` trace are reserved for the Overseer. |

**Effective tools** (`resolveGrants`) are the role tools, plus the room's prop tools, plus every
tool of each granted, connected connector. Each tool is `read` or `write` by our classification
(D16, `KNOWN_TOOL_CLASSES`); unknown tools are `write`.

## Events (`RuntimeEvent`, brief §10)

The envelope is `{ seq, type, at, agentId?, sessionId?, runId?, payload, ephemeral? }`. `seq`
increases monotonically, and `ephemeral` marks streamed deltas that are sent live and never stored
(D18). Payloads never carry a secret: they are redacted before storage.

| Family | Types |
|---|---|
| station | `station.started`, `station.stopped {reason}`, `station.updated`, `station.kill_switch {engaged}` |
| agent | `agent.updated {change: created \| updated \| deleted}` |
| session | `session.created {title}`, `session.renamed`, `session.archived` |
| run | `run.queued {trigger}`, `run.started {model}`, `run.delta {text}` (ephemeral), `run.tool_call {toolCallId, tool, input, class, rejected?}`, `run.tool_result {ok, summary?}`, `run.awaiting_consent {consentId}`, `run.retrying`, `run.steered`, `run.completed {reason?, trigger?}`, `run.failed {error, trigger?}`, `run.cancelled {by: user \| kill_switch \| budget}`, `run.interrupted` |
| dispatch | `dispatch.started {to, task}`, `dispatch.completed {summary}`, `dispatch.failed {error}`, `dispatch.cancelled` |
| consent | `consent.requested {tool, input}`, `consent.resolved {decision}` |
| memory | `memory.proposed {text, scope}`, `memory.approved`, `memory.rejected`, `memory.updated {change: edited \| deleted}` |
| schedule | `schedule.fired {scheduleId, scheduledFor, manual?}`, `schedule.missed {reason?: down \| busy \| stopped \| error, detail?}` |
| connector | `connector.status {connectorId, status: connected \| disconnected \| needs_auth \| error, detail?}` |
| budget | `budget.warning`, `budget.blocked {scope: run \| agent \| station, spentUsd, limitUsd}` (`budget.blocked` ends its run as `blocked_budget`) |

The run states and their allowed transitions are in core's `run/run-state.ts`
([ARCHITECTURE.md](ARCHITECTURE.md#the-agent-loop-runservice-adr-0011)). The projections over this
log are:
- `notificationFor`: Notifications;
- `foldCrewActivity` / `activityOf`: what each crew member is doing now;
- `mapModelFor`: the station map from config plus activity (D24).

## SQLite (`station.db`)

The database runs in WAL mode with foreign keys on. Numbered migrations are applied once each and
recorded in `schema_migrations`.

| Table | Holds |
|---|---|
| `events` | The append-only log. Triggers refuse update and delete. |
| `sessions` | `id, agent_id, title, created_at, archived_at?` |
| `runs` | `id, session_id, agent_id, state, trigger, model, created_at, started_at?, ended_at?, error?, steps, depth, dispatch_id?` |
| `messages` | Each session's messages in order (`position`): the Commander, assistant text with tool calls, tool results, and dispatch reports (`ChatMessage`). |
| `memories` | `id, agent_id, scope (agent \| station), text, status (proposed \| approved \| rejected), source_run_id?, created_at, decided_at?` |
| `consents` | One row per consent request: `tool, input, status (pending \| approved \| denied \| expired)`. |
| `spend` | One row per model call: tokens, `cost_usd` (OpenRouter's, or null), and the UTC day. |
| `dispatches` | Lead and worker agent, session and run; `task, inputs?, status, summary?` |
| `schedule_state` | Per schedule: the config it was armed with (`signature`), the last occurrence accounted for, and its session. |
| `schedule_fires` | Per schedule: history (`fired` with its run, or `missed` with a reason). |
| `station_state` | Keyed values: the kill switch, the Notifications read marker. |

## Secrets

These live in the OS keychain (service `outerworld-ai`): the OpenRouter key, and each
connector's OAuth tokens and client registration (`mcp.<id>.tokens` / `mcp.<id>.client`). The
entries are per OS user and shared by every station directory, by the owner's decision.
`OUTERWORLD_SECRETS=memory` keeps a daemon off the keychain. No secret is ever written to the
station directory or SQLite, put in an event or log, or sent to the SPA. The API reports only
whether a key is configured. See [PRIVACY.md](PRIVACY.md).

## HTTP API

All routes are under `/api`, with JSON bodies and the bearer token; commands are plain POST, PUT,
PATCH and DELETE, and live state comes over one SSE stream (`GET /api/events`). Each route,
including the status codes the SPA relies on, is listed in
[apps/daemon/README.md](../apps/daemon/README.md). Request bodies are validated with core's input
schemas (`packages/core/src/api/`).
