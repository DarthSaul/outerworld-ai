# Todo: v1 — Local station runtime

Source of truth: `docs/specs/BRIEF-station-runtime.md` (the brief). Milestone 1 plans are in
`tasks/archive/`. Every task ends with `pnpm check:task` green and one Conventional Commit per
logical change. Stop at each **CHECKPOINT** with: what was built, how to try it, tests added,
decisions made, open questions.

## Verified library facts (2026-09-29, npm registry + package types + official docs)

| Need | Choice | Version | Facts that shape the design |
|------|--------|---------|------------------------------|
| Model SDK | `ai` | 7.0.x | v7 renames: `instructions` (was `system`), `stopWhen: isStepCount(n)`, `result.stream` (was `fullStream`), `onEnd`/`onStepEnd`. Tools without `execute` let us run them ourselves. `result.usage` is total across steps; per-step `providerMetadata` on `finish-step`. `abortSignal` supported. `maxRetries` default 2 (408/409/429/5xx, honors `retry-after`). zod 4 OK. |
| Test model | `ai/test` | 7.0.x | `MockLanguageModelV4({ doStream: [...] })`, one scripted result per step; chunks `text-start/text-delta{delta}/text-end`, `tool-call{input: JSON string}`, `finish{finishReason:{unified}, usage:{inputTokens:{total}, outputTokens:{total}}, providerMetadata}`. `simulateReadableStream`. |
| Provider | `@openrouter/ai-sdk-provider` | 3.1.0 | peer `ai ^7`. `createOpenRouter({ apiKey })`. Cost in `providerMetadata.openrouter.usage.cost` (optional; always included now). Key check: `GET https://openrouter.ai/api/v1/key` (no inference). 402 on negative balance, not retryable. |
| MCP client | `@modelcontextprotocol/client` (+ `server` for tests) | 2.2.0 | v2 split packages; `Client`, `StreamableHTTPClientTransport`, `StdioClientTransport` (`/stdio`), `OAuthClientProvider`, `auth()`, `UnauthorizedError`, `transport.finishAuth(code)`, DCR built in, `AuthProvider { token() }` for bearer. `InMemoryTransport.createLinkedPair()` for the fake server. Annotations are hints only. |
| Notion | hosted Notion MCP (ADR-0012) | — | `https://mcp.notion.com/mcp`: Streamable HTTP, OAuth only (DCR + PKCE, refresh tokens), acts as the connecting user, no per-page scoping (not needed, decided 2026-09-29). Tools: `notion-search`, `notion-fetch`, `notion-create-pages`, `notion-update-page`, `notion-move-pages`, `notion-duplicate-page`, comments, users, teams, databases/views. Annotations unverified; our map is authoritative. |
| HTTP + SSE | `hono` + `@hono/node-server` | 4.13 / 2.1 | `streamSSE` from `hono/streaming`, `writeSSE({data,event,id})`, `onAbort`; no built-in keepalive (we ping). `serve({ fetch, port, hostname: "127.0.0.1" })`. `bearerAuth`, `app.request()` for tests, `serveStatic` from `@hono/node-server/serve-static`. |
| Scheduler | `croner` | 10.0 | `new Cron(expr, { timezone, paused }, fn)`, `nextRun()`, `previousRuns(1, now)` for catch-up (persist last-run ourselves). Works under Vitest fake timers. |
| SQLite | `better-sqlite3` | 13.0 | Prebuilt binaries in the tarball, no install scripts (no pnpm allowlist needed), engines node >=22. `node:sqlite` is unflagged on 22.13+ but still stability 1.1 with an ExperimentalWarning on 22. |
| Keychain | `@napi-rs/keyring` | 2.1 | `new Entry(service, account).setPassword/getPassword/deletePassword`. On Linux without Secret Service it silently falls back to a non-persistent keyring; we pass `{ linux: { store: "secret-service" } }` so it fails loudly and we fall back to env. |
| SPA | `vite` + `@vitejs/plugin-react` + `@tanstack/react-query` | 8.3 / 6.1 / 5.104 | Vite proxy passes SSE; we disable compression on `/events`. |
| Router | `react-router` (declarative) | 7.x | 8.x requires node >=22.22; our engines say >=22. Stay on 7 unless we tighten `.nvmrc`. |

## Decisions not covered by the brief (smallest reasonable choice; flag at checkpoints)

