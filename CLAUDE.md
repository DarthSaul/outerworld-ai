# Outerworld AI — agent guide

Read this before touching anything. Keep it under 200 lines; update it when a decision changes.

## What this is

A dashboard that renders a person's AI agents and how they are allowed to work together as a
space-themed map. Teams of agents live on planets, planets have governed permissions, authorized
handoffs are travel lanes, and one overseer at the center reads everything and reports outward.

The agents do **not** run here. They run as Claude Code Routines (Anthropic's cloud-scheduled
Claude Code sessions, Pro/Max+ subscription required). This app has exactly two jobs:

1. **Configuration editor** — editing a Station produces files the user commits to a separate,
   private *ledger repo*: `CLAUDE.md`, persona files, skills, routine prompts, a Discord webhook
   script. A Routine clones that repo and runs the prompt.
2. **State renderer** — reads the ledger repo (status files, run history) and shows the last known
   state. Never streams live activity. Never asserts state it cannot prove from ledger files.

Hard constraints from the brief:
- A Routine starts with zero context, so the ledger repo must carry everything an agent needs.
- There is no API to create Routines (only a per-routine HTTP trigger). We generate the prompt and
  guide the user to create it at claude.ai/code/routines or with `/schedule`.
- Secrets (e.g. the Discord webhook URL) live in the routine's environment variables. Never in any repo.
- Don't invent facts about Routines. If a detail matters, check the Claude Code docs or ask.

## Vocabulary rule

Final space-themed names are being workshopped elsewhere. **Code uses neutral names only.**
Display strings live in one glossary module in `packages/core` so a rename is a one-file change.
Never put a themed word (planet, lane, orbit, station-as-brand, etc.) in an identifier, filename,
schema key, or test name.

| Code term  | Meaning |
|------------|---------|
| `team`     | agents sharing one permission scope (connectors + repo scope) and one mission |
| `grant`    | a tool/skill a team may use; `mode: 'read' \| 'write'` |
| `handoff`  | an authorized lane between two teams: one ledger file, one writer team, one reader team |
| `agent`    | a worker with a persona (name, mandate, tone, tool allowlist) and a visual identity; exactly one team |
| `overseer` | the privileged agent that reads all ledgers and is the only one allowed to post outward |
| `station`  | the whole map (temporary name for the document root) |

## Stack

- pnpm workspaces + Turborepo. TypeScript strict everywhere. Node 22. ESM only.
- App: React 19 + Next.js App Router. Tailwind for utilities.
- Schema: zod, with JSON Schema exported from it. Versioned; unknown fields tolerated.
- Tests: Vitest; React Testing Library for components.
- Lint/format: Biome. Conventional commits.
- Motion: state-driven CSS (keyframes on SVG groups). `prefers-reduced-motion` respected everywhere.
  No animation library.
- Themes: light and dark via CSS variables. Dark is defined under `prefers-color-scheme: dark`
  guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.
- Distribution: clone-and-run. Packages are `@darthsaul/*`, `"private": true`. npm publishing is a
  README roadmap item, not this milestone.
- License MIT. Everything original: no borrowed sprites, marks, or franchise names.

## Layout

```
apps/web/               Next.js dashboard; consumes ui via workspace:*
packages/core/          @darthsaul/outerworld-ai-core — headless. zod schema for Station +
                        StationState, glossary, layout math (lane geometry), event model,
                        ledger parsing. Zero React, zero DOM, zero filesystem.
packages/ui/            @darthsaul/outerworld-ai-ui — React components + the rigged Character
                        SVG. Tokens as CSS variables + a Tailwind preset.
packages/generator/     @darthsaul/outerworld-ai-generator — Station → ledger-repo files.
                        Pure functions + a small CLI. Knows nothing about rendering.
fixtures/demo-station/  fictional Station + fake ledger. All tests/screenshots use this.
templates/ledger-repo/  skeleton a user's private ledger repo starts from.
docs/                   ARCHITECTURE.md, SCHEMA.md, PRIVACY.md, decisions/ (ADRs)
```

