# Spec: Outerworld AI — Milestone 1

Status: approved 2026-09-27 (open questions resolved below). Design reconciliation applied 2026-09-27: `docs/specs/design-reconciliation.md`. Intent: `docs/intent/milestone-1.md`. Quality bar: `CONSTRAINTS.md`.

## Objective

Ship a read-only dashboard that renders a Station (teams, agents, grants, handoffs, overseer) as a
space-themed map with last-known state from a ledger repo, plus a generator CLI that turns a
Station document into the ledger repo a Claude Code Routine runs from. Everything is verified
against a fictional demo fixture. The owner then runs one manual live smoke test with a real
Routine; that test does not gate the milestone.

Done means: CI green on typecheck, Biome, Vitest with coverage thresholds, axe, gitleaks, and the
floor guard; the fixture renders in both themes down to one column; `outerworld generate` emits a
ledger repo whose files match committed snapshots; `docs/SCHEMA.md` documents that layout.

## Capability map

| Module id  | Responsibility | Depends on |
|------------|----------------|------------|
| `repo`     | Monorepo scaffold, tooling, CI, CONSTRAINTS enforcement, docs skeleton, ADRs | — |
| `core`     | Station + StationState zod schemas, JSON Schema export, glossary, event model, layout + handoff geometry, rig derivation, ledger parsing | repo |
| `ui`       | Tokens + Tailwind integration, Character rig, StationMap and panels, demo timeline, `/dev` gallery | core |
| `web`      | Next.js app: renders fixture or a local ledger path, theme toggle, responsive layout | core, ui |
| `generator`| Station → ledger-repo files, CLI, `docs/SCHEMA.md` | core |
| `fixture`  | `fixtures/demo-station/` Station + fake ledger; `templates/ledger-repo/` skeleton | core (schema) |

Build order: `repo` → `core` → `fixture` → `ui` → `web` → `generator` → close.
`fixture` is created during the `core` step (the schema tests need it) and extended by later steps.
`generator` depends only on `core`, so it could run in parallel with `ui`; the brief orders it last
and we follow that.

## Tech stack

- Node 22 (`.nvmrc`, `engines`), pnpm 10 workspaces, Turborepo, TypeScript strict, ESM only.
- `apps/web`: React 19, Next.js App Router (latest stable at scaffold time, version recorded in ADR).
- Tailwind: **v4** (decided). Tokens are CSS custom properties in `packages/ui`;
  Tailwind consumes them via `@theme`. Components use utilities or `var(--ow-*)`, never literals.
