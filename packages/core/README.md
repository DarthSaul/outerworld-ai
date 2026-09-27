# @darthsaul/outerworld-ai-core

Headless core for Outerworld AI: the Station and StationState schemas (zod, with JSON Schema
export), the glossary, layout and handoff geometry, rig derivation, the event model, and ledger
parsing. Zero React, zero DOM, zero filesystem. Private package, consumed in-workspace.

## Public API

| Export | Description |
|--------|-------------|
| `SCHEMA_VERSION` | Current schema version number. |
| `isSupportedSchemaVersion(v)` | Type guard: can this build read a document with version `v`? |

The schema, glossary, geometry, events, and ledger modules land in the core step of milestone 1
and are documented here as they ship.

## Develop

```
pnpm --filter @darthsaul/outerworld-ai-core test      # vitest with coverage thresholds 90/85
pnpm --filter @darthsaul/outerworld-ai-core typecheck
pnpm --filter @darthsaul/outerworld-ai-core build     # tsc → dist/
```
