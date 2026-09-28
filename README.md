# Outerworld AI

A dashboard that renders your AI agents, and how they are allowed to work together, as a
space-themed map. Teams of agents are stations, stations have governed permissions, authorized
handoffs between stations are drawn as wires, and one overseer at the right edge reads everything
and reports outward.

The agents do not run in this app. They run as **Claude Code Routines**, Anthropic's
cloud-scheduled Claude Code sessions. That means Outerworld AI only works with a Claude Pro or
Max subscription (Routines are a Pro/Max+ feature). We say that plainly because it shapes the
whole design.

## What it does

1. **Configuration editor.** Creating an agent, granting a tool, or authorizing a handoff produces
   files you commit to a separate, private *ledger repo*: `CLAUDE.md`, persona files, skills, one
   routine prompt per team, and a Discord webhook script. A Routine clones that repo and runs the
   prompt. In milestone 1 the editor is the `outerworld generate` CLI plus a hand-edited
   `station.json`; in-browser editing comes later.
2. **State renderer.** It reads the ledger repo (status files, run history) and shows the last
   known state. It never streams live activity and never asserts state it can't prove from files.

Three constraints shape everything:
- A Routine starts with zero context, so the ledger repo must carry everything an agent needs.
- There is no API to create Routines, only a per-routine HTTP trigger. The app generates the
  prompt and guides you to create the Routine at claude.ai/code/routines or with `/schedule`.
- Secrets such as the Discord webhook URL live in the Routine's environment variables, never in
  any repo. See [docs/PRIVACY.md](docs/PRIVACY.md) for the full data map.

## Status

Milestone 1 is in progress: read-only dashboard, generator CLI, demo fixture. See
[docs/specs/SPEC-milestone-1.md](docs/specs/SPEC-milestone-1.md).

## Quickstart

Requires Node 22 and pnpm 10 (`corepack enable` gives you pnpm).

```
git clone https://github.com/DarthSaul/outerworld-ai.git
cd outerworld-ai
pnpm install
pnpm dev                                   # dashboard on http://localhost:3000, rendering the demo fixture
OUTERWORLD_LEDGER_PATH=/path/to/ledger pnpm dev   # render your own local ledger repo instead
```

The production build works the same way: `pnpm build`, then `pnpm start` (or
`OUTERWORLD_LEDGER_PATH=/path/to/ledger pnpm start`). Both routes render on every request, so the
page always reflects the ledger on disk. With a real ledger the dashboard shows the station view
only; the scripted "Run digest" demo exists for the fixture alone.

### Generate a ledger repo

```
pnpm build                                                     # builds the generator CLI to packages/generator/dist
node packages/generator/dist/bin.js generate --station fixtures/demo-station/station.json --out /path/to/ledger
node packages/generator/dist/bin.js validate --station /path/to/ledger/station.json
OUTERWORLD_LEDGER_PATH=/path/to/ledger pnpm dev                # render what you just generated
```

Start from your own `station.json` (the fixture's is the example; `docs/SCHEMA.md` is the
contract). The generated repo is yours to keep private: it carries the prompts your Routines run
and the status files they write back. See `templates/ledger-repo/README.md`.

Other commands:

```
pnpm build        pnpm test        pnpm lint        pnpm typecheck
pnpm check:task   # lint, types, secrets, floor guard, tests
pnpm browser:verify   # after pnpm build: screenshots, console errors, reduced motion, axe (Chromium)
```

## Layout

```
apps/web/                Next.js dashboard
packages/core/           headless schema, glossary, layout math, event model, ledger parsing
packages/ui/             React components, design tokens, the rigged character SVG
packages/generator/      Station → ledger-repo files, plus the CLI
fixtures/demo-station/   a fictional user's Station and ledger; every test and screenshot uses it
templates/ledger-repo/   the skeleton your private ledger repo starts from
docs/                    ARCHITECTURE, SCHEMA, PRIVACY, design assets, ADRs, specs
```

Packages are published under the `@darthsaul` scope and are private for now: clone and run.

## Roadmap

- **npm publishing** of `@darthsaul/outerworld-ai-core`, `-ui`, and `-generator` with Changesets
  and `publishConfig.access: "public"`. Not part of milestone 1.
- In-browser editing: standing orders, personas, and handoffs edited in the detail panel, committed
  to the ledger repo.
- Routine trigger wiring (the per-routine HTTP trigger) so a handoff can wake the reader team.
- Vocabulary: the on-screen words (Station, Tool, Handoff, Agent, Routine run, Overseer, Station
  Report, System Report) live in core's glossary; code keeps neutral names, so any later rename is
  one file. The fixture's overseer name is a placeholder to replace before any public release.
- ~~The 48×64 overseer hero rig~~ shipped 2026-09-27. The raster-sprite upgrade path in the design
  spec remains open.
- Connector drift: status files reporting which connectors a run actually had.
- Optional manual team positions in the Station document (reconciliation A10); layout is derived
  today.
- TypeScript 7 spike once the Go compiler is stable (ADR-0007).
- Verify the dashboard in WebKit and Firefox; `browser:verify` runs Chromium only.
- Enforce ui line coverage and the web first-load JS budget now that both are recorded in
  `CONSTRAINTS.md`.

## Contributing

Read [CLAUDE.md](CLAUDE.md) (how the repo works, for humans and agents) and
[CONSTRAINTS.md](CONSTRAINTS.md) (the quality bar CI enforces). Conventional Commits. Everything
here is original work under the MIT license: no borrowed sprites, marks, or franchise names, and
never real data in fixtures.

## License

MIT. See [LICENSE](LICENSE).
