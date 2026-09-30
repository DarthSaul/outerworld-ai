# ADR-0011: Runtime stack

## Status
Accepted

## Date
2026-09-29

## Context
ADR-0010 introduces a daemon, an SPA, a model loop, an MCP client, a scheduler, SQLite, and
keychain access. The repo already fixes pnpm workspaces, Turborepo, TypeScript strict, Biome,
zod 4, Vitest, and Node 22 (`.nvmrc`). Every choice below was checked against the npm registry,
the package's own type definitions, and its official docs on 2026-09-29, not from memory.

## Decision

| Concern | Choice | Version | Why |
|---------|--------|---------|-----|
| HTTP + SSE | `hono` on `@hono/node-server` | 4.13 / 2.1 | Small, typed, Web-standard `Request`/`Response`; `streamSSE` for the event stream; `app.request()` tests routes without a socket; binds `127.0.0.1` via `serve({ hostname })`. |
| Model SDK | `ai` (Vercel AI SDK) | 7.x | Streaming, tool calling, `abortSignal`, typed usage; provider-agnostic; ships `MockLanguageModelV4` for scripted tests. |
| Provider | `@openrouter/ai-sdk-provider` | 3.1 | Official OpenRouter provider for `ai` 7; reports per-call cost in `providerMetadata.openrouter.usage.cost`. |
| MCP | `@modelcontextprotocol/client` (tests: `@modelcontextprotocol/server`) | 2.2 | Official SDK, v2 packages; Streamable HTTP, OAuth with dynamic client registration, `InMemoryTransport` for a fake server. |
| SQLite | `better-sqlite3` | 13 | Stable and synchronous; v13 ships prebuilt binaries with no install scripts, so pnpm 10 needs no build allowlist. |
| Scheduler | `croner` | 10 | Cron with time zones, `nextRun()`, `previousRuns()` for catch-up; works under Vitest fake timers. |
| Keychain | `@napi-rs/keyring` | 2.1 | Maintained, prebuilt for macOS, Linux, Windows. We pass `{ linux: { store: "secret-service" } }` so a Linux machine without Secret Service fails loudly instead of silently keeping secrets in a non-persistent kernel keyring; env vars are the fallback. |
| SPA | `vite` + `@vitejs/plugin-react` | 8 / 6.1 | Fast dev server with a proxy to the daemon; static build the daemon serves. |
| Data fetching | `@tanstack/react-query` | 5 | Cache invalidated by SSE events. |
| Routing | `react-router` (declarative mode) | 7 | Enough for seven routes. |

Design choices tied to the stack:

- **Our own agent loop.** Each step is one `streamText` call with tools declared *without*
  `execute`; the runtime reads the tool calls and does policy check → consent → execute → append
  → next step. This puts the budget check before every model call and keeps consent inside our
  run state machine, where a pending consent survives an SPA reconnect and becomes `interrupted`
  on restart.
- **Our own retries.** The SDK's `maxRetries` is set to 0. A runtime wrapper retries 408, 409,
  429, and 5xx with exponential backoff, honors `retry-after`, never retries 402 (no credit), and
  emits an event per retry, so retries are visible and testable with fake timers.
- **Token delivery.** The daemon writes `$OUTERWORLD_HOME/daemon.token` (mode 0600) on first
  start. In production it injects the token into the `index.html` it serves; in development a
  small Vite plugin reads the same file. Allowed Origins are the daemon's own origin plus, in
  development only, the Vite origin.
- **Fake model for development.** `OUTERWORLD_MODEL=fake` selects a scripted provider exported
  from `packages/runtime`, so `pnpm dev` on the fixture and `pnpm browser:verify` need no key and
  no network.

## Alternatives considered
- **Fastify or Express.** Rejected: heavier for a localhost API; Hono's `app.request()` makes
  route tests trivial and its SSE helper is built in.
- **`node:sqlite`.** Unflagged since Node 22.13, but still stability 1.1 on Node 22 and prints an
  ExperimentalWarning on every start. Revisit when our pinned Node marks it stable.
- **`keytar`.** Its repository is archived; unmaintained native code.
- **AI SDK `toolApproval` (v7) for consent.** It ends the call and needs a second round-trip with
  approval messages; our loop already owns that pause and needs budget checks between steps.
- **AI SDK multi-step (`stopWhen: isStepCount(n)`) with `execute` on tools.** Rejected: policy,
  consent, and budget checks would have to live inside tool `execute` functions, with no budget
  check before the follow-up model calls.
- **`react-router` 8.** Requires Node >= 22.22; our engines field says >= 22. Revisit if
  `.nvmrc` is tightened.
- **TanStack Router.** Capable but more setup than seven static routes need.
- **WebSockets instead of SSE.** Rejected: commands are plain POSTs; one server-to-client stream
  with `Last-Event-ID` replay is all the UI needs.

## Consequences
- Runtime tests script the model with `MockLanguageModelV4` and the MCP server with
  `InMemoryTransport`; CI makes no network calls.
- AI SDK v7 names (`instructions`, `isStepCount`, `result.stream`) are what the code uses; older
  tutorials use v5/v6 names.
- SSE through the Vite proxy must not be compressed; the daemon sends `Cache-Control: no-cache`
  and a ping every 15 s so a dead connection is noticed.
- Native modules (`better-sqlite3`, `@napi-rs/keyring`) are loaded only by `packages/runtime` and
  `apps/daemon`, never by core or the SPA.
