# Constraints

Last reviewed: 2026-09-29 by @darthsaul (v1 pivot, ADR-0010; rows for the runtime, the SPA, and
the no-network rule land with their code in Phase 1)

This file is the project's quality bar. Agents read it before writing code. It is never weakened
in the same change that was failing it. Tightening is silent; loosening is a reviewed diff here.

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` without a reason,
  `biome-ignore`, `istanbul ignore`, `gitleaks:allow`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` in place
  of an implementation
- No skipped or deleted tests without a reason in the commit message
- A test deleted in the same diff as its whole package (its `package.json`) or the module it tests
  (`foo.test.ts` with `foo.ts`) is retired with that code, not made easier; the guard allows it,
  and the commit message still names the reason (usually an ADR). Added 2026-09-29 by the owner's
  decision for the ADR-0010 archive.
  - A deleted test is also retired when every module it imports by relative path is gone (shared
    test helpers aside). A module is gone when it was deleted, or when it no longer exports any
    name the test imported. This covers a test of several deleted modules, or of symbols removed
    from a kept module. Added 2026-10-01 by the owner's decision for the ADR-0013 cleanup.
- Assertion lines in a kept test file may change but not shrink: the guard flags a file whose
  diff removes more `expect`/`assert` lines than it adds. A changed assertion is reviewed in the
  diff (a weaker matcher is a review finding). Added 2026-09-29 by the owner's decision.
  - Retired assertions don't count against this. A removed assertion is retired when its diff
    hunk names an import its module no longer exports, a constant read from a deleted file, or a
    removed helper built on either. Added 2026-10-01 by the owner's decision.
- No secrets in source, generated files, fixtures, or docs. Fixture webhook URLs are obviously fake
- No hardcoded design tokens in `packages/ui` or `apps/web`: no hex, `rgb()`, `hsl()`, pixel radius,
  or `ms` literal outside the token definitions
- The token rule above also covers `apps/station` (the v1 SPA, ADR-0010)
- No themed vocabulary in identifiers, filenames, schema keys, or test names (see CLAUDE.md)
- No network in tests or CI: any `fetch` or socket to a non-loopback host throws (Vitest setup
  `packages/runtime/src/test/no-network.ts`, used by every package that does IO). Real OpenRouter
  and Notion calls only in smoke tests run by hand with `OUTERWORLD_ALLOW_NETWORK=1`
- This file does not get weakened to make a change pass
- Checked by: `node scripts/floor-guard.mjs` (diff-scoped, exit 0 clean / 1 violation / 2 could not run)

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|------------|---------|
| Types | Zero type errors, `strict: true` in every package | `pnpm typecheck` (`tsc --noEmit` per package via turbo) | every edit (touched package), task end, CI |
| Lint + format | Zero errors, zero formatting diffs | `pnpm lint` (`biome check .`) | every edit, task end, CI |
| Secrets | Zero findings | `gitleaks detect --redact --no-banner` | task end when installed, CI always |
| Floor | Zero floor violations in the diff | `node scripts/floor-guard.mjs` | task end, CI |
| Tests | All Vitest suites green | `pnpm test` (`vitest run` per package via turbo) | task end, CI |
| Coverage: core | lines >= 90%, branches >= 85% | `vitest run --coverage` in `packages/core` (thresholds in `vitest.config.ts`) | task end, CI |
| Coverage: runtime | lines >= 85%, branches >= 80% | `vitest run --coverage` in `packages/runtime` (thresholds in `vitest.config.ts`) | task end, CI |
| Coverage: daemon | lines >= 85%, branches >= 80% | `vitest run --coverage` in `apps/daemon` (`src/main.ts`, the process entry, excluded) | task end, CI |
| Coverage: station | lines >= 85%, branches >= 80% | `vitest run --coverage` in `apps/station` (`src/main.tsx` and `src/dev/`, the component gallery, excluded) | task end, CI |
| Coverage: generator | lines >= 90%, branches >= 85% | Retired 2026-09-29: `packages/generator` archived (ADR-0010); nothing left to measure. Row stays until the owner removes it | n/a |
| Accessibility: components | Zero axe violations of any impact in rendered component tests | `vitest-axe` assertions in `packages/ui` tests | task end, CI |
| Accessibility: app | Zero critical or serious axe violations on `/` and `/dev` (dark only since ADR-0013) | `pnpm browser:verify` (`@axe-core/playwright` inside `scripts/browser/screenshot.mjs`, against the built SPA served by the built daemon on a copy of the fixture) | CI (browser job); locally before a ui or SPA step closes |
| Schema | Demo fixture validates against the current Station and StationState schemas; exported JSON Schema matches the committed copy | Vitest tests in `packages/core` | task end, CI |
| Generator output | Emitted ledger files match committed snapshots for the demo fixture | Retired 2026-09-29 with `packages/generator` (ADR-0010). Row stays until the owner removes it | task end, CI |

