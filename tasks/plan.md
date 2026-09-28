# Implementation Plan: Milestone 1, Step 2 — Scaffold

Spec: `docs/specs/SPEC-milestone-1.md` (module `repo`). Bar: `CONSTRAINTS.md`.

## Overview

Stand up the pnpm + Turborepo monorepo with empty-but-real packages, the shared tooling
(TypeScript, Biome, Vitest), the repo docs (README with roadmap, PRIVACY, ARCHITECTURE stub),
ADRs for the decisions already made, and a GitHub Actions pipeline that runs the CONSTRAINTS.md
checks from the first commit. Every task ends with `pnpm check:task` green and one conventional
commit. Nothing is pushed.

## Architecture decisions (this step)

- **Versions pinned at scaffold (2026-09-27):** Node 22 (`.nvmrc`), pnpm 10.31 (`packageManager`),
  Turborepo 2.11, TypeScript **5.9** (TS 7 is `latest` but is the new native compiler; Next 16
  declares no TS peer range and Biome/Vitest tooling around it is fresh, so we hold 5.x and
  revisit in milestone 2, recorded in ADR 0007), Biome 2.5, Vitest 5, zod 4 (native
  `z.toJSONSchema`, so no extra dependency), Next 16.3, React 19.3, Tailwind 4.3 via
  `@tailwindcss/postcss`, `@types/node` 22.
- **Test environment:** `happy-dom` for ui and web component tests (faster than jsdom);
  core and generator run in `node`.
- **Turbo tasks:** `build`, `test`, `lint`, `typecheck`, `dev`. `lint` runs once at the root
  (Biome is monorepo-aware); `typecheck` and `test` run per package with `^build` dependency so
  workspace packages resolve their built `dist` types. Packages publish `dist/` via `tsc`
  (no bundler) since they are private and consumed only in-workspace.
- **Check scripts** live in root `package.json` and mirror CONSTRAINTS.md exactly:
  `check:fast`, `check:task`, `check:full`. gitleaks is invoked through a tiny wrapper
  `scripts/gitleaks.mjs` that runs it when installed and otherwise prints a loud
  "not installed, CI enforces" line and exits 0 (CI installs it, so CI never skips).
- **CI:** one workflow, `ci.yml`, on push and pull_request: checkout with full history (floor
  guard needs a merge base), pnpm via `corepack`, Node 22, `pnpm install --frozen-lockfile`,
  gitleaks action, then `pnpm check:full`. The axe job against a served `apps/web` is added in
  the web step when there is a page worth scanning; CONSTRAINTS.md already declares it CI-only.
- **Package shape:** every package has `package.json` (`private`, `type: module`, `exports`),
  `tsconfig.json` extending `tsconfig.base.json`, `vitest.config.ts`, `README.md`, and one real
  exported symbol with one real test, so the pipeline is proven on non-trivial input.

## Task list

### Phase 1: Workspace
- [x] Task 1: Workspace root (pnpm workspace, turbo, tsconfig base, nvmrc, gitignore, LICENSE)
- [x] Task 2: Biome config + root check scripts + gitleaks wrapper

### Phase 2: Packages
- [x] Task 3: `packages/core` and `packages/generator` skeletons with a real test each
- [x] Task 4: `packages/ui` skeleton with Tailwind v4 token CSS entry and a component test
- [x] Task 5: `apps/web` Next.js app consuming ui, one page, `/dev` route stub

### Checkpoint: Workspace builds
- [x] `pnpm install && pnpm check:task` green; `pnpm build` green; `pnpm dev` serves a page

### Phase 3: Docs and pipeline
- [x] Task 6: README (purpose, subscription requirement, quickstart, roadmap with npm publishing), `docs/PRIVACY.md`, `docs/ARCHITECTURE.md` stub
- [x] Task 7: ADRs 0001–0007 via `documentation-and-adrs`
- [x] Task 8: GitHub Actions `ci.yml` via `ci-cd-and-automation`

