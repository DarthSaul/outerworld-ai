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
- **D9 web_fetch egress.** http(s) only; refuse loopback, private, link-local and `.local`
  targets (after DNS resolution) so an agent cannot reach the daemon or LAN; size cap 1 MiB,
  timeout 15 s, HTML → text.
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
- [ ] Agent CRUD (runtime service + `GET/POST/PATCH/DELETE /agents`), documents `identity.md`, `purpose.md`, `standing-orders.md`, `context.md`; atomic writes; ids from names (kebab, unique).
- [ ] Room CRUD, prop placement (web, files, memory) in `station.json`.
- [ ] core `resolveGrants(agent, station, connectorTools)` → `{ tool, class: "read"|"write", source: "role"|"prop"|"connector" }[]`; role grants (overseer: `dispatch`, `read_session`); exhaustive table tests (every role × prop × connector preset, unknown tool → write, worker never gets `dispatch`).
- [ ] SPA: Crew list, agent editor (four markdown editors, model picker from `SUPPORTED_MODELS` in core, approval mode with *Full power* visibly flagged, resolved grants view), Room editor.
- [ ] `agent.updated` / `station.updated` emitted on every change; SPA updates live (test: two query clients, one edits, other sees it).

## Phase 3 — Agent loop and COMMS
- [ ] Key: Settings stores the OpenRouter key in the keychain (`@napi-rs/keyring`, service `outerworld-ai`); env `OPENROUTER_API_KEY` fallback; validated via `GET /api/v1/key`; the API only ever returns `{ configured, source }`. Secret redaction helper used by logger and event writer (test: a key-shaped string never reaches events or logs).
- [ ] core `assemblePrompt({ docs, roleBriefing, beliefs, history, input, budgetTokens })`: system = docs + briefing + beliefs; newest history turns that fit; token estimate function injectable; tests for windowing edges.
- [ ] runtime run state machine (brief §8) as a pure transition table in core + the loop in runtime (D5): `maxSteps`, `AbortController`, backoff (429/408/5xx; `retry-after`), per-provider concurrency limit (default 4, queued runs wait). Events for every delta, tool call, state change; deltas coalesced into the stored message on completion.
- [ ] Sessions: create, list, open, rename, archive; messages persisted; survive restart.
- [ ] Startup: runs in `queued`/`running`/`awaiting_consent` → `interrupted` + event; never resumed.
- [ ] SPA COMMS: per-agent session list, streaming chat, tool-call and run-state rendering, cancel, several windows open at once.
- [ ] Tests (fake provider): streaming, multi-step tool loop, cancel mid-stream, max steps, retry then success, retry exhausted → failed, interrupted-on-restart, no duplicate messages after restart.

**CHECKPOINT 3** — you chat with the Overseer against the real API.

## Phase 4 — Tools, consent, spend, budgets
- [ ] `web_fetch` (D9), `read_file`/`write_file`/`list_files` confined to `workspaces/<agentId>/` (realpath check, reject `..`, absolute paths, symlink escape; tests for each), `remember` (creates a proposal; wired fully in Phase 7).
- [ ] Consent under *Ask first* for `write`-class calls: `consent.requested` → run `awaiting_consent` → approve/deny via API (inline in COMMS + Notifications); denial returned to the model as a tool result; no timeout. Test: pending consent survives SPA reconnect; restart marks it interrupted.
- [ ] Double enforcement test: fake provider emits a call to a non-granted tool → rejected, returned as error result, `run.tool_call` event records the rejection; non-granted tools are absent from the request (`doStreamCalls` asserted).
- [ ] Spend table per model call (tokens + cost from `providerMetadata.openrouter.usage.cost`, `null` when absent); aggregates per run/agent/day (UTC).
- [ ] Budgets (per-run, per-agent daily, station daily) checked before every model call; `budget.warning` at 80 %; `budget.blocked` stops the run cleanly. Kill switch persisted before it acts, cancels all runs, refuses new ones until cleared.
- [ ] SPA: spend on sessions, crew, station total; kill switch in the header.