- **D1 ADR numbers.** ADRs live in `docs/decisions/`, and 0008/0009 are taken. New: ADR-0010 local
  runtime (the prompt's "ADR-0008"), ADR-0011 stack (prompt's "0009"), ADR-0012 Notion connector
  (prompt's "0010").
- **D2 Superseded ADRs.** 0004 (Routines), 0006 (grants prompt-enforced → now runtime-enforced),
  0008 (one Routine and ledger per team) → `Superseded by ADR-0010`. 0009 (schema versioning)
  stays Accepted; its versioning rules apply to `station.json`/`agent.json`, a note says the
  ledger/generator parts are historical. 0001, 0002, 0003, 0005, 0007 unchanged. There is no
  Next.js ADR and no "no network" ADR; those rules live in CLAUDE.md/PRIVACY.md and are rewritten.
- **D3 Floor guard vocabulary.** The guard bans `lane`/`lanes`, but the brief makes `lane` the code
  identifier. Remove those two words from the guard and CLAUDE.md in its own commit
  (`chore(repo): allow lane as a neutral identifier (brief §4)`).
- **D4 apps/web removal timing.** Removing `apps/web` in Phase 0 leaves `/dev` gallery and
  `browser:verify` with no host until `apps/station` exists, and I will not disable the CI browser
  job. Proposal: Phase 0 archives generator + ledger template; `apps/web` is removed in Phase 1 in
  the same change that moves the gallery and `browser:verify` onto `apps/station`.
- **D5 Own agent loop.** One `streamText` call per step (`stopWhen` default = 1 step), tools
  without `execute`; the runtime does policy check → consent → execute → append → next step. This
  puts the budget check before every model call and consent under our state machine instead of
  v7's `toolApproval` round-trip. SDK `maxRetries: 0`; our own backoff wrapper (429/408/5xx,
  honors `retry-after`, 402 never retried) so each retry is an event and testable with fake timers.
- **D6 Dispatch sessions.** A **new worker session per dispatch** (clean context, 1:1 with the
  dispatch card, no cross-task leakage). Auto-trigger a lead review turn when a result lands:
  on by default, `station.json` `dispatch.autoReview: boolean`.
- **D7 Token delivery in dev.** Daemon writes `$OUTERWORLD_HOME/daemon.token` (0600). Prod: the
  daemon injects it into the served `index.html` (`<meta name="outerworld-token">`). Dev: a small
  Vite plugin reads the same file in `transformIndexHtml`. Allowed Origins = the daemon's own
  origin + the Vite dev origin (dev only).
- **D8 Fake model in dev.** `OUTERWORLD_MODEL=fake` makes the daemon use the scripted provider
  from `packages/runtime/testing`, so `pnpm dev` on the fixture and `browser:verify` work with no
  key and no network. Real OpenRouter only when a key is present and the flag is unset.
- **D9 web_fetch egress.** http(s) only; refuse loopback, private, link-local, CGNAT, multicast,
  and `.local`/`.internal`/`localhost` targets after DNS resolution, re-checked on every redirect
  (max 5), so an agent cannot reach the daemon or LAN; size cap 1 MiB, timeout 15 s, HTML → text,
  binary refused. Known limit: DNS is resolved separately from the connection, so a rebinding
  answer between the two could slip through; pinning the resolved address is a follow-up.
- **D10 Coverage.** core keeps 90/85. New row: `packages/runtime` lines >= 85, branches >= 80
  (async/IO-heavy). The generator row is removed with the package (the package is archived, not
  a loosening). ui unchanged. Recorded in CONSTRAINTS.md with the reasons.
- **D12 Retired tests (owner-approved 2026-09-29).** The floor guard allows a test deleted in the
  same diff as its package's `package.json` or its sibling module; a lone test deletion is still
  flagged. Commit messages still give the reason.
- **D13 API under `/api/` (Phase 1).** `GET /api/health` and `GET /api/events` rather than root
  paths, so the SPA owns every other path and the Vite proxy forwards one prefix.
- **D14 Legacy map model stays until Phase 9 (revises D11).** The ui map, its tests, and the gallery
  still consume core's milestone 1 `Station`/`StationState` (and `parseLedger` for their fixture);
  that fixture moves to `fixtures/map-demo/`. New schemas are `StationConfig`/`AgentConfig`.