### Checkpoint: Scaffold complete
- [x] `pnpm check:full` green locally; workflow YAML validates; CLAUDE.md run/test section is accurate
- [ ] Review with the owner before the core step

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| pnpm 10 blocks postinstall scripts (esbuild, sharp) and packages fail at runtime | Med | Add `pnpm.onlyBuiltDependencies` in root `package.json` for the exact packages that need it, after seeing the install warning |
| Next 16 + Vitest + happy-dom config friction | Med | Web tests limited to a render smoke test; component logic tested in `ui` |
| Tailwind v4 in a workspace package: `@source` and `@theme` resolution across packages | Med | ui ships a CSS entry; web imports it and declares `@source "../../packages/ui/src"`; verified in Task 5 by rendering a tokened class |
| Floor guard has no `origin/main` in CI shallow clones | High (exit 2 blocks CI) | `fetch-depth: 0` and explicit `--base origin/main` in CI |
| gitleaks absent locally makes `check:task` silently weaker | Low | Wrapper prints a loud notice; CI always runs the real thing |
| TypeScript 7 becomes required by a dependency mid-milestone | Low | Pinned 5.9; ADR 0007 records the revisit |

## Open questions

None blocking. The owner has confirmed Tailwind v4 and the read-only scope.

---

# Step 3 — core (2026-09-27)

Plan of record was the API design in `docs/SCHEMA.md`, approved before implementation. Built
test-first in this order, one commit: Station schema and cross-field rules → status schemas →
StationState schema → JSON Schema export with committed copies → glossary → rig derivation →
event model → layout and handoff geometry → ledger parsing with health derivation → demo fixture
and its validation test → public exports and README.

- [x] core public API implemented and exported
- [x] fixture validates; derived state matches the documented states
- [x] coverage thresholds 90/85 enforced and met
- [x] ADR-0009 schema versioning

---

# Step 4 — ui (plan, 2026-09-27)

Spec module `ui` in `docs/specs/SPEC-milestone-1.md`; design in `docs/design/` (spec v0.2 §04–§08).
Tokens and the Tailwind theme already exist. Everything below is built test-first (RTL + vitest-axe
under happy-dom for structure and state logic) and browser-verified with headless Playwright
screenshots (animations, reduced motion, both themes, one-column layout) before the step closes.

## Architecture decisions (this step)

- **One sprite, three `<use>`s.** All rig parts live in one hidden `<svg>` (`RigSprite`) rendered
  once by the app; each `Character` is `<svg viewBox="0 0 24 32">` with `<use href="#ow-body-…">`
  for body, head, shoulder, trace, and accessory, recolored by setting `--ow-rig-tint-hue` and
  `--ow-rig-trim-hue` inline. `rig/rig-parts-v0.svg` seeds bodies, heads, shoulders; traces,
  accessories, glyphs, the emblem disc, and the 48×64 hero rig are drawn new on the grid.
- **State via attributes, motion via CSS.** `data-state="idle|working|done|failed"` on the
  character root; `character.css` (shipped through `styles.css`) keys keyframes on it using only
  `--ow-*` tokens. Reduced motion collapses through the token override already in `tokens.css`.
- **Controlled components.** `StationMap` and `DetailPanel` take `selection` and `onSelect`; a
  `StationView` composite owns the selection state and the responsive split (side by side above
  the desktop breakpoint, map over a bottom sheet below). Apps render `StationView`.
- **Geometry from core.** `StationMap` scales core's 1000-unit layout to its container with one
  `viewBox`; `HandoffLayer` draws core's cubic paths; nothing in ui computes positions.
- **Timeline in ui, reducer in core.** `runDigestTimeline` is `Array<{ atMs, event }>`;
  `useTimeline(station, initialState)` plays it through `bindReducer`. A "Run digest" button
  exposes play and reset.
- **`/dev` gallery** lives in `apps/web/app/dev` and imports from ui; it has a theme switch and a
  section per component with every state, so Playwright can screenshot each in both themes.
- **Playwright** as a root dev dependency with a script under `scripts/browser/` that starts the
  built app, captures screenshots per route × theme × width × reduced-motion into
  `.outerworld/screenshots/` (gitignored), and asserts zero console errors and that under reduced
  motion no animation runs longer than the reduced-motion token.

