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
- [ ] README: what it is, Claude Pro/Max requirement stated plainly, quickstart, layout, roadmap (npm publishing with Changesets + `publishConfig.access: public`, editing UI, trigger wiring, themed vocabulary), license
- [ ] `docs/PRIVACY.md` data map: what lives in this repo, in the ledger repo, in the Routine env, in `.outerworld/`, and what leaves the machine (nothing from this app; Discord post from the Routine)
- [ ] `docs/ARCHITECTURE.md` stub with the package boundary rule and the two jobs
**Verification:** floor guard clean; links resolve. Commit `docs: readme, privacy map, architecture stub`.
**Dependencies:** None. **Files:** 3. **Scope:** S

## Task 7: ADRs
**Acceptance criteria:**
- [ ] `docs/decisions/` with template and 0001 monorepo, 0002 neutral vocabulary, 0003 CSS-variable tokens under Tailwind v4, 0004 Routines as runtime, 0005 clone-and-run distribution, 0006 grants are prompt-enforced, 0007 TypeScript 5.9 pin
**Verification:** each ADR has Context / Decision / Consequences / Status. Commit `docs(adr): record founding decisions`.
**Dependencies:** None. **Files:** 8. **Scope:** M (docs only)

## Task 8: CI
**Acceptance criteria:**
- [ ] `.github/workflows/ci.yml`: push + PR, `fetch-depth: 0`, Node 22, pnpm via corepack, frozen install, turbo cache off (no remote), `gitleaks/gitleaks-action`, `pnpm check:full`, floor guard with `--base origin/main`
- [ ] Concurrency group cancels superseded runs; no secrets required
**Verification:** YAML parses; `act` or a dry read-through; `pnpm check:full` green locally. Commit `ci: lint, typecheck, test, gitleaks pipeline`.
**Dependencies:** 2, 5. **Files:** 1–2. **Scope:** S

## Checkpoint B: Scaffold complete
- [ ] `pnpm check:full` green; CLAUDE.md run/test section accurate; owner review before core step
