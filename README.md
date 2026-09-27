# Outerworld AI

A dashboard that renders your AI agents, and how they are allowed to work together, as a
space-themed map. Teams of agents live on planets, planets have governed permissions, authorized
handoffs between planets are travel lanes, and one overseer at the center reads everything and
reports outward.

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

Other commands:

```
pnpm build        pnpm test        pnpm lint        pnpm typecheck
pnpm check:task   # what CI runs, minus the browser checks: lint, types, secrets, floor guard, tests
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
- The final space-themed vocabulary (currently workshopped in `docs/design/`; code uses neutral
  names so the rename is one file).
- The 48×64 overseer hero rig and the raster-sprite upgrade path documented in the design spec.
- Connector drift: status files reporting which connectors a run actually had.

## Contributing

Read [CLAUDE.md](CLAUDE.md) (how the repo works, for humans and agents) and
[CONSTRAINTS.md](CONSTRAINTS.md) (the quality bar CI enforces). Conventional Commits. Everything
here is original work under the MIT license: no borrowed sprites, marks, or franchise names, and
never real data in fixtures.

## License

MIT. See [LICENSE](LICENSE).
