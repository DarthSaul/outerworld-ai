# ADR-0001: Monorepo with pnpm workspaces and Turborepo

## Status
Accepted

## Date
2026-09-27

## Context
The product has three code units with strict boundaries (a headless core, a React ui package,
and a file generator) plus one app that consumes two of them. They must share one schema and one
quality bar, be tested together, and eventually publish separately under the `@darthsaul` scope.

## Decision
One repository, pnpm workspaces (`apps/*`, `packages/*`), Turborepo for the task graph
(`build`, `test`, `typecheck`, `dev`), one shared strict `tsconfig.base.json`, one Biome config,
one `CONSTRAINTS.md`. Packages build with plain `tsc` to `dist/`; no bundler, since they are
consumed in-workspace.

## Alternatives considered
- **Separate repositories per package.** Rejected: the schema is the contract between all three,
  and cross-repo schema changes would need coordinated releases from day one.
- **npm workspaces without Turborepo.** Rejected: no task graph or caching; `typecheck` and
  `test` in dependents need the upstream `dist/` built first, which Turborepo expresses as
  `dependsOn: ["^build"]`.
- **A single package with internal folders.** Rejected: the boundary rule (core knows nothing of
  React or files; ui nothing of Routines; generator nothing of rendering) is easier to enforce
  as package boundaries with explicit dependencies.

## Consequences
- `pnpm install` once at the root; Turborepo runs tasks in dependency order.
- Every package has its own README with its public API.
- Publishing later is a matter of removing `"private": true` and adding Changesets (ADR-0005).
- pnpm 10 blocks lifecycle scripts by default; any package that needs a build script is listed
  explicitly in root `package.json` when the need appears.