## Task list

### Phase 1: the figure
- [x] Task 1: `RigSprite` symbols (bodies, heads, shoulders from v0; traces ×6, accessories ×4 + crest, glyphs check/exclaim, emblem disc + marks ×5) with a test that every referenced symbol id exists
- [x] Task 2: `Character` (props: rig, derived, state, scale, name) + `character.css` state keyframes; tests for part selection, hue variables, `data-state`, glyph override, integer scale
- [x] Task 3: `OverseerCharacter` (48×64 hero rig, achromatic) and `TeamEmblem` (disc + mark from hue); tests
- [x] Task 4: `/dev` gallery section for the rig: every head × shoulder × accessory × state, both sizes; Playwright screenshot script (`scripts/browser/`) and first browser check of the rig in light, dark, and reduced motion

### Checkpoint: figure verified in a browser (done 2026-09-27)

### Phase 2: the map
- [x] Task 5: `GrantChip` (replaces `Badge`), `AgentCard` (rig + name + mandate, run × selected × dimmed), `EmptyState`; tests + axe
- [x] Task 6: `TeamPanel` (emblem, name, mission, health square, chips, agent grid; selected/dimmed/collapsed); tests + axe
- [x] Task 7: `HandoffLayer` + `Packet` (SVG from core geometry; chevrons at the reading end; default/emphasis/carrying/selected); `OverseerCore` (octagon, hero rig, state ring); tests
- [x] Task 8: `StationMap` (viewBox scaling of core layout, HTML overlay for panels, selection, dimming of unconnected teams); tests for selection and geometry wiring + axe

### Checkpoint: fixture renders as a map (done 2026-09-27)

### Phase 3: the panel and the demo
- [x] Task 9: `DetailPanel` Report tab: `ProofLine`, header, last run, `LedgerView` (sections + changed marker), `RunTimeline` (last six), handoffs, agents; per-selection content for team / agent / grant / handoff / overseer; tests + axe
- [x] Task 10: `StationView` composite (selection state, responsive split, bottom sheet under 720px, Esc clears) + `Toast`; tests
- [x] Task 11: `runDigestTimeline` + `useTimeline` + "Run digest" control; reducer-driven tests for each step of the sequence
- [x] Task 12: `/dev` gallery completed for every component in every state; README for ui; browser verification of the whole map in both themes, reduced motion, 375px and 1280px; fix anything found (debugging-and-error-recovery if flaky)

### Checkpoint: ui step complete (2026-09-27)
- [x] `pnpm check:task` green; axe clean in component tests; screenshots reviewed in light, dark, reduced motion, 375 and 1280; interaction captures (team, handoff, timeline mid and end) clean; awaiting owner review

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hand-drawing the 48×64 hero rig takes long or reads badly at 2× | Med | Draw it after the card rig proves the pipeline; keep it stylized (heavy silhouette, crest, chest intake), review the screenshot early |
| `<use>` + CSS variables + keyframes on SVG groups behave differently across browsers | Med | Playwright runs Chromium only this milestone; note WebKit/Firefox as follow-up in the README |
| happy-dom can't compute CSS, so state tests only see attributes and inline variables | Low | That is the point of Playwright; tests assert the contract (attributes, vars, hrefs), the browser check asserts the rendering |
| Relative color syntax unsupported in the Playwright Chromium build | Low | Chromium 119+ supports it; assert computed colors in the screenshot script |
| Tailwind `@source` misses class names composed at runtime | Med | No composed class names; state classes are static strings or data attributes |

---

# Step 5 — apps/web (plan, 2026-09-27)

Spec module `web`. The ledger loader and the gallery already exist; this step makes the home page
the product, adds the theme toggle, puts the browser checks (axe included) into CI, and verifies.

## Decisions
- **Time.** The fixture is dated; when the source is the fixture, the loader evaluates health at
  the fixture's as-of moment so the demo never rots into "stalled". A real ledger uses the real
  clock.