- zod for schemas, `zod-to-json-schema` (or zod v4's native `z.toJSONSchema`) for JSON Schema export.
- Vitest, React Testing Library, `vitest-axe`, `@axe-core/cli` (CI only).
- Biome for lint and format. Conventional Commits. gitleaks in CI.
- MIT license. No third-party art.

## Commands

```
pnpm install
pnpm dev                 # turbo dev → apps/web on http://localhost:3000
pnpm build               # turbo build
pnpm test                # turbo test → vitest run in every package (coverage thresholds in core, generator)
pnpm lint                # biome check .
pnpm typecheck           # turbo typecheck → tsc --noEmit per package
pnpm check:fast          # biome check . && tsc on touched packages (< 5 s)
pnpm check:task          # check:fast + gitleaks (if installed) + node scripts/floor-guard.mjs + pnpm test (< 90 s)
pnpm check:full          # check:task + pnpm build + axe against served apps/web (CI)
pnpm --filter @darthsaul/outerworld-ai-generator exec outerworld generate --station fixtures/demo-station/station.json --out /tmp/ledger
```

## Project structure

```
apps/web/                  Next.js dashboard
packages/core/src/         schema/, glossary.ts, events.ts, layout.ts, rig.ts, ledger/ ; tests alongside as *.test.ts
packages/ui/src/           tokens/ (CSS + TS), components/, character/, timeline/ ; *.test.tsx alongside
packages/generator/src/    emit/ (one module per emitted file kind), cli.ts ; snapshots in __snapshots__/
fixtures/demo-station/     station.json + ledger/ (status, runs, handoffs)
templates/ledger-repo/     skeleton with README, .gitignore, empty status/
docs/                      ARCHITECTURE.md, SCHEMA.md, PRIVACY.md, decisions/NNNN-*.md, specs/, intent/
scripts/                   floor-guard.mjs and other repo-level check scripts
tasks/                     plan.md + todo.md per step (created by /plan)
```

## Code style

```ts
// packages/core/src/schema/station.ts
import { z } from "zod";

export const GrantMode = z.enum(["read", "write"]);

export const Grant = z
  .object({
    id: z.string().min(1),
    teamId: z.string().min(1),
    tool: z.string().min(1),
    mode: GrantMode,
  })
  .passthrough(); // unknown fields tolerated by contract

export type Grant = z.infer<typeof Grant>;
```

- Neutral vocabulary only in code (`team`, `grant`, `handoff`, `agent`, `overseer`, `station`).
  Display strings come from `glossary.ts`.
- Schema objects are `PascalCase` consts with a same-named exported type. Ids are opaque strings.
- Pure functions, no classes unless a library demands one. No default exports except Next.js pages.
- Components: one per file, props typed with an exported `XProps` interface, data-driven state via
  `data-state="idle|working|done|failed"` attributes that CSS keys off.
- Biome defaults: double quotes, semicolons, 2-space indent, 100-column width.

## Testing strategy

- **core, generator:** Vitest unit tests beside source. Coverage thresholds lines 90 / branches 85
  in each package's `vitest.config.ts`. Fixture validation is a test. JSON Schema export is a test
  that compares to the committed `schema/*.json`. Generator uses `toMatchFileSnapshot` against the
  fixture so the emitted ledger is reviewable in diffs.
- **ui:** RTL component tests for state logic (rig state classes, panel selection, timeline
  reducer) plus `vitest-axe` on every rendered component. Token resolution tested by reading the
  computed CSS variable map. No coverage number this milestone.
- **web:** Smoke test that the page renders the fixture. axe CLI in CI against `/` and `/dev` in
  both themes. Browser verification via Chrome DevTools before each ui/web step is called done.
- **Floor:** `scripts/floor-guard.mjs` on every task end and in CI.

## Boundaries

- **Always:** run `pnpm check:task` before a commit; use the fixture for every example; keep
  package READMEs in sync with exports; write an ADR for a decision that changes an interface.
- **Ask first:** adding a runtime dependency to `core` (goal: zod only); changing CI; changing a
  CONSTRAINTS.md number; adding a new top-level package; any network call from the app.
- **Never:** commit secrets or real data; hardcode a token; put React or `node:fs` in `core`;
  put Routine or GitHub knowledge in `ui`; put rendering in `generator`; invent a Routines fact.

## Module specs

### `repo`
- pnpm workspace with `apps/*`, `packages/*`; Turborepo pipeline for `build`, `test`, `lint`,
  `typecheck`, `dev`; shared `tsconfig.base.json`; `biome.json`; `.nvmrc`; `.gitignore` adds
  `.outerworld/`; MIT `LICENSE`; README with roadmap (npm publishing via Changesets listed);
  `docs/PRIVACY.md`, `docs/ARCHITECTURE.md` stub; `docs/decisions/` with ADRs 0001–0005 for the
  brief's decisions; GitHub Actions workflow running `pnpm check:full` on push and PR.
- Success: `pnpm install && pnpm check:task` passes on the empty scaffold; CI workflow is valid.

### `core`
- Public API (designed with `api-and-interface-design` before implementation):
  - `Station`, `StationState` zod schemas and types, `schemaVersion` on both, `.passthrough()`
    everywhere, `parseStation()`, `parseStationState()` returning a typed result, never throwing.
  - `stationJsonSchema`, `stationStateJsonSchema` exports and committed JSON files.
  - `glossary`: `term(key) → display string`, one object, the only place themed words appear.
  - Event model: `StationEvent` discriminated union (run started / progressed / finished / failed,
    handoff written, digest posted) and `applyEvent(state, event) → state`.
  - Layout: `layoutStation(station) → positioned nodes` (radial for ≤ 8 teams, two rings for
    9–16, list above; overseer at center; deterministic) and `handoffGeometry(from, to, options)
    → { path, midpoint, angle, chevronAt }` in an abstract unit square, with paired handoffs
    offset so each half is hit-testable.
  - Rig derivation: `deriveRig(agent, team, handoffs) → { shoulder, accessory }` (pauldron when
    any write grant; antenna / thruster / plate / none from inbound handoffs and repo access).
  - Ledger parsing: `parseLedger(files: Record<path, string>) → StationState` taking an in-memory
    file map so `core` never touches the filesystem; unknown or malformed files degrade to
    `health: "warn"` with a reason, never to a throw.
- Success: fixture validates; JSON Schema matches committed; coverage 90/85; ADR for schema
  versioning written. Schema details from the design reconciliation (B1–B12) are settled in the
  api-and-interface-design pass and recorded in `docs/SCHEMA.md`.

### `fixture`
- One fictional person, three project agents on two or three teams, one overseer, at least two
  grants per team, at least two handoffs, one failed run and one stalled agent so every visual
  state appears. Obviously fake webhook URL placeholder in docs only, never in files.
- `templates/ledger-repo/` is the empty skeleton the generator fills.

### `ui`
- Tokens: `tokens.css` defining `--ow-color-*`, `--ow-radius-*`, `--ow-space-*`, `--ow-motion-*`,
  light by default, dark under both guards from CLAUDE.md; `tailwind.css` mapping them into
  Tailwind's theme; `tokens.ts` exporting the names for tests.
- `Character`: one quantized-vector SVG rig on a 24×32 unit grid (two body poses, three heads,
  two shoulders, six chest traces, accessory slot), integer scales only. Recolored by setting
  `--ow-rig-tint-hue` and `--ow-rig-trim-hue`; everything else derives from tokens. States via
  `data-state`: idle (bob, visor blink), working (glow, breathe, arms alternate, head nod), done
  (pop, check glyph), failed (dim to 60%, failed glow, exclaim glyph). `OverseerCharacter` is a
  separate 48×64 hero symbol, achromatic, same state contract, shown only in `OverseerCore`.
  `prefers-reduced-motion` collapses every animation to a 120 ms opacity change; states stay
  legible by pose, glow, and glyph.
- `TeamEmblem`: 16×16 quantized disc from `team.emblem.hue` plus a mission mark.
- `StationMap` (SVG + HTML overlay), `TeamPanel`, `AgentCard`, `GrantChip`, `HandoffLayer`,
  `Packet`, `OverseerCore`, `DetailPanel` (Report tab only: `ProofLine`, `LedgerView`,
  `RunTimeline`), `EmptyState`, `Toast`. Clicking a team, agent, grant, or handoff selects it.
- Demo: `runDigestTimeline` is a scripted array of `{ atMs, event }` consumed by a small
  `useTimeline` hook that feeds `applyEvent`; a "Run digest" button plays it.
- `/dev` gallery (in `apps/web`) shows every component in both themes and every rig state.
- Success: RTL + axe tests pass; browser-verified animations, reduced motion, both themes,
  one-column layout.

### `web`
- Reads `OUTERWORLD_LEDGER_PATH`; if set, loads `station.json` and `ledger/` from it via a server
  component and `parseLedger`; otherwise loads the fixture. Never fetches over the network.
- Theme toggle writing `data-theme` on `<html>`, persisted in `localStorage`, defaulting to system.
- Layout: map + detail panel side by side, collapsing to one column under a token-defined breakpoint.
- Success: fixture renders; ledger path renders; axe clean on `/` and `/dev`; browser-verified.

### `generator`
- CLI: `outerworld generate --station <path> --out <dir> [--dry-run]`; prints the file list.
- Emits into `<out>`: `CLAUDE.md` (includes the handoff table: which team may read which
  ledger), `station.json` (copy), `agents/<agentId>.md`, `skills/<skillId>/SKILL.md`,
  `routines/<teamId>.prompt.md` (one Routine per team, orchestrating that team's agents; header:
  connector checklist and how to create the Routine at claude.ai/code/routines or with
  `/schedule`), `routines/overseer.prompt.md`, `ledger/<teamId>.md` (the team's ledger with the
  required section headings), `scripts/post-digest.sh` (posts `status/digest.md` to
  `$DISCORD_WEBHOOK_URL`, fails loudly if unset), `status/README.md` describing the JSON status
  schema, `status/teams/.gitkeep`, `status/runs/.gitkeep`.
- Pure `emitLedger(station) → Array<{ path, contents }>`; the CLI is the only place `node:fs` appears.
- Success: snapshot tests against the fixture; `docs/SCHEMA.md` documents every emitted path.

## Success criteria (milestone)

1. `pnpm check:full` green locally and in GitHub Actions on the `init` branch.
2. `fixtures/demo-station/station.json` validates; `packages/core/schema/*.json` committed and matching.
3. `pnpm dev` renders the fixture map with all four rig states visible, in light and dark, at
   375 px and 1280 px widths, with reduced motion honored.
4. `OUTERWORLD_LEDGER_PATH=<generated dir> pnpm dev` renders a generator-emitted ledger without error.
5. Generator snapshots committed; `docs/SCHEMA.md` and `docs/PRIVACY.md` current.
6. ADRs exist for: monorepo, neutral vocabulary, CSS-variable tokens under Tailwind, Routines as
   runtime, clone-and-run distribution, schema versioning, and Tailwind version choice.
7. CLAUDE.md and README roadmap match what shipped.

## Assumptions I'm making

1. `station.json` lives at the root of the ledger repo, so one path serves both config and state.
   The generator copies it there. (Alternative: keep it only in `.outerworld/` locally.)
2. Ledger status is JSON: `status/teams/<teamId>.json` for the latest state (including per-agent
   state within the team's run) and `status/runs/<teamId>/<ISO timestamp>.json` per run. Routines
   are told to write these in the prompt. Exact field list is designed in the core step after
   checking the Routines docs.
3. Each team owns one Markdown ledger, `ledger/<teamId>.md`. A handoff is the authorization for a
   reader team to read a writer team's ledger, with direction; it is not its own file. The
   dashboard renders the ledger and a since-last-run diff summary.
4. Layout is derived by `layoutStation`; the Station document carries no positions in this
   milestone.
5. Next.js latest stable and Tailwind v4 at scaffold time, versions pinned and recorded in an ADR.

## Resolved questions (2026-09-27)

1. **Tailwind v4.** The "preset" is a CSS file exported by `packages/ui` that the app imports;
   tokens are CSS custom properties consumed through `@theme`. Recorded in an ADR.
2. **Digest body.** The overseer Routine writes `status/digest.md`; `scripts/post-digest.sh` posts
   that file's contents to `$DISCORD_WEBHOOK_URL`. The script composes nothing itself.
3. **Trigger URL.** Not stored anywhere this milestone. Trigger wiring is a later milestone.
