# ADR-0005: Clone-and-run distribution, npm publishing deferred

## Status
Accepted

## Date
2026-09-27

## Context
The packages are named under the `@darthsaul` npm scope and the README roadmap promises npm
publishing. Publishing on day one would freeze a schema and an API that the milestone is still
designing, and would need Changesets, a release workflow, and public-access configuration.

## Decision
Milestone 1 ships as clone-and-run: `git clone`, `pnpm install`, `pnpm dev`. All packages are
`"private": true`. Publishing with Changesets and `publishConfig.access: "public"` is a README
roadmap item, not milestone work.

## Alternatives considered
- **Publish from the first milestone.** Rejected: premature API freeze and release overhead
  before the schema has a second consumer outside this repo.
- **A hosted demo instead of clone-and-run.** Rejected: the app reads a local ledger path; hosting
  would need an upload path and a privacy story the data map (docs/PRIVACY.md) does not have.

## Consequences
- Package names, `exports` maps, and READMEs are written as if publishable so the switch is
  small: remove `private`, add Changesets, add a release workflow.
- The app resolves workspace packages via `workspace:*` and `transpilePackages`.
