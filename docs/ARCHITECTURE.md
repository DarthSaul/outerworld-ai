# Architecture (v1)

Outerworld AI is a local-first agent runtime with a space-station interface. This page describes
what v1 is built from and how the parts talk. The direction is in
[specs/BRIEF-station-runtime.md](specs/BRIEF-station-runtime.md). Decisions are in
[decisions/](decisions/) (ADR-0010 runtime, ADR-0011 stack, ADR-0012 Notion) and in the
D-numbered list in `tasks/todo.md`. Data shapes are in [SCHEMA.md](SCHEMA.md), and what leaves
the machine is in [PRIVACY.md](PRIVACY.md).

```
 Browser (SPA, apps/station)                        Daemon (Node, apps/daemon) on 127.0.0.1
 ┌──────────────────────────────┐   GET /api/events  ┌────────────────────────────────────────┐
 │ screens ← TanStack Query     │◄──── SSE ──────────│ Hono: token + Origin/Host checks        │
 │ invalidateFor(event)         │                    │  ├─ routes → packages/runtime services  │
 │ map = core.mapModelFor(...)  │──── POST/PUT ─────►│  └─ SSE: EventStore subscribe + replay │
 └──────────────────────────────┘   /api/*           │ packages/runtime                        │
                                                     │  RunService (agent loop) ─► OpenRouter │
                                                     │  DispatchService · Scheduler · Memory   │
                                                     │  ConnectorManager (MCP) ─► Notion      │
                                                     │  storage: files · SQLite · keychain     │
                                                     └────────────────────────────────────────┘
```

## Packages and boundaries

| Package | Role | Knows |
|---|---|---|
| `packages/core` | Pure logic and contracts: zod schemas (`station.json`, `agent.json`, events, API inputs), glossary, grant resolution, dispatch reach and depth, budget math, prompt assembly, the run state machine, the Notifications projection, crew activity, and the map adapter. No IO, no React. | nothing else |
| `packages/runtime` | Everything that does something: the agent loop, dispatch, scheduler, tools, MCP client, memory, budgets, and storage (station directory, SQLite, keychain). | core |
| `packages/ui` | React components, tokens, the rigged character, the station map. Renders core types. | core |
| `apps/daemon` | Thin wiring: config, Hono routes over runtime services, SSE, auth, serving the built SPA. | core, runtime |
| `apps/station` | Thin SPA: routes, data fetching, the SSE client, screens. | core, ui (never runtime) |

Runtime logic stays out of `apps/*`, so it can move into a desktop shell later. Native modules
(`better-sqlite3`, `@napi-rs/keyring`) load only in runtime and the daemon.

## The daemon

- **Binding and auth:**
  - It binds `127.0.0.1` only (port 4317).
  - Every `/api/*` request needs the per-install bearer token (`$OUTERWORLD_HOME/daemon.token`,
    0600), an allowed `Host`, and, when present, an allowed `Origin` and a `Sec-Fetch-Site` that is
    not `cross-site`.
  - The daemon gives the token to the page it serves (D15: a single-user machine is assumed).
  - The OAuth callback `/oauth/callback/:id` is the one route without the token. It accepts only
    the one-time `state` of a sign-in the SPA started.
- **Events:**
  - `EventStore` is an append-only SQLite table: triggers refuse updates and deletes.
  - Every event is validated against core's `RuntimeEvent`, redacted, stored, and published to
    subscribers.
  - `/api/events` streams them as SSE, replaying after `Last-Event-ID`.
  - Token deltas are published without being stored (D18).
- **Startup:**
  - Read the station directory and log its issues.
  - Mark runs a crash left unfinished as `interrupted` and expire their consent requests.
  - Reconnect connectors that have a stored sign-in.
  - Start the scheduler.
  - Then serve.
- **Shutdown:** record `station.stopped`, stop the scheduler and connectors, close open SSE
  streams.

## The agent loop (RunService, ADR-0011)

One run is one bounded execution in a session:

```
queued ─start─► running ─complete─► completed
  │               │  ├─fail──────► failed
  │               │  ├─cancel────► cancelled        (user or kill switch)
  │               │  ├─block_budget► blocked_budget
  │               │  └─await_consent─► awaiting_consent ─resolve_consent─► running
  └─ (any unfinished state) ─interrupt─► interrupted (on restart)
```

The transition table is core's `run-state.ts`, and the runtime asks it before every change. For
each step, the loop:

1. Takes one of four concurrency slots (others queue).
2. Checks budgets (per run, per crew member per day, station per day) before the model call. A cap
   reached means `budget.blocked`, and the run ends `blocked_budget`.
3. Assembles the prompt with core's `assemblePrompt`. That is the four documents, a role briefing,
   beliefs ("What you remember", capped at a quarter of the budget), a notice that tool results are
   untrusted data, and windowed history (D19), with any steering added as a message from the
   Commander.
