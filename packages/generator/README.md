# @darthsaul/outerworld-ai-generator

Turns a Station document into the files a private ledger repo needs: `CLAUDE.md`, agent
personas, skills, one routine prompt per team plus the overseer's, the team ledgers, the digest
script, and the status schema. Pure functions plus a small CLI. Knows nothing about rendering.
Private package, consumed in-workspace.

## Public API

| Export | Description |
|--------|-------------|
| `EmittedFile` | `{ path, contents }` relative to the ledger repo root. |
| `GENERATOR_SCHEMA_VERSION` | The core schema version this generator emits for. |
| `sortEmitted(files)` | Deterministic path order for emitted files. |

`emitLedger(station)` and the `outerworld generate` CLI land in the generator step of milestone 1.

## Develop

```
pnpm --filter @darthsaul/outerworld-ai-generator test   # coverage thresholds 90/85
```
