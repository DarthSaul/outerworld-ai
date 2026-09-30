# Outerworld AI — agent guide

Read this before touching anything. Keep it under 200 lines; update it when a decision changes.

## What this is

A local-first agent runtime with a space-station interface. The source of truth for direction is
`docs/specs/BRIEF-station-runtime.md` (the brief); if this file and the brief disagree, the brief
wins and this file gets fixed. The plan and progress are in `tasks/todo.md`.

- A Node **daemon** (`apps/daemon`) owns agents, model calls (OpenRouter, bring your own key),
  tools, MCP connectors, persistence, scheduling, and an append-only event log. It binds
  `127.0.0.1` only; every request needs the per-install bearer token and an allowed `Origin`.
- A React **SPA** (`apps/station`) renders the station and COMMS from runtime state over one SSE
  stream plus plain POST commands.
- Station and agent config are files in `$OUTERWORLD_HOME` (default `~/.outerworld/`); sessions,
  runs, events, memory, and spend are in SQLite beside them; secrets are in the OS keychain.

**Product law:** the interface never asserts state the runtime cannot prove. The map is a
projection of events, never a simulation.

Milestone 1 (a read-only dashboard for Claude Code Routines) is archived (ADR-0010). Its map model
stays in core and ui until Phase 9 adapts the map (D14); its fixture is `fixtures/map-demo/`.

## Vocabulary rule

On-screen words come from the brief §4 and live only in `packages/core/src/glossary.ts`, so a
rename is a one-file change. **Code uses neutral identifiers**: identifiers, filenames, schema
keys, event types, CSS custom properties, and test names.

| On screen | Code identifier | Meaning |
|-----------|-----------------|---------|
| Station | `station` | the whole system: rooms, crew, props, hallways, runtime |
| Commander | `user` | the person using it |
| Room | `room` | a capability-scoped team; props placed in it grant tools to its crew |
| Crew / crew member | `agent` | an agent; exactly one room |
| Overseer | `role: "overseer"` | the crew member with dispatch rights (a role, not "the first agent") |
| Hallway | `lane` | an authorized handoff lane between rooms (rendered in v1, enforced in v2) |
| Prop | `grant` (kind `prop`) | a capability placed in a room: `web`, `files`, `memory` |
| Connector | `connector` | an MCP server installed station-wide; each agent is granted it or not |
| COMMS | `comms` | the chat surface |
| Session / Run / Dispatch | `session` / `run` / `dispatch` | a conversation / one bounded execution / the Overseer handing a task to crew |
| Ask first / Full power | `approvalMode: "ask" \| "full"` | consent for `write`-class tool calls |
| Stored beliefs / Awaiting your decision | `memory` (`status`) | approved memories / proposals |

The floor guard fails a diff that puts other themed words (planet, orbit, outpost, relay…) in
code outside the glossary and docs.

## Layout

```
apps/daemon/       thin Node entry: config, Hono HTTP API + SSE, auth, serves the built SPA
apps/station/      thin Vite + React SPA: routes, data fetching, SSE client, screens
packages/core/     @darthsaul/outerworld-ai-core — zod schemas (station.json, agent.json, events),
                   glossary, pure policy (grant resolution, dispatch reach, depth, budgets),
                   prompt assembly, run state transitions, layout math. No IO, no React.
packages/runtime/  @darthsaul/outerworld-ai-runtime — agent loop, dispatcher, scheduler, tools,
                   MCP client, memory, budgets, storage (files, SQLite, keychain).
packages/ui/       @darthsaul/outerworld-ai-ui — React components, tokens, the rigged character,
                   the station map. Knows core, never runtime.
fixtures/demo-station/  a fictional $OUTERWORLD_HOME. All tests, dev runs, screenshots use it.
fixtures/map-demo/      the milestone 1 map fixture, for the ui map and /dev gallery until Phase 9.
docs/              ARCHITECTURE.md, SCHEMA.md, PRIVACY.md, decisions/ (ADRs), specs/, design/
```

Boundary rules:
- **Runtime logic lives in `packages/runtime`, never in `apps/*`**, so it can move into a desktop
  shell later. The apps wire things together and nothing more.
- **Pure, deterministic logic goes in `packages/core`** with thorough unit tests: schemas, grant
  resolution, dispatch reach and depth, budget math, prompt assembly, state transitions.
- **ui** knows nothing about the runtime, HTTP, or OpenRouter; it renders core types.
- Native modules (`better-sqlite3`, `@napi-rs/keyring`) load only in runtime and daemon.

## Stack (ADR-0011)

pnpm workspaces + Turborepo, TypeScript strict, Node 22 (`.nvmrc`), ESM only, zod 4, Vitest,
Biome, Conventional Commits. Daemon: Hono on `@hono/node-server`, Vercel AI SDK v7 (`ai`) with
`@openrouter/ai-sdk-provider`, `@modelcontextprotocol/client` v2, `better-sqlite3`, `croner`,
`@napi-rs/keyring`. SPA: Vite 8, React 19, TanStack Query 5, react-router 7, Tailwind v4.
**Verify a library's current API in its docs or types before using it**; AI SDK v7 renamed a lot
(`instructions`, `isStepCount`, `result.stream`).