Every row names the command that produces the verdict. A dimension with a number and no command
is an aspiration, not a constraint.

Rule configuration (not exceptions): Biome's `useSemanticElements` is off for SVG-only components
(`packages/ui/src/components/HandoffLayer.tsx`), because SVG has no `<button>` element; the lanes
are `<g role="button" tabIndex=0>` with keyboard handlers, and axe checks them in tests.

Why these numbers:
- **85 / 80 coverage on runtime, daemon, and station.** Async, IO-heavy code with error paths that need fault
  injection to reach; set by the owner 2026-09-29 (daemon and station the same day). Unit and
  component tests carry the SPA; browser e2e stays a smoke check for now.
- **90 / 85 coverage on core and generator.** Both are pure-function packages built test-first
  from an empty repo, so high coverage is the natural outcome rather than a stretch. `ui` and
  `apps/web` have no coverage number this milestone; component tests plus axe are their bar.
- **Zero axe violations of any impact in component tests.** Components are small and rendered in
  isolation, so moderate findings are cheap to fix at the source. The app-level run only blocks on
  critical and serious because page-level findings can be layout noise.
- **Time budgets.** Per-edit check under 5 s (Biome + `tsc` on the touched package). Task-end check
  under 90 s. CI is unlimited. A check that blows its budget moves to a later stage; it is not
  removed.

## Measured, not yet enforced

| Metric | Today | Direction |
|--------|-------|-----------|
| Coverage: ui (lines) | 89.06 % (2026-09-27, `pnpm --filter @darthsaul/outerworld-ai-ui exec vitest run --coverage`, "All files" row: statements 86.42, branches 75.24, functions 87.83) | must not fall |
| apps/web first-load JS | 990.8 KiB raw / 274.9 KiB gzip for `/` (2026-09-27; Next 16 prints no size table, so: `pnpm --filter web build`, `pnpm start`, sum every `<script src>` the served `/` HTML loads) | must not grow |
| apps/station first-load JS | 410.6 kB raw / 127.0 kB gzip for `/` (2026-09-29, `pnpm --filter station build`: the entry chunk plus the runtime chunk in Vite's size table; `/dev` is a lazy chunk). Replaces the apps/web row above, which retired with `apps/web` (ADR-0010) | tracked; may grow during v1 (owner, 2026-09-29) |

## Ranking by circularity

At least one constraint must be an outside opinion, not this project's own tests.
- **External:** axe-core (WCAG), gitleaks (secret patterns), Biome (its rule set).
- **Project:** floor guard, token rule, vocabulary rule, tsc under our `tsconfig`.
- **Suite:** Vitest coverage, snapshots, schema tests. Useful but circular.

## Lifecycle placement

| Phase | Script | Runs | Budget |
|-------|--------|------|--------|
| Every edit | `pnpm check:fast` | Biome, `tsc` on touched package | < 5 s |
| Task end | `pnpm check:task` | `check:fast` + gitleaks (if installed) + floor guard + Vitest with coverage | < 90 s |
| CI | `pnpm check:full` + `pnpm browser:verify` | `check:task` + build, then the browser job: screenshots, console errors, reduced-motion, axe | unlimited |

The scripts mirror this file. If they drift, this file wins.

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|

None. An exception needs an owner and an expiry no more than 90 days out.