- **D15 Token exposure to local users.** Any local process can fetch the SPA's index.html from
  127.0.0.1 and read the token; v1 assumes a single-user machine (documented in PRIVACY.md).
- **D16 Tool classes and names (Phase 2).** Built-ins: `dispatch`, `read_session`, `web_fetch`,
  `read_file`, `list_files`, `remember` are `read`; only `write_file` is `write` (dispatch is gated
  by depth and budgets, memory by the Commander's approval). Connector tools are named
  `<connectorId>__<tool>` (provider-safe characters, 64 max, hashed when truncated) so they never
  collide with built-ins. Depth 0 withholds `dispatch` from the Overseer.
- **D17 Supported models (Phase 2).** `anthropic/claude-sonnet-5.5` (default),
  `anthropic/claude-opus-5.5`, `openai/gpt-5.6-terra`, `google/gemini-3.8-flash`, checked against
  OpenRouter's model list on 2026-09-29. Other ids load with a warning, not an error.
- **D18 Deltas are ephemeral (Phase 3).** Token deltas go to live subscribers (SSE without an
  `id`) but are not written to the event log; the final message and `run.completed` are. A client
  that reconnects mid-run misses in-flight text but never loses the stored message (brief §10:
  "coalesced into the final message on completion, so the log stays compact").
- **D19 History budget (Phase 3).** A prompt gets half the model's context window, capped at 32k
  estimated tokens (characters / 4), so 1M-token models do not send 1M-token prompts. Whole turns
  are dropped oldest first; a tool call is never separated from its result; the turn in progress
  is always kept. Beliefs may use at most a quarter of the budget.
- **D20 Dispatch mechanics (Phase 5).** A new worker session per dispatch (D6). The report posted
  to the lead is the worker's last reply (≤ 4000 chars) plus the files it wrote and why it stopped
  if it did not complete; the model sees it as labelled input. With auto review on, the lead's
  review turn starts as soon as its session is free (after its current run if it is busy). A
  direction (steer) is added to the worker's session as a message from the Commander right before
  its next model call. `read_session` returns at most 20k characters, from the start.
- **D21 Scheduler mechanics (Phase 8, owner-approved 2026-09-30).** A schedule with no `timezone`
  runs in the machine's zone. Each schedule posts into its configured session, else its own
  "Scheduled: <id>" session. `catchUp` is off by default; on startup it runs the most recent
  missed occurrence once, and without it that occurrence is recorded as missed (`down`). A new,
  edited, disabled, or re-enabled schedule counts from the moment it is armed, so it never catches
  up on earlier times. An occurrence whose session is still running is skipped (`busy`), never
  stacked; the kill switch skips it too (`stopped`). A scheduled run needing consent waits with no
  timeout and shows on Notifications like any other. DST follows croner: a skipped local time runs
  at the first valid time after it, and a repeated one runs once. The schedule id comes from the
  first words of its prompt.
- **D22 Budget defaults (Phase 9; owner to confirm).** A station created by onboarding starts with
  `DEFAULT_BUDGETS` ($5 per run, $25 per crew member per day, $50 station per day: the values the
  owner tested with real Notion work). A station whose `station.json` has no budgets has no caps;
  it is not given any silently. Settings → Budgets shows each cap, "empty means no cap", and
  today's station spend; `null` removes a cap.
- **D23 Onboarding and dev homes (Phase 9; flag at checkpoint).** The SPA shows onboarding whenever
  the station has no `station.json`: the key (skipped for the fake model, or "add it later"), then
  the Overseer's name and one of three tones (calm, warm, brisk), optionally the Project Manager,
  ending in a new COMMS session with the Overseer. Onboarding writes only the Command room;
  the Project Manager template adds Operations, a hallway to Command, and the Notion connector
  when missing. `pnpm dev` stays on the demo fixture copy; `pnpm dev:fresh` starts an empty
  station (wiped each time) so acceptance 1 can be walked through; a real first run is
  `OUTERWORLD_HOME=~/.outerworld pnpm dev` (OpenRouter, asks for the key).
- **D24 Station map from runtime state (Phase 9).** The ui map keeps its milestone 1 model (D14);
  core's `mapModelFor` adapts the runtime to it: rooms → panels (mission = room description),
  props and granted connectors → chips (web and memory read, files and connectors write),
  hallways → handoffs (never carrying in v1), the Overseer → the core at the edge (not repeated in
  its room), other crew → cards (subtitle = approval mode). Live state is folded from run events
  (`foldCrewActivity`; several runs at once aggregate, waiting for consent first) and mapped onto
  existing visuals without new tokens: running → working; waiting for consent → working with the
  note "waiting for your approval" and its room "needs attention"; failed → failed; blocked
  (budget or kill switch) → failed with the reason and its room "stalled". The Overseer core:
  running → working, waiting or failed → needs attention, done → done. Clicking a crew member
  opens their page, the Overseer opens COMMS, a connector chip opens Connectors. A rig of its own
  for "waiting for consent" is a design follow-up.
- **D11 Old core modules.** Ledger parsing, status schemas, StationState, health, and the demo
  timeline are Routines-specific; they are deleted in Phase 1 when the new schema lands (tests for
  them go with them; commit message says why).

## Phase 0 — Housekeeping and decisions

### 0.1 Commit the brief
- [x] `docs/specs/BRIEF-station-runtime.md` committed as-is (`docs(specs): add the station runtime brief`).
- [x] This plan and the archived milestone-1 plans committed (`chore(tasks): archive milestone 1, plan v1`).

### 0.2 ADR-0010 Local station runtime
- [x] Context (the brief's §2 table), decision (daemon + SPA on 127.0.0.1, OpenRouter BYOK, local files + SQLite + keychain, runtime-enforced grants), consequences (laptop on, metered cost, generator archived, StarNet vocabulary to revisit).
- [x] 0004, 0006, 0008 marked `Superseded by ADR-0010`; 0009 carries a historical note; `docs/decisions/README.md` index updated.

### 0.3 ADR-0011 Stack choices
- [x] Records the table above with versions, rejected alternatives (node:sqlite, keytar, Fastify/Express, react-router 8, AI SDK `toolApproval`), and D5/D7/D8.

### 0.4 ADR-0012 Notion connector (decided by the owner 2026-09-29)
- [x] Hosted Notion MCP over Streamable HTTP with OAuth, connected once station-wide; no stdio fallback, no page scoping. Per-agent access is binary: granted or not.
- [x] Our read/write classification of Notion tools is authoritative and drives consent only (under *Ask first*, `write` calls pause); unknown tools default to `write`.
- [x] Rejected: local `@notionhq/notion-mcp-server` (unmaintained; page scoping not needed), direct REST (not MCP).
- [x] Brief amended in the same commit: §3 goal 5, §6 connector row, §12 grant editor, §16.2, §17 PM grants say "Notion granted" instead of presets; status line notes the amendment.

### 0.5 Archive the ledger template
- [x] `templates/ledger-repo` removed (no tests, no dependents). CLAUDE.md/README references go in 0.8.
- The generator is archived in Phase 1 together with `apps/web` (see D12): web's loader test
  imports it, and the pair is removed in one diff so the floor guard sees whole packages retired.

### 0.6 Floor guard: allow `lane` (D3)
- [x] `lane`/`lanes` removed from `THEMED` in `scripts/floor-guard.mjs` and from CLAUDE.md's banned list; separate commit.

### 0.7 Glossary rename
- [x] `glossary` keys and strings follow brief §4: station (whole system), room/rooms, agent → "Crew member"/"Crew", lane → "Hallway", grant → "Prop", connector, user → "Commander", overseer, comms → "COMMS", session, run → "Run", dispatch, approvalMode ("Ask first"/"Full power"), memory ("Stored beliefs"/"Awaiting your decision"), notifications.
- [x] Removed keys: ledger/report/routine/system-report wording. ui call sites and the web dashboard use the new keys; glossary test lists every key; floor guard passes.
- [x] Schema identifiers (`Team`, `Handoff`) are *not* renamed here; they are replaced in Phase 1 (D11).

### 0.8 Docs rewrite
- [x] `docs/PRIVACY.md` per brief §11: what lives where (station dir, SQLite, keychain, browser), what leaves (OpenRouter model calls, Notion connector calls, `web_fetch` requests; nothing else), what never leaves the daemon (secrets never to SPA/logs/events/station dir).
- [x] `README.md`: what it is, status (v1 in progress; milestone 1 archived), quickstart (`pnpm install && pnpm dev`), OpenRouter key requirement.
- [x] `CLAUDE.md`: new layout, package boundaries, vocabulary table from brief §4, product law, rules from the kickoff prompt (runtime logic only in `packages/runtime`, pure logic in core, fictional fixtures, no network in tests/CI, secrets never logged/persisted/emitted/sent to SPA), < 200 lines.
- [x] `CONSTRAINTS.md`: token rule covers `apps/station` (bullet + guard). Rows that need code land with it in Phase 1 (1.2/1.4), because the guard treats an edited row as a removed rule: runtime coverage (D10), the no-network floor item and its Vitest check, app-level axe on the SPA routes, and retiring the generator row with the package.
- [x] `docs/ARCHITECTURE.md` and `docs/SCHEMA.md` become stubs pointing at the brief.

**CHECKPOINT 0** — plan, ADRs, archive diff, ADR-0012 decision.

## Phase 1 — Skeleton: daemon, SPA, auth, event log

### 1.1 core schemas
- [x] `StationConfig` (`station.json`: schemaVersion, name, rooms, lanes, props placed as `rooms[].props: [{ kind: "web"|"files"|"memory" }]`, connectors metadata without secrets, budgets, dispatch settings) and `AgentConfig` (`agent.json`: name, roomId, role `"overseer"|"crew"`, model, approvalMode `"ask"|"full"`, connectorGrants, schedules).
- [x] Cross-field validation returns `Issue[]` (unknown room, duplicate ids, >1 overseer, lane to self). JSON Schema exported and drift-tested (ADR-0009).
- [x] Event envelope `{ seq, type, at, agentId?, sessionId?, runId?, payload }` and the v1 union from brief §10 as a zod discriminated union; round-trip tests.
- [x] ~~Old ledger/status/StationState modules deleted (D11)~~ kept until Phase 9 (D14); core stays at 90/85 (98.5 / 93 today).

### 1.2 runtime storage
- [x] `packages/runtime` created (README, strict tsconfig, 85/80 coverage); CONSTRAINTS.md gains the runtime coverage row and the no-network floor item, checked by a shared Vitest setup that fails any `fetch`/socket to a non-loopback host.
- [x] Station dir loader/writer: reads `station.json` + `agents/*/`, atomic writes (temp in same dir + fsync + rename), validates via core.
- [x] SQLite via better-sqlite3, numbered `.sql` migrations in a `schema_migrations` table; `events` append-only with `seq INTEGER PRIMARY KEY AUTOINCREMENT`; `append(event)` and `since(seq)`; an in-process bus for subscribers.
- [x] Tests: schema round-trip through disk, atomic write leaves no partial file on a simulated crash, replay from `seq`, migrations idempotent.

### 1.3 apps/daemon
- [x] Hono on `127.0.0.1`, port from `OUTERWORLD_PORT` (default 4317); `OUTERWORLD_HOME` default `~/.outerworld`; token generated on first start (32 random bytes, `daemon.token`, 0600).
- [x] Middleware: Host (DNS rebinding), Origin, and Sec-Fetch-Site checks on every route; bearer token on every `/api/*` route; 401/403 bodies never echo the token.
- [x] `GET /api/health`; `GET /api/events` SSE (D13) with `id: seq`, `Last-Event-ID` replay, 15 s ping, cleanup on abort. `station.started`/`station.stopped` events.
- [x] Prod: serves `apps/station/dist` with the token injected (D7).
- [x] Tests (via `app.request`): missing token 401, wrong token 401, bad Origin 403, replay from `Last-Event-ID`, token file mode 0600.

### 1.4 apps/station
- [x] Vite + React SPA, routes: Station, COMMS, Crew, Memory, Notifications, Connectors, Settings (placeholders; Station shows the live event log, the map returns in Phase 9).
- [x] API client with the token header; SSE client (`fetch`-based so it can send the header) with reconnect + `Last-Event-ID`. TanStack Query is wired; invalidation by event lands in Phase 2 with the first queries.
- [x] Dev proxy to the daemon; Vite plugin for the token (D7).
- [x] `/dev` gallery moved from apps/web; `apps/web` and `packages/generator` removed in one diff (D4, D12); `browser:verify` targets the built SPA served by the daemon; CONSTRAINTS.md app-level axe row and the ui/web budget rows point at the SPA, and the generator coverage and output rows are marked retired, kept for the owner to delete; CI step names and `turbo.json` `globalEnv` updated; root `package.json` description rewritten.

### 1.5 dev loop
- [x] `pnpm dev` runs daemon + Vite together against `fixtures/demo-station` (copied to `.outerworld/dev-home/` on first run so the fixture is never mutated); `OUTERWORLD_HOME=… pnpm dev` uses a real dir.
- [x] Fixture rewritten minimally to the new schema (full rewrite in Phase 9).

**CHECKPOINT 1**

## Phase 2 — Crew as documents
- [x] Agent CRUD (runtime `CrewService` + `GET /api/agents/:id`, `POST /api/agents`, `PATCH`/`DELETE /api/agents/:id`, `PUT /api/agents/:id/documents/:name`), documents `identity.md`, `purpose.md`, `standing-orders.md`, `context.md`; atomic writes; ids from names (kebab, unique). The station and crew list come from `GET /api/station`.
- [x] Room CRUD (`POST /api/rooms`, `PATCH`/`DELETE /api/rooms/:id`), prop placement (web, files, memory) in `station.json`; a room with crew or hallways cannot be deleted.
- [x] core `resolveGrants(agent, station, connectorTools)` → `{ name, class: "read"|"write", source: role|prop|connector }[]`; role grants (overseer: `dispatch`, `read_session`); table tests (roles × props × connectors, depth 0, unknown room, uninstalled connector, name limits; worker never gets `dispatch`). Connector tools are granted whole (ADR-0012) and namespaced (D16).
- [x] SPA: Crew list with rooms and prop toggles, agent editor (four markdown editors with separate save state, model picker from `SUPPORTED_MODELS` (D17), approval mode with *Full power* visibly flagged, connector grants, effective tools view), room editing inline on the Crew screen.
- [x] Every change emits `agent.updated` / `station.updated`; the SPA invalidates its queries from those events, tested by changing state "elsewhere" and emitting the event (two real tabs share the same path).

## Phase 3 — Agent loop and COMMS
- [x] Key: Settings stores the OpenRouter key in the keychain (`@napi-rs/keyring`, service `outerworld-ai`); env `OPENROUTER_API_KEY` fallback; validated via `GET https://openrouter.ai/api/v1/key` (no model call); the API only returns `{ configured, source }`. Every event payload is redacted (known key values and anything shaped like an OpenRouter key), tested.
- [x] core `assemblePrompt({ documents, roleBriefing, beliefs, history, budgetTokens })`: documents under headings + role briefing (Overseer gets the crew roster) + beliefs (≤ 1/4 of budget) + untrusted-data notice; whole-turn windowing that never splits a tool call from its result (D19).
- [x] Run state machine (brief §8) as a pure table in core; `RunService` in runtime (D5): one `streamText` per step, `maxSteps` (12, completes with `reason: max_steps`), `AbortController` cancel (queued or streaming; partial text kept), our retry/backoff (408/409/429/5xx, `retry-after`, 402 never), concurrency slots (default 4, queued runs wait). Deltas are ephemeral (D18); state changes and tool calls are events; one stored message per step.
- [x] Sessions: create, list, open, rename, archive; messages persisted; survive restart. One active run per session.
- [x] Startup: runs left `queued`/`running`/`awaiting_consent` become `interrupted` with an event, before the daemon serves; never resumed.
- [x] SPA COMMS: per-agent session list, streaming chat, tool-call and run-state rendering, cancel, several windows at once; Settings for the key and model mode.
- [x] Tests (fake provider): streaming, multi-step tool loop, forbidden call rejected at execution and never offered, cancel mid-stream and while queued, max steps, retry then success, retries exhausted, 402, no key, missing agent, concurrency, interrupted-on-restart (runtime and daemon), messages unchanged after restart.

**CHECKPOINT 3** — you chat with the Overseer against the real API.

## Phase 4 — Tools, consent, spend, budgets
- [x] `web_fetch` (D9: public http(s) only, re-checked per redirect, 1 MiB, 15 s, HTML → text), `read_file` / `write_file` / `list_files` confined to `workspaces/<agentId>/` (absolute, NUL, traversal, and symlink escapes refused, each tested), `remember` (records a proposal; Phase 7 reviews them).
- [x] Consent under *Ask first* for `write`-class calls: `consent.requested` + `run.awaiting_consent`, run paused until approve/deny (inline in COMMS and on Notifications); denial returned to the model as the tool's error result; no timeout. Cancel expires the request; a restart expires it and interrupts the run.
- [x] Double enforcement: non-granted tools are never offered (asserted on the request) and a call to one is rejected at execution and never run (Phase 3 test, still green).
- [x] Spend per model call (tokens + OpenRouter's `providerMetadata.openrouter.usage.cost`, `null` when absent), totals per run, session, agent-day, station-day (UTC).
- [x] Budgets (per-run, per-agent daily, station daily) before every model call; `budget.warning` once at 80%; `budget.blocked` ends the run as `blocked_budget`. Kill switch persisted before it acts, cancels queued, running, and waiting runs, refuses new ones until cleared.
- [x] SPA: spend on sessions, crew, and the header; kill switch in the header with a banner; pending approvals inline and on Notifications.
- [x] Dev: the fake model calls a tool on `use <tool> {json}` so all of this can be tried with no key.

## Phase 5 — Overseer dispatch (depth 1)
- [x] core `checkDispatch` / `dispatchTargets`: holder must be the Overseer, depth below `maxDispatchDepth` (1), target from the station graph (v1: Overseer → every other crew member). Tests include a worker attempting dispatch, self, unknown target, depth 1, and delegation off.
- [x] runtime `dispatch({ to, task, inputs })`: a new worker session per dispatch (D6), the worker's run at depth 1, `{ dispatchId }` returned at once; workers never receive `dispatch`. On completion a report (last reply + files written + why it stopped) is posted into the lead's session with `dispatch.completed` / `.cancelled` / `.failed`; the lead reviews automatically when its session is free (`dispatch.autoReview`, D20).
- [x] `read_session` for the Overseer: read-only, 20k characters.
- [x] Steer (`POST /api/runs/:id/steer`, `run.steered`, injected before the next model call) and stop (cancel).
- [x] SPA: dispatch cards inline in the Overseer's COMMS that expand to the worker's live session (steerable there); report cards; Running now on the Station screen.
- [x] Tests: fan-out to two workers running at once, results land in the lead's session, cancel one, a budget blocks one, auto review on and off, steer delivered at the next step, a daemon end-to-end dispatch through the fake model.

## Phase 6 — Notion MCP connector (per ADR-0012)
- [x] `runtime/mcp` ConnectorManager on `@modelcontextprotocol/client` v2: connect over Streamable HTTP, list and classify tools, call, reconnect with capped backoff after a drop, reconnect signed-in connectors at startup, `connector.status` events (`connected`, `needs_auth`, `disconnected`, `error`).
- [x] Notion per ADR-0012: OAuth (discovery, dynamic registration, PKCE, refresh by the SDK) with the loopback callback `GET /oauth/callback/:id` guarded by a one-time state; registration and tokens in the keychain; `docs/connectors/notion.md` (setup, "every granted crew member acts as your Notion account", dedicated-account advice).
- [x] Classification: our explicit Notion map is authoritative; an unknown tool with a read-only (and no destructive) hint seeds read; every other unknown is write. Drives consent; shown on the Connectors screen.
- [x] Per-agent grant is one toggle (`connectorGrants: ["notion"]`), already in the agent editor; granted crew get every tool, namespaced `notion__<tool>`; others get none.
- [x] Fake MCP server (in-memory transport) for runtime and daemon tests; env-gated smoke test `src/mcp/notion.smoke.test.ts` (lists tools only).
- [x] SPA Connectors screen: status, URL, tools with read/write, granted to, Connect / sign-in link / Disconnect / forget / remove, Add Notion.

**CHECKPOINT 6** — you connect Notion and test the Project Manager.

## Phase 7 — Memory
- [x] `remember` → proposal `{ text, scope: "agent"|"station", sourceRunId }`; Memory screen: *Stored beliefs* / *Awaiting your decision* (approve, edit-then-approve, reject), edit/delete beliefs; `memory.*` events (`memory.updated` added for edits and deletes).
- [x] Prompt assembly injects approved agent + station beliefs, newest decided first, capped at a quarter of the prompt budget. Tests: approved belief appears in the next run's request (asserted on `doStreamCalls`); rejected one never does.
- [x] Daemon: `GET /api/agents/:id/memories`, approve (optionally edited), reject, edit, delete; a decided proposal is 409. The phase placeholders are gone: every v1 screen is real.

## Phase 8 — Scheduler
- [x] Schedules in `agent.json` (cron, timezone, prompt, target session defaulting to a per-schedule "Scheduled" session, `catchUp`); croner; `schedule.fired`/`schedule.missed`; catch-up once on startup when enabled (last fire persisted). D21.
- [x] Scheduled runs obey grants, approval mode, budgets (they go through `RunService.send` with `trigger: "schedule"`); pending consent shows on Notifications like any other.
- [x] SPA schedule editor on each crew member's page: on/off, next run in the schedule's zone, Run now, edit, remove, recent history, link to its session. Tests with a manual clock incl. DST (spring gap, autumn repeat) and missed-while-down, with and without catch-up.

## Phase 9 — Station view, notifications, onboarding, seed crew
- [x] ui map adapted: rooms, crew in rooms, props, hallways (rendered only), live crew state (idle, running, awaiting consent, blocked) from events only. D24.
- [x] Notifications: filtered event projection (core `notificationFor`: action / alert / info, incl. a scheduled run's result), unread state persisted as one read marker in `station_state`; feed with "Show older", "Mark all as read", and an unread count in the nav.
- [x] Settings → Budgets: view and edit `station.json` budgets (per run, per agent daily, station daily) in the SPA (`PUT /api/budgets`); defaults for new stations per D22 (owner to confirm).
- [x] Onboarding: key → Overseer (name, tone) in Command room with dispatch, read_session, Web, Memory → first chat. Project Manager template (Operations; Notion granted, Web, Memory, Files; daily briefing schedule disabled), at onboarding or from the Crew screen. D23.
- [ ] `fixtures/demo-station` rewritten as a fictional station dir exercising all of the above; `browser:verify` green against it.

## Phase 10 — Close v1
- [ ] `docs/specs/v1-acceptance.md`: each brief §16 criterion with the test or scripted manual steps that demonstrate it.
- [ ] `docs/ARCHITECTURE.md`, `docs/SCHEMA.md` from what was built; README quickstart and status.

**CHECKPOINT 10**

## Follow-ups (not scheduled)
- ~~Intermittent React #418 hydration mismatch in `browser:verify`~~ gone with `apps/web` (Next.js
  SSR) in Phase 1; the SPA renders only on the client, so there is no hydration step to mismatch.

- **Retired CONSTRAINTS rows** (generator coverage, generator output, apps/web first-load JS):
  left in place by the owner 2026-09-29; revisit whether to delete them later.
- **SPA browser/e2e tests:** deferred 2026-09-29 in favor of unit and component tests; revisit
  once COMMS and the map exist (e.g. a Playwright flow per v1 acceptance criterion).
- **Budget limits (owner, 2026-09-30):** the demo and dev budgets were raised from $0.25 per run /
  $1 per agent-day / $3 station-day to $5 / $25 / $50 after a real Notion task via dispatch cost
  $0.39 and hit the per-run cap. Revisit in a later phase: sensible defaults for a new station
  (with the Settings → Budgets item in Phase 9), per-model guidance from real usage, and the
  overshoot (the check runs before each model call, so one call can pass a cap; consider a
  pre-call estimate from prompt size and a `max_tokens` bound).
- **Confident memories skip approval (owner, 2026-09-30):** `remember` should let the agent say
  whether it is confident in a belief. A confident one is stored as a belief at once (still shown
  on the Memory screen, editable and forgettable); one that would benefit from the Commander's
  judgment goes to *Awaiting your decision* as today. To design: the input (a `confidence` flag or
  level vs. an explicit `needsApproval`), whether station-scope beliefs always need approval,
  a per-agent or per-station setting to turn auto-store off, an event that marks a belief as
  self-approved, and how this fits the brief §14 rule that nothing is remembered until approved
  (amend the brief when it lands).
- **A rig state for "waiting for consent" (D24):** today it borrows *working* plus a note and
  the room's attention dot. Give it its own glow/pose in the design spec first, then the tokens.
- **Node engine:** establish the supported Node line. `.nvmrc` says 22 and `engines` says `>=22`,
  but local development runs Node 24, `react-router` 8 needs `>=22.22`, and `node:sqlite` is only a
  release candidate on 24.15+. Decide the pin, then align `.nvmrc`, `engines`, CI, and ADR-0011.

## Out of scope (stop and ask if any of these appears)
Conveyor Lines / Bays / Inbox / Outbox / Logbook; webhooks, folder watchers, channel triggers;
terminal/shell tools; recursive delegation; helper copies; agents creating/editing agents; desktop
shell; connectors other than Notion; embeddings; session summarization; npm publishing.