4. Makes one `streamText` call through the AI SDK with OpenRouter, or the scripted fake model.
   Tools are declared without `execute`. Deltas are published; usage and cost are recorded in
   `spend`.
5. For each tool call, runs policy, then consent, then execution:
   - a tool not granted is never offered, and is rejected if called anyway (double enforcement);
   - a `write`-class call under *Ask first* creates a consent request and pauses the run until
     the Commander decides; it never times out into approval;
   - results go back to the model as untrusted data.
6. Stops at a final answer or after 12 steps (`max_steps`).

Retries are ours: 408, 409, 429 and 5xx back off, honoring `retry-after`; 402 is never retried.
The kill switch is saved before it acts, cancels every active run, and refuses new ones until
cleared.

**Grants (D16):** core's `resolveGrants` combines three sources:
- the role (the Overseer gets `dispatch` and `read_session`);
- the props in the crew member's room (`web` → `web_fetch`; `files` → `read_file`, `list_files`
  and `write_file`, confined to `workspaces/<agentId>/`; `memory` → `remember`);
- connector grants (every tool of a granted connector, namespaced `notion__<tool>`).

Our read/write classification is authoritative, and unknown tools are `write`.

## Orchestration

- **Dispatch (depth 1, D20):**
  - The Overseer's `dispatch` starts a worker run in a new session and returns at once.
  - When the worker ends, a report is posted into the Overseer's session: its last reply, the
    files it wrote, and why it stopped.
  - With auto review on, the Overseer reviews it as soon as its session is free.
  - Workers never get `dispatch`.
  - `read_session` lets the Overseer read any session, up to 20k characters.
  - The Commander can steer a running run; the direction is added before its next model call.
- **Scheduler (D21):**
  - croner is used for date math only; the runtime runs its own timers through a `Clock` that
    tests can drive by hand.
  - A schedule's prompt is sent as a run with `trigger: "schedule"` into its own "Scheduled"
    session, so grants, consent and budgets all apply.
  - On startup, an occurrence missed while the daemon was down is recorded, or run once when the
    schedule has `catchUp`.
  - A busy session or the kill switch skips an occurrence with a reason.
- **Memory:** `remember` only proposes. The Commander approves (optionally edited), rejects,
  edits or forgets. Only approved beliefs reach a prompt.
- **Connectors (ADR-0012):**
  - `ConnectorManager` is the MCP client, using Streamable HTTP and OAuth with the tokens in the
    keychain.
  - Notion is the one v1 connector, installed station-wide.
  - Each crew member is granted it or not. Its status changes are events, and it reconnects with
    backoff.

## What the SPA shows, and from where

The product law is that the interface never asserts state the runtime cannot prove.

- **Data flow:**
  - Screens read server state through TanStack Query.
  - One SSE connection (read with `fetch`, so it can carry the token) feeds `invalidateFor`,
    which refetches only the queries an event affects.
  - Mutations do not patch the cache; the events that follow refresh it, so another tab's change
    shows up the same way.
- **The station map:**
  - core's `mapModelFor` draws the station config plus crew activity, which comes from
    `GET /api/activity` and is folded from the event log by `foldCrewActivity`.
  - It is rendered by ui's `StationMap` (D24).
- **Notifications** are core's `notificationFor` over the event log, with one persisted read
  marker.
- **Onboarding** shows whenever `station.json` is missing.

## Persistence

- **Files** (`$OUTERWORLD_HOME`): `station.json` and `agents/<id>/` (`agent.json` and four
  markdown documents). They are written atomically, edited in the UI or by hand, and read on every
  request and run, so edits take effect on the next run.
- **SQLite** (`station.db`, WAL, numbered migrations): events, sessions, runs, messages,
  memories, consents, spend, dispatches, schedule state and history, and station state (the kill
  switch, the notifications read marker).
- **OS keychain** (service `outerworld-ai`): the OpenRouter key and connector sign-ins. Never in
  files, SQLite, events, logs, or the SPA. `OUTERWORLD_SECRETS=memory` keeps a throwaway daemon
  off the keychain.

## Testing

- **Pure logic:** unit tests in core.
- **The loop:** runtime tests against `MockLanguageModelV4`, a fake MCP server
  (`InMemoryTransport`), temp station directories, and in-memory SQLite.
- **Daemon:** route and real-HTTP tests.
- **SPA:** component tests against an in-memory fake daemon with axe checks.
- **Browser:** `browser:verify` drives the built daemon and SPA in Chromium, after seeding real
  history through the API with the fake model.
- No test or CI job touches the network (`no-network.ts`). Real OpenRouter and Notion checks are
  manual smoke tests. How each acceptance criterion is shown is in
  [specs/v1-acceptance.md](specs/v1-acceptance.md).
