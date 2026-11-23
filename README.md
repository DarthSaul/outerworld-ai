# Outerworld AI

A local-first agent runtime with a space-station interface. You create AI agents (your **crew**),
organize them into **rooms** on a **station**, give them real capabilities (**props** placed in a
room, **connectors** and **skills** granted per agent), and watch them work: streamed replies, real
tool calls, real cost. The map is a projection of runtime state, not a simulation.

Everything runs on your machine:

- a Node **daemon** owns agents, model calls, tools, persistence, scheduling, and an append-only
  event log, listening on `127.0.0.1` only;
- a React **SPA** in your browser talks to it with a per-install token.

Model access is bring-your-own-key, with an **Anthropic** key, an **OpenRouter** key, or both.
There is no Outerworld server. Your data stays on disk except for the model, connector, and web
requests your agents make; see [docs/PRIVACY.md](docs/PRIVACY.md).

**Product law:** the interface never asserts state the runtime cannot prove.

## What it does

- **Station**: crew, map, and COMMS side by side. The map shows rooms, their props and crew,
  hallways, and the Overseer, with each crew member's live state (working, waiting for your
  approval, stopped) drawn from runtime events. The crew column lists every session on the
  station.
- **COMMS**: chat with any crew member. Sessions are saved and re-openable, and you can hand an
  open conversation to another crew member. A picker above the message box sets the model, the
  key, and the reasoning level for that conversation.
- **Overseer delegation**: the Overseer dispatches tasks to crew members, workers run
  concurrently, and results return to the Overseer's session, all visible live.
- **Crew members as documents**: identity, purpose, standing orders, and context as markdown;
  model, approval mode (*Ask first* or *Full power*), and grants as config. Each crew member's
  page has Brief, Schedules, Memory, and Config tabs.
- **Capabilities with consent**: tools not granted are never offered to the model and are refused
  if called. Under *Ask first*, side-effectful calls wait for your approval.
- **Schedules** while the daemon runs, each with its own model settings if you want them;
  **memory** you approve; **notifications**; **spend** and **budgets** checked before every model
  call; and a kill switch.
- **Onboarding**: on a new station, a model key, then your Overseer, then a first chat.

The full direction is [docs/specs/BRIEF-station-runtime.md](docs/specs/BRIEF-station-runtime.md).

## Model keys: Anthropic and OpenRouter

Add either key, or both, under **System → Settings → Providers** (ADR-0015). Each key is checked
with its provider (a metadata call, no tokens spent) and stored in your OS keychain, never on disk
or in the browser.

- With an **Anthropic** key, Claude models go straight to Anthropic, with Anthropic's own prompt
  caching.
- With an **OpenRouter** key, any listed model runs, Claude included when there is no Anthropic
  key.
- A conversation or schedule can force one key or the other. **Settings → Models** shows where
  each model's calls go with today's keys (ADR-0016).
- OpenRouter reports the cost of each call. Anthropic reports only tokens, so spend for those calls
  is estimated at list price. Budgets count both; the Anthropic Console is the bill.

For development, `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` in the environment work as a
fallback.

## Abilities: connectors and skills

**System → Abilities** is everything crew members can do (ADR-0020). **Discover** offers what you
haven't added yet, **Installed** holds the connector cards, and **Skills** is the skills library.
A connector is installed once for the station; each crew member is granted it or not, on their
Config tab.

- **Notion**: Notion's hosted MCP server, signed in with one click (ADR-0012). See
  [docs/connectors/notion.md](docs/connectors/notion.md).
- **GitHub**: GitHub's hosted MCP server (ADR-0019). GitHub doesn't support dynamic client
  registration, so you register your own OAuth app with GitHub, using the redirect URL the card
  shows, and paste its client ID and secret into the card.
- **Gmail**: the Gmail REST API, run inside the daemon as a built-in connector (ADR-0022). You
  bring your own Google OAuth client; the card walks you through the Google Cloud setup. It asks
  for the `gmail.modify` scope and can search and read threads, list labels, create drafts
  (including replies in a thread), change labels, and move threads to trash. **Nothing sends
  mail**: you send drafts from Gmail. Google's Gmail MCP server is listed as *not yet available*
  while it is in a developer preview.
- **Skills**: a bundled library of 74 tested recipes (Markdown with frontmatter) that crew follow
  instead of improvising (ADR-0023). Turn a skill on station-wide in Abilities, or for one crew
  member on their Config tab. A skill is offered only when the crew member has the tools it
  needs; recipes that need a shell, media, or a browser show in the catalog but are never offered
  in this version. Crew see an index in their prompt and read a recipe with `skill_view`.

OAuth clients and tokens live in the OS keychain. Tool calls a connector marks read-only run
without asking; everything else counts as a write and asks under *Ask first*.

## The System menu

The **System** button (the gear in the footer) opens a menu with two screens, each a side menu of
sections (ADR-0020):

- **Settings** (`/system/settings`): Providers (model keys), Models (run mode and routing),
  Budgets, and Appearance (display size).
- **Abilities** (`/system/abilities`): Discover, Installed, and Skills.

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
OUTERWORLD_MODEL=live pnpm dev   # then System → Settings → Providers → paste an Anthropic or OpenRouter key
```

`OUTERWORLD_HOME=~/.outerworld pnpm dev` runs your own station directory instead, with live
models by default; on a new directory, onboarding asks for a key, creates your Overseer, and opens
a first chat. `pnpm dev:fresh` walks through the same onboarding on an empty throwaway station
with the fake model.

Other commands:

```
pnpm build        pnpm test        pnpm lint        pnpm typecheck
pnpm check:task   # lint, types, secrets, floor guard, tests
pnpm check:full   # check:task + build, as CI runs it
pnpm browser:verify   # Playwright screenshots, console errors, reduced motion, axe; CI runs it on every PR
```

## Layout

```
apps/daemon/             Node entry: config, HTTP API, SSE, auth, serves the built SPA
apps/station/            Vite + React SPA
packages/core/           schemas, glossary, event types, pure policy and prompt assembly
packages/runtime/        agent loop, dispatcher, scheduler, tools, MCP, Gmail, skills, memory,
                         budgets, storage
packages/ui/             React components and design tokens of the station dashboard (ADR-0013)
fixtures/demo-station/   a fictional station directory for dev, tests, and screenshots
docs/                    ARCHITECTURE, SCHEMA, PRIVACY, connectors, design, ADRs, specs
```

How it fits together is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the data in
[docs/SCHEMA.md](docs/SCHEMA.md), and each decision in [docs/decisions/](docs/decisions/).
Milestone 1 (a read-only dashboard for Claude Code Routines) is archived: see ADR-0010.

## Contributing

Read [CLAUDE.md](CLAUDE.md) (how the repo works, for humans and agents) and
[CONSTRAINTS.md](CONSTRAINTS.md) (the quality bar CI enforces). Conventional Commits. Everything
here is original work under the MIT license: no borrowed sprites, marks, or franchise names, and
never real data in fixtures. The bundled skills library is ported from StarNet's (MIT); see
`packages/runtime/skills/LICENSE` and `NOTICE.md` beside it.

## License

MIT. See [LICENSE](LICENSE).