Boundary rule when unsure where something goes: **core** knows nothing about React or files;
**ui** knows nothing about Routines or GitHub; **generator** knows nothing about rendering.
The schema in core is the product's real API. generator and ui both key off it.

## Never hardcode tokens

Every color, radius, spacing step, and motion duration is a CSS custom property defined in the
`ui` tokens and consumed by Tailwind via theme extension. Components never contain a hex, an
`rgb()`, a pixel radius, or a `ms` value. Per-agent recoloring goes through the palette contract: the persona sets only
`rig: { tintHue, trimHue, head, trace }`; chrome, trim, emblem shade and glow are derived in the
token CSS; glow is owned by run state; shoulder and accessory are derived from grants and
handoffs in core. The overseer has its own 48×64 hero rig, achromatic, in the map's center core.

## Design source of truth

`docs/design/` holds the design spec, UI mock, naming workshop, and rig studies. Read
`docs/design/README.md` before any ui work. Tokens in `packages/ui/src/tokens/` are a translation
of `docs/design/outerworld-spec.dc.html`; change the spec first, then the tokens. Reference
renders under `docs/design/assets/`, `reference/`, and `studies/` are generated art and are never
shipped or traced into a shipped asset. `rig/rig-parts-v0.svg` is the proportion target for the
hand-drawn rig.

## Fixtures only, never real data

Every screenshot, test, story, and example uses `fixtures/demo-station/`, a fictional user.
Never commit a real Station, real ledger output, real usernames, real repo names, or real webhook
URLs. If you need a new shape of data, extend the fixture.

## Privacy rules

- The user's Station and ledger live in **their** private repo, never in this one.
- The local workspace directory `.outerworld/` is gitignored. Never un-ignore it.
- The app reads a ledger from a local path given by env var, or falls back to the fixture.
  It makes no network calls to fetch state.
- Secrets never enter generated files. `scripts/post-digest.sh` reads `$DISCORD_WEBHOOK_URL`
  from the environment; the generator must not accept a webhook value as input.
- `docs/PRIVACY.md` is the data map: what lives where, what leaves the machine. Keep it current.
- gitleaks runs in CI. Don't add allowlist entries to get green.

## Run and test

```
pnpm install
pnpm dev            # apps/web on http://localhost:3000 (pass -- -p 3210 for another port)
pnpm build          # turbo build across packages
pnpm test           # vitest across packages; coverage thresholds enforced in core and generator
pnpm lint           # biome check .   (pnpm lint:fix to apply)
pnpm typecheck      # tsc --noEmit across packages
pnpm check:task     # what to run before a commit: lint, types, secrets, floor guard, tests (< 90 s)
pnpm check:full     # check:task + build; what CI runs
OUTERWORLD_LEDGER_PATH=/path/to/ledger pnpm dev   # render a real local ledger (lands in the web step)
```

Use Node 22 (`nvm use` reads `.nvmrc`). Packages build with `tsc` to `dist/`; dependents
typecheck against `dist/`, so run `pnpm build` once after pulling changes to a package.

Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass. It says
where each check runs in the pipeline. Don't silence a check, skip a test, or lower a threshold
to get green. If a gate is wrong for this project, say
so and propose a change to CONSTRAINTS.md.

## Working agreements

- Skills (Addy Osmani's agent-skills pack) are workflows, not reading. Lifecycle:
  /spec → /plan → /build → /test → review → ship. Pass every verification gate.
- Plan each step, show the plan, build only after confirmation. Stop for review after each
  milestone step.
- Small, reviewable commits with Conventional Commits messages (`feat(core): ...`,
  `chore(repo): ...`, `docs(adr): ...`). Don't push unless asked.
- Every package has a README documenting its public API.
- Record decisions in `docs/decisions/` as ADRs. Update this file when they change.
- TDD for logic: schema validation, geometry, ledger parsing, token resolution, component state,
  generator output (snapshot tests against the fixture).
- Next.js ships version-matched docs at `apps/web/node_modules/next/dist/docs/`. Read the relevant
  guide there before writing app code; Next 16 differs from older conventions.
- Browser-verify ui and web work in a real browser (animations, reduced motion, both themes,
  single-column layout) before calling a step done.
