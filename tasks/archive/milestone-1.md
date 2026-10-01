# Todo: Milestone 1, Step 2 — Scaffold

## Task 1: Workspace root
**Description:** Create the pnpm workspace with Turborepo pipeline and shared TypeScript config.
**Acceptance criteria:**
- [x] `pnpm-workspace.yaml` lists `apps/*`, `packages/*`; root `package.json` is private, `type: module`, `engines.node >=22 <23`, `packageManager: pnpm@10.31.0`
- [x] `turbo.json` defines `build`, `test`, `lint`, `typecheck`, `dev`, with `test`/`typecheck` depending on `^build`
- [x] `tsconfig.base.json` is strict, `module: NodeNext`, `target: ES2022`, `verbatimModuleSyntax`; `.nvmrc` = 22; `.gitignore` adds `.outerworld/`, `.turbo/`, `dist/`; MIT `LICENSE`
**Verification:** `pnpm install` succeeds; `git status` shows no ignored junk staged. Commit `chore(repo): scaffold pnpm workspace and turborepo`.
**Dependencies:** None. **Files:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`, `LICENSE`. **Scope:** M

## Task 2: Biome and check scripts
**Description:** Lint/format config and the three check scripts that mirror CONSTRAINTS.md.
**Acceptance criteria:**
- [x] `biome.json` (recommended rules, double quotes, 100 cols, ignores `dist`, `.next`, `coverage`, snapshots)
- [x] Root scripts: `lint`, `typecheck`, `test`, `build`, `dev`, `check:fast`, `check:task`, `check:full`
- [x] `scripts/gitleaks.mjs` runs `gitleaks detect --redact --no-banner` when installed, else prints a loud notice and exits 0
**Verification:** `pnpm lint` and `node scripts/floor-guard.mjs --base main` pass on the tree. Commit `chore(repo): add biome and constraint check scripts`.
**Dependencies:** 1. **Files:** `biome.json`, `package.json`, `scripts/gitleaks.mjs`. **Scope:** S

## Task 3: core and generator skeletons
**Description:** Two headless packages with identical shape, each exporting one real symbol with one test, coverage thresholds 90/85 set.
**Acceptance criteria:**
- [x] `packages/core`: `package.json` (`@darthsaul/outerworld-ai-core`, private, exports `./dist/index.js`), `tsconfig.json`, `vitest.config.ts` with `coverage.thresholds { lines: 90, branches: 85 }`, `src/index.ts` exporting `SCHEMA_VERSION`, `src/index.test.ts`, `README.md`
- [x] Same for `packages/generator` (`@darthsaul/outerworld-ai-generator`, depends on core via `workspace:*`), exporting a placeholder `GENERATOR_VERSION`
- [x] `pnpm test` and `pnpm typecheck` pass with coverage thresholds enforced
**Verification:** `pnpm turbo test typecheck build --filter=./packages/core --filter=./packages/generator`. Commit `feat(core,generator): package skeletons`.
**Dependencies:** 1, 2. **Files:** ~6 per package (config-only). **Scope:** M

## Task 4: ui skeleton with tokens entry
**Description:** React package with the Tailwind v4 CSS entry, a `tokens.css` stub holding one real token per category, and a trivial component tested with RTL + vitest-axe under happy-dom.
**Acceptance criteria:**
- [x] `packages/ui` package.json exports `.` (components) and `./styles.css` (tokens + `@theme`)
- [x] `src/tokens/tokens.css`, `src/tokens/theme.css`, `src/styles.css` (already written from the design spec) compile under Tailwind v4 with no warnings; `tokens.ts` exports the token names for tests
- [x] IBM Plex Sans and Mono (400/500/600) self-hosted under `packages/ui/fonts/` with the OFL license file, declared via `@font-face` in `tokens.css`; no Google Fonts request
- [x] `src/components/Badge.tsx` renders with a tokened class; `Badge.test.tsx` passes RTL + `toHaveNoViolations`
**Verification:** `pnpm turbo test typecheck build --filter=./packages/ui`. Commit `feat(ui): package skeleton with token entry`.
**Dependencies:** 3. **Files:** ~9 incl. fonts. **Scope:** M

## Task 5: apps/web
**Description:** Next.js 16 App Router app importing ui's CSS and `Badge`, one page and a `/dev` stub, Tailwind v4 via PostCSS, a render smoke test.
**Acceptance criteria:**
- [x] `apps/web` with `next.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/dev/page.tsx`, `app/globals.css` importing `@darthsaul/outerworld-ai-ui/styles.css` and `@source` for ui
- [x] `pnpm dev` serves `/` showing the Badge styled by the token (verified in browser), `/dev` renders
- [x] `pnpm build` succeeds; one vitest smoke test renders `page.tsx`
**Verification:** `pnpm build`, `pnpm test --filter web`, manual `pnpm dev` check. Commit `feat(web): next.js app consuming ui`.
**Dependencies:** 4. **Files:** ~8 (mostly config). **Scope:** M

## Checkpoint A
- [x] `pnpm install && pnpm check:task && pnpm build` green from a clean `node_modules` (2026-09-27; happy-dom + vitest-axe work; breakpoint is the one literal in theme.css with a parity test; no Chrome DevTools MCP in session, served HTML/CSS verified by curl)

## Task 6: README, PRIVACY, ARCHITECTURE
**Acceptance criteria:**
- [x] README: what it is, Claude Pro/Max requirement stated plainly, quickstart, layout, roadmap (npm publishing with Changesets + `publishConfig.access: public`, editing UI, trigger wiring, themed vocabulary), license
- [x] `docs/PRIVACY.md` data map: what lives in this repo, in the ledger repo, in the Routine env, in `.outerworld/`, and what leaves the machine (nothing from this app; Discord post from the Routine)
- [x] `docs/ARCHITECTURE.md` stub with the package boundary rule and the two jobs
**Verification:** floor guard clean; links resolve. Commit `docs: readme, privacy map, architecture stub`.
**Dependencies:** None. **Files:** 3. **Scope:** S

## Task 7: ADRs
**Acceptance criteria:**
- [x] `docs/decisions/` with template and 0001 monorepo, 0002 neutral vocabulary, 0003 CSS-variable tokens under Tailwind v4, 0004 Routines as runtime, 0005 clone-and-run distribution, 0006 grants are prompt-enforced, 0007 TypeScript 5.9 pin
**Verification:** each ADR has Context / Decision / Consequences / Status. Commit `docs(adr): record founding decisions`.
**Dependencies:** None. **Files:** 8. **Scope:** M (docs only)

## Task 8: CI
**Acceptance criteria:**
- [x] `.github/workflows/ci.yml`: push + PR, `fetch-depth: 0`, Node 22, pnpm via corepack, frozen install, turbo cache off (no remote), `gitleaks/gitleaks-action`, `pnpm check:full`, floor guard with `--base origin/main`
- [x] Concurrency group cancels superseded runs; no secrets required
**Verification:** YAML parses; `act` or a dry read-through; `pnpm check:full` green locally. Commit `ci: lint, typecheck, test, gitleaks pipeline`.
**Dependencies:** 2, 5. **Files:** 1–2. **Scope:** S

## Checkpoint B: Scaffold complete
- [x] `pnpm check:full` green (5 s locally, 2026-09-27); CLAUDE.md run/test section updated; CI YAML parses (actionlint unavailable locally); awaiting owner review before the core step

---

# Todo: Milestone 1, Step 4 — ui

(See the ui plan in tasks/plan.md for architecture decisions.)

## Task 1: RigSprite
**Acceptance:** one `RigSprite` component rendering a hidden `<svg>` of `<symbol>`s on the 24×32 grid: `ow-body-idle`, `ow-body-active`, `ow-head-dome|wedge|crest`, `ow-shoulder-ball|pauldron`, `ow-trace-core|bar|chevron|split|frame|twin`, `ow-accessory-antenna|thruster|plate|crest`, `ow-glyph-check|exclaim`, `ow-emblem-disc`, `ow-mark-spire|forge|dome|archive|beacon`, `ow-hero` (48×64). Every rect grid-snapped, fills only `var(--ow-rig-*)` / `var(--ow-emblem-*)` / `var(--ow-overseer-*)`. A `RIG_SYMBOLS` const lists ids; a test renders the sprite and checks each id exists and no fill is a literal.
**Files:** `src/character/sprite.tsx`, `sprite.test.tsx`, `rig-parts.ts` (rect data). **Scope:** M

## Task 2: Character
**Acceptance:** `<Character rig derived state scale name />` renders an `<svg role="img" aria-label="{name}, {state}">` with `data-state`, inline `--ow-rig-tint-hue/--ow-rig-trim-hue`, `--ow-rig-glow: var(--ow-rig-glow-{state})`, `--ow-rig-px`, body `active` when working, glyph check when done / exclaim when failed overriding the accessory, width/height = 24×scale / 32×scale (integer scales only, non-integer throws in dev). `character.css` keyframes for idle bob+blink, working nod+arm alternation+breathe, done pop, failed dim, all from tokens.
**Files:** `src/character/Character.tsx`, `Character.test.tsx`, `character.css`. **Scope:** M

## Task 3: OverseerCharacter and TeamEmblem
**Acceptance:** `OverseerCharacter` uses `ow-hero`, achromatic vars, same `data-state` contract, scale 2 or 4 only. `TeamEmblem hue mark scale` renders the disc with `--ow-emblem-hue` inline and the mark symbol; health dot is not part of the emblem.
**Files:** `src/character/OverseerCharacter.tsx`, `src/components/TeamEmblem.tsx`, tests. **Scope:** S

## Task 4: Rig gallery + Playwright
**Acceptance:** `/dev` shows the rig matrix at 1× and 2×; `scripts/browser/screenshot.mjs` (Playwright, Chromium) starts `next start` on a free port, captures `/dev` in light and dark, normal and reduced motion, at 375 and 1280, asserts zero console errors, asserts reduced-motion animation durations ≤ token; screenshots land in `.outerworld/screenshots/`. Reviewed by eye.
**Files:** `apps/web/app/dev/page.tsx`, `scripts/browser/screenshot.mjs`, root `package.json`. **Scope:** M

## Task 5: GrantChip, AgentCard, EmptyState
**Acceptance:** `GrantChip mode label inUse revoked selected`; `AgentCard agent derived state selected dimmed onSelect` (button semantics, rig at 1×, name + one-line mandate, breathe ring while working); `EmptyState title body action?`. RTL + axe.
**Files:** `src/components/GrantChip.tsx`, `AgentCard.tsx`, `EmptyState.tsx`, tests; delete `Badge`. **Scope:** M

## Task 6: TeamPanel
**Acceptance:** header (emblem 2×, name, mission ellipsis, health square top-right), chips row, 2-col agent grid; `selected`, `dimmed`, `collapsed` (header only); clicking the header selects the team; children clicks select agents/grants. RTL + axe.
**Files:** `src/components/TeamPanel.tsx`, test. **Scope:** M

## Task 7: HandoffLayer, Packet, OverseerCore
**Acceptance:** `HandoffLayer handoffs geometry states selection onSelect` renders one `<path>` per handoff with a 12-unit invisible hit path, chevrons at `chevronAt`, `data-state` default/emphasis/carrying/selected; `Packet` animates along `offset-path` when `carrying`; `OverseerCore state persona` renders the octagon (clip-path from the chamfer token), the hero rig at 2×, attention ring. Tests.
**Files:** `src/components/HandoffLayer.tsx`, `Packet.tsx`, `OverseerCore.tsx`, tests. **Scope:** M

## Task 8: StationMap
**Acceptance:** `StationMap station state layout selection onSelect` composes the SVG layer and HTML panels inside one scaled 1000×1000 frame; selection dims unconnected teams and emphasizes connected handoffs; keyboard: every selectable is a button; Esc handled by the view. RTL (selection wiring) + axe.
**Files:** `src/components/StationMap.tsx`, test. **Scope:** M

## Task 9: DetailPanel (Report)
**Acceptance:** for each selection kind, the panel shows eyebrow, title, meta, `ProofLine` (asOf · path · sha), then: team → last run, ledger sections with changed marker, run timeline (≤6), handoffs, agents; agent → persona and state; grant → mode, tool, which agents hold it; handoff → from/to, carrying, last packet; overseer → digest, attention list, last outward post. Empty states use the glossary. RTL + axe.
**Files:** `src/components/DetailPanel.tsx` (+ small parts), tests. **Scope:** M

## Task 10: StationView + Toast
**Acceptance:** owns selection; desktop: map + 400px panel; under 720px: map, panel as a bottom sheet; Esc clears; `Toast` region with `aria-live="polite"`. Tests.
**Files:** `src/components/StationView.tsx`, `Toast.tsx`, tests. **Scope:** M

## Task 11: Timeline
**Acceptance:** `runDigestTimeline` (run.started → agent working → ledger.written → run.finished done → overseer reconciling → digest.posted, at token-scaled offsets); `useTimeline(station, initial)` returns `{ state, playing, play, reset }`; a test steps the reducer and asserts each state; a `RunDigestButton`.
**Files:** `src/timeline/*.ts(x)`, tests. **Scope:** S

## Task 12: Gallery, README, browser verification
**Acceptance:** `/dev` has every component in every state; `packages/ui/README.md` documents the public API; Playwright run reviewed in light, dark, reduced motion, 375 and 1280; console clean; findings fixed at root cause.
**Files:** `apps/web/app/dev/page.tsx`, `packages/ui/README.md`, `scripts/browser/`. **Scope:** M