- **Theme.** One `ThemeToggle` (system / light / dark) shared by `/` and `/dev`, persisted in
  `localStorage` (per-viewer convenience only, per PRIVACY.md), applied to `<html data-theme>`,
  and pre-applied by a tiny inline script in the layout so there is no flash. `?theme=` still
  overrides for the screenshot script.
- **axe in CI** runs through `@axe-core/playwright` inside `browser:verify` rather than
  `@axe-core/cli`, which needs a separate WebDriver; same engine, same rule set, blocks on
  critical and serious. CONSTRAINTS.md's row names the new command.
- **CI job** `browser`: build, install Chromium, `pnpm browser:verify`, upload screenshots as an
  artifact on failure.

## Tasks
- [x] Task 1: loader tests (fixture default, `OUTERWORLD_LEDGER_PATH`, invalid station → error with issues); home page renders `StationView` from the loaded ledger with a header (station name, source, as-of) and the Run digest toolbar
- [x] Task 2: `ThemeToggle` shared by both routes, persisted, no-flash init script; `/dev` uses it
- [x] Task 3: axe in `browser:verify`; CI `browser` job; CONSTRAINTS.md row updated; README/CLAUDE.md run notes
- [x] Task 4: browser pass at 375 and 1280 in both themes and reduced motion, `/` and `/dev`; fix findings at the root

### Checkpoint: web step complete (2026-09-27)
- [x] `pnpm check:full` green, `pnpm browser:verify` clean including axe, CI workflow updated, owner review

---

# Step 6 — generator (plan, 2026-09-27)

Contract: `docs/SCHEMA.md` §6 (CLI, emitted layout, prompt shape, public API). Built test-first with
`toMatchFileSnapshot` against the fixture so every emitted file is reviewable in diffs.

- [x] Task 1: emitters for `station.json`, `agents/*.md`, `skills/*/SKILL.md`, `ledger/*.md`, `status/README.md` (+ .gitkeep), `scripts/post-digest.sh`; snapshot tests
- [x] Task 2: `emitClaudeMd` with the handoff table and status contract; `emitRoutinePrompt` and `emitOverseerPrompt` with the setup checklist from verified Routines facts; snapshot tests
- [x] Task 3: `emitLedger` (sorted, deterministic) and `protectedPaths`; the CLI (`generate`, `validate`, `--dry-run`, `--force`, exit codes) with tests that run it against a temp dir; README
- [x] Task 4: `docs/SCHEMA.md` §6 final, `templates/ledger-repo/` skeleton, run the generated ledger through `OUTERWORLD_LEDGER_PATH` in the app (loader test) — the milestone's "render a generated ledger" criterion

### Checkpoint: generator complete (2026-09-27)
- [x] coverage 90/85 met, snapshots committed, `pnpm check:task` green, owner review

---

# Step 7 — close (2026-09-27)

Five-axis review of every package (core, ui, generator + scripts, web + docs), findings fixed in
four commits (`28e1a52`, `5ab185b`, `ff1d958`, `f3e8c59`), integration fixes in `978a181`.

- [x] Review: prototype-safe ids and lookups, one health derivation, honest clock (core);
      safer CLI, reliable prompts, webhook gitleaks rule (generator); dynamic rendering, hardened
      ledger reader, demo badge only for the fixture (web); reliable pan, report views split, core
      types, tokens for every number (ui)
- [x] Simplification pass: `DetailPanel` is a 98-line dispatcher over `resolveSelection`;
      report views live in `components/report/`
- [x] Docs: CLAUDE.md, ADR-0008/0009, README roadmap, SCHEMA.md §6, CONSTRAINTS measured table
- [x] `pnpm check:full` green (core 103, generator 51, ui 174, web 12), floor guard clean,
      `pnpm browser:verify` clean at 375 and 1280 in both themes and reduced motion, `/` and `/dev`

### Checkpoint: milestone 1 complete (2026-09-27)
- [x] Everything local; nothing pushed, so CI has not run yet
- [ ] Owner: replace the fixture overseer name "Ultron" before any public release (Marvel mark)
- [ ] Owner: manual live Routine smoke test (done criterion Option A)
