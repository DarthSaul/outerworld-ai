# Constraints

Last reviewed: 2026-09-27 by @darthsaul

This file is the project's quality bar. Agents read it before writing code. It is never weakened
in the same change that was failing it. Tightening is silent; loosening is a reviewed diff here.

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` without a reason,
  `biome-ignore`, `istanbul ignore`, `gitleaks:allow`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`, `TODO` in place
  of an implementation
- No skipped or deleted tests without a reason in the commit message
- No secrets in source, generated files, fixtures, or docs. Fixture webhook URLs are obviously fake
- No hardcoded design tokens in `packages/ui` or `apps/web`: no hex, `rgb()`, `hsl()`, pixel radius,
  or `ms` literal outside the token definitions
- No themed vocabulary in identifiers, filenames, schema keys, or test names (see CLAUDE.md)
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
| Coverage: generator | lines >= 90%, branches >= 85% | `vitest run --coverage` in `packages/generator` (thresholds in `vitest.config.ts`) | task end, CI |
| Accessibility: components | Zero axe violations of any impact in rendered component tests | `vitest-axe` assertions in `packages/ui` tests | task end, CI |
| Accessibility: app | Zero critical or serious axe violations on `/` and `/dev` in both themes | `@axe-core/cli` against a built `apps/web` served locally | CI only (needs a URL) |
| Schema | Demo fixture validates against the current Station and StationState schemas; exported JSON Schema matches the committed copy | Vitest tests in `packages/core` | task end, CI |
| Generator output | Emitted ledger files match committed snapshots for the demo fixture | Vitest snapshot tests in `packages/generator` | task end, CI |

Every row names the command that produces the verdict. A dimension with a number and no command
is an aspiration, not a constraint.

Rule configuration (not exceptions): Biome's `useSemanticElements` is off for SVG-only components
(`packages/ui/src/components/HandoffLayer.tsx`), because SVG has no `<button>` element; the lanes
are `<g role="button" tabIndex=0>` with keyboard handlers, and axe checks them in tests.

Why these numbers:
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
| Coverage: ui (lines) | not yet measured | record after ui step; must not fall |
| apps/web first-load JS | not yet measured | record after web step; must not grow |

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
| CI | `pnpm check:full` | `check:task` + build + axe against served `apps/web` | unlimited |

The scripts mirror this file. If they drift, this file wins.

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|

None. An exception needs an owner and an expiry no more than 90 days out.
