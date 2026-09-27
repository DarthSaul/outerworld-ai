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
