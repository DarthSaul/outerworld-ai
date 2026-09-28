# ADR-0007: Pin TypeScript 5.9 for milestone 1

## Status
Accepted (revisit at milestone 2)

## Date
2026-09-27

## Context
At scaffold time npm's `latest` tag for `typescript` is 7.0.2, the native (Go) compiler. Next.js
16 declares no TypeScript peer range, Biome and Vitest tooling around TS 7 is fresh, and the
milestone's risk budget is better spent on the schema and the rig than on compiler migration.

## Decision
Pin `typescript@~5.9` in the root `package.json`. Revisit at milestone 2 with a spike that runs
the full pipeline on TS 7.

## Alternatives considered
- **Adopt TS 7 now.** Rejected: unknown interaction with `next build`'s type step and with
  `tsc`-based package builds; no upside for a milestone that ships no public types.

## Consequences
- `tsc --noEmit` and `tsc -p tsconfig.build.json` behave as documented for 5.x.
- A future ADR supersedes this one when TS 7 is adopted.