The agent loop is ours: one `streamText` call per step, tools declared without `execute`, and the
runtime does policy check → consent → execute → next step, with a budget check before every model
call and our own retry/backoff (ADR-0011).

## Security and secrets

- Secrets (OpenRouter key, connector tokens) live in the OS keychain; `OPENROUTER_API_KEY` env is
  a dev fallback. **Never log, persist to the station directory or SQLite, emit in an event, or
  send to the SPA any secret.** The API reports only whether a key is configured.
- Tools not granted are never sent to the model and are rejected at execution (double
  enforcement). Our read/write classification is authoritative; unknown tools are `write`.
- Files tools are confined to `workspaces/<agentId>/` (realpath check, no traversal, no symlink
  escape). No shell tool in v1. `web_fetch` refuses loopback and private addresses.
- *Ask first* is the default; *Full power* is visibly marked. Consent never times out into
  approval. Tool results are untrusted data; the policy layer, not the prompt, enforces.
- `docs/PRIVACY.md` is the data map: what lives where, what leaves the machine. Keep it current.
- gitleaks runs in CI. Don't add allowlist entries to get green.

## Fixtures only, never real data

Every test, dev run, screenshot, and gallery cell uses `fixtures/demo-station/`, a fictional
station. Never commit real names, API keys, tokens, Notion IDs, URLs, or session data. If you need
a new shape of data, extend the fixture. `pnpm dev` works on a copy under `.outerworld/` so the
fixture is never mutated. `.outerworld/` is gitignored; never un-ignore it.

## No network in tests or CI

Tests use a scripted fake model (`MockLanguageModelV4` from `ai/test`, or the runtime's fake
provider) and a fake MCP server (`InMemoryTransport`). Real OpenRouter and Notion calls happen
only in manually run smoke tests gated by environment variables.

## Never hardcode tokens

Every color, radius, spacing step, and motion duration is a CSS custom property in the `ui`
tokens, consumed by Tailwind via theme extension (ADR-0003). Components in `packages/ui` and
`apps/*` never contain a hex, `rgb()`, a pixel radius, or an `ms` literal. Per-agent recoloring
goes through the palette contract: the agent sets only `rig: { tintHue, trimHue, head, trace }`;
chrome, trim, emblem shade and glow are derived in token CSS; glow is owned by run state. Motion is
state-driven CSS with `prefers-reduced-motion` respected; no animation library. Light and dark
themes via CSS variables (dark under `prefers-color-scheme: dark` guarded by
`:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`).

## Design source of truth

`docs/design/` holds the design spec, UI mock, naming workshop, and rig studies. Read
`docs/design/README.md` before any ui work. Tokens in `packages/ui/src/tokens/` translate
`docs/design/outerworld-spec.dc.html`; change the spec first, then the tokens. Reference renders
under `docs/design/assets/`, `reference/`, and `studies/` are generated art and are never shipped
or traced. `rig/rig-parts-v0.svg` is the proportion target for the hand-drawn rig.

## Run and test

```
pnpm install
pnpm dev            # daemon + Vite (http://localhost:5173) on .outerworld/dev-home, a copy of the fixture
OUTERWORLD_HOME=~/.outerworld pnpm dev   # a real station directory
pnpm build          # turbo build across packages
pnpm test           # vitest across packages; coverage thresholds in core and runtime
pnpm lint           # biome check .   (pnpm lint:fix to apply)
pnpm typecheck      # tsc --noEmit across packages
pnpm check:task     # before every commit: lint, types, secrets, floor guard, tests (< 90 s)
pnpm check:full     # check:task + build; what CI's quality job runs
pnpm browser:verify # Playwright: screenshots, console errors, reduced motion, axe; CI's browser job
```

Use Node 22 (`nvm use`). Packages build with `tsc` to `dist/`; dependents typecheck against
`dist/`, so run `pnpm build` once after pulling changes to a package (`pnpm dev` builds and
watches them for you).

Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass; it says where
each check runs. Don't silence a check, skip a test, or lower a threshold to get green. If a gate
is wrong for this project, say so and propose a change to CONSTRAINTS.md.

## Working agreements

- Follow `tasks/todo.md` phase by phase. Stop at each CHECKPOINT with: what was built, how to try
  it (exact commands), tests added, decisions made, open questions.
- Out of scope for v1 (brief §3): conveyor lines, inbox/outbox, webhooks, watchers, shell tools,
  recursive delegation, helper copies, agents editing agents, desktop shell, non-Notion
  connectors, embeddings, summarization, npm publishing. If you find yourself building one, stop
  and ask.
- A decision the brief doesn't cover: make the smallest reasonable choice, record it in an ADR
  (`docs/decisions/`) or the `tasks/todo.md` decisions list, and flag it at the next checkpoint.
- Small commits, one logical change each, Conventional Commits (`feat(runtime): ...`,
  `docs(adr): ...`). `pnpm check:task` green before every commit. Don't push unless asked.
- TDD for logic: schemas, policy, prompt assembly, state machine, storage, the agent loop with
  the fake provider.
- Every package has a README documenting its public API.
- Browser-verify ui and SPA work in a real browser (both themes, reduced motion, narrow layout)
  before calling a step done: headless Playwright under `scripts/browser/`.
