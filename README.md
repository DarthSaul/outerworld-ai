# Outerworld AI

A local-first agent runtime with a space-station interface. You create AI agents (your **crew**),
organize them into **rooms** on a **station**, give them real capabilities (**props** placed in a
room, **connectors** like Notion granted per agent), and watch them work: streamed replies, real
tool calls, real cost. The map is a projection of runtime state, not a simulation.

Everything runs on your machine:

- a Node **daemon** owns agents, model calls, tools, persistence, scheduling, and an append-only
  event log, listening on `127.0.0.1` only;
- a React **SPA** in your browser talks to it with a per-install token.

Model access is bring-your-own-key through **OpenRouter**. There is no Outerworld server. Your
data stays on disk except for the model, connector, and web requests your agents make; see
[docs/PRIVACY.md](docs/PRIVACY.md).

**Product law:** the interface never asserts state the runtime cannot prove.

## What v1 does

- **COMMS**: chat with any crew member; sessions are saved and re-openable.
- **Overseer delegation**: the Overseer dispatches tasks to crew members, workers run
  concurrently, results return to the Overseer's session, all visible live.
- **Agents as documents**: identity, purpose, standing orders, and context as markdown; model,
  approval mode (*Ask first* or *Full power*), and grants as config.
- **Capabilities with consent**: tools not granted are never offered to the model and are rejected
  if called; side-effectful calls wait for your approval under *Ask first*.
- **Notion** over its hosted MCP server; each agent is granted it or not.
- **Schedules** while the daemon runs, **memory** you approve, **notifications**, **spend** and
  **budgets** checked before every model call, and a kill switch.
- **Station map**: rooms, their props and crew, hallways, and the Overseer, with each crew
  member's live state (working, waiting for your approval, stopped) drawn from runtime events.
- **Onboarding**: on a new station, your OpenRouter key, then your Overseer, then a first chat.

The full direction is [docs/specs/BRIEF-station-runtime.md](docs/specs/BRIEF-station-runtime.md).

## Status

**v1 is feature-complete** on the `runtime-pivot` branch, awaiting the owner's sign-off
(CHECKPOINT 10). Every phase in [tasks/todo.md](tasks/todo.md) is done. How each acceptance
criterion in the brief is shown, by test or by manual steps, is in
[docs/specs/v1-acceptance.md](docs/specs/v1-acceptance.md). How it fits together is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the data in [docs/SCHEMA.md](docs/SCHEMA.md).
Known limits and later work are under Follow-ups in `tasks/todo.md` (for example, a run can end a
little over its budget cap, because caps are checked before each model call).

Milestone 1 (a read-only dashboard for Claude Code Routines) is archived: see ADR-0010 and
`tasks/archive/`.

## Quickstart

Requires Node 22 and pnpm 10 (`corepack enable` gives you pnpm).

```
git clone https://github.com/DarthSaul/outerworld-ai.git
cd outerworld-ai
pnpm install
pnpm dev
```

`pnpm dev` starts the daemon on `127.0.0.1:4317` and the SPA on http://localhost:5173, against a
copy of the fictional demo station (`fixtures/demo-station/`, copied to `.outerworld/dev-home/`).
On that copy, replies come from a scripted fake model (no key, no network). To chat for real:

```
OUTERWORLD_MODEL=openrouter pnpm dev   # then Settings → paste your OpenRouter key
```

The key is checked with OpenRouter and stored in your OS keychain, never on disk or in the
browser. `OUTERWORLD_HOME=~/.outerworld pnpm dev` runs your own station directory instead; on a
new directory, onboarding asks for the key, creates your Overseer, and opens a first chat.
`pnpm dev:fresh` walks through the same onboarding on an empty throwaway station with the fake
model.

Other commands:

```
pnpm build        pnpm test        pnpm lint        pnpm typecheck
pnpm check:task   # lint, types, secrets, floor guard, tests
pnpm browser:verify   # after pnpm build: screenshots, console errors, reduced motion, axe (Chromium)
```

## Layout

```
apps/daemon/             Node entry: config, HTTP API, SSE, auth, serves the built SPA
apps/station/            Vite + React SPA
packages/core/           schemas, glossary, event types, pure policy and prompt assembly
packages/runtime/        agent loop, dispatcher, scheduler, tools, MCP, memory, budgets, storage
packages/ui/             React components and design tokens of the station dashboard (ADR-0013)
fixtures/demo-station/   a fictional station directory for dev, tests, and screenshots
docs/                    ARCHITECTURE, SCHEMA, PRIVACY, design assets, ADRs, specs
```

`apps/web` and `packages/generator` (milestone 1) were removed in Phase 1; git history keeps them.

## Roadmap

- **v2**: conveyor lines (inbox, bays, outbox), cross-room handoffs, a consent-gated terminal
  prop, the Overseer editing crew, session compaction.
- **v3**: more MCP connectors, channel and webhook triggers, visual station editing, embeddings
  memory, a desktop shell, npm publishing.
- The on-screen vocabulary (Station, Room, Crew, Hallway, Prop, COMMS) is another product's and
  lives only in core's glossary; revisit it before a public release.

## Contributing

Read [CLAUDE.md](CLAUDE.md) (how the repo works, for humans and agents) and
[CONSTRAINTS.md](CONSTRAINTS.md) (the quality bar CI enforces). Conventional Commits. Everything
here is original work under the MIT license: no borrowed sprites, marks, or franchise names, and
never real data in fixtures.

## License

MIT. See [LICENSE](LICENSE).