## Phase 5 — Overseer dispatch (depth 1)
- [ ] core `canDispatch(holder, target, depth, station)`: holder has dispatch grant, depth < `maxDispatchDepth` (1), target reachable in the station graph (v1: overseer → all crew). Tests incl. worker attempts dispatch, self-dispatch, unknown target.
- [ ] runtime `dispatch({ to, task, inputs })` → new worker session (D6), run started, `{ dispatchId }` returned immediately; completion posts summary + workspace artifact refs into the lead's session, `dispatch.completed`; auto review turn (configurable).
- [ ] `read_session` tool (read-only, size-capped, overseer only).
- [ ] Steer (queued direction injected at the next step, visible) and stop.
- [ ] SPA: dispatch cards inline in the Overseer's COMMS, expandable to the worker's live session; activity view.
- [ ] Tests: fan-out to two workers concurrently, results land in the right session, cancel one, budget blocks one.

## Phase 6 — Notion MCP connector (per ADR-0012)
- [ ] `runtime/mcp` connector manager on `@modelcontextprotocol/client`: install, connect, list tools, call, reconnect with backoff, `connector.*` status events.
- [ ] Notion per ADR-0012: OAuth (DCR + PKCE) with a loopback callback on the daemon, tokens and client registration in the keychain, refresh on 401, reconnect flow in the Connectors screen; `docs/connectors/notion.md` (setup, "every granted agent acts as your Notion account").
- [ ] Classification: our explicit Notion map authoritative; annotations seed unknown tools; unknown → `write`. Used for consent, shown on the Connectors screen.
- [ ] Per-agent grant is a single toggle (`agent.json` `connectorGrants: ["notion"]`): granted → all the connector's tools resolve for that agent; not granted → none are sent or executable.
- [ ] Fake MCP server (in-memory transport) for tests; env-gated smoke test `OUTERWORLD_SMOKE_NOTION=1`.

**CHECKPOINT 6** — you connect Notion and test the Project Manager.

## Phase 7 — Memory
- [ ] `remember` → proposal `{ text, scope: "agent"|"station", sourceRunId }`; Memory screen: *Stored beliefs* / *Awaiting your decision* (approve, edit-then-approve, reject), edit/delete beliefs; `memory.*` events.
- [ ] Prompt assembly injects approved agent + station beliefs, newest first, token-capped. Tests: approved belief appears in the next run's request (asserted on `doStreamCalls`); rejected one never does.

## Phase 8 — Scheduler
- [ ] Schedules in `agent.json` (cron, timezone, prompt, target session defaulting to a per-schedule "Scheduled" session, `catchUp`); croner; `schedule.fired`/`schedule.missed`; catch-up once on startup when enabled (last fire persisted).
- [ ] Scheduled runs obey grants, approval mode, budgets; pending consent raises a notification.
- [ ] SPA schedule editor, next run, history. Tests with fake timers incl. DST boundary and missed-while-down.

## Phase 9 — Station view, notifications, onboarding, seed crew
- [ ] ui map adapted: rooms, crew in rooms, props, hallways (rendered only), live crew state (idle, running, awaiting consent, blocked) from events only.
- [ ] Notifications: filtered event projection, unread state persisted.
- [ ] Onboarding: key → Overseer (name, tone) in Command room with dispatch, read_session, Web, Memory → first chat. Project Manager template (Operations; Notion granted, Web, Memory, Files; daily briefing schedule disabled).
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
- **Node engine:** establish the supported Node line. `.nvmrc` says 22 and `engines` says `>=22`,
  but local development runs Node 24, `react-router` 8 needs `>=22.22`, and `node:sqlite` is only a
  release candidate on 24.15+. Decide the pin, then align `.nvmrc`, `engines`, CI, and ADR-0011.

## Out of scope (stop and ask if any of these appears)
Conveyor Lines / Bays / Inbox / Outbox / Logbook; webhooks, folder watchers, channel triggers;
terminal/shell tools; recursive delegation; helper copies; agents creating/editing agents; desktop
shell; connectors other than Notion; embeddings; session summarization; npm publishing.
