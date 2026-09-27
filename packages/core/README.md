# @darthsaul/outerworld-ai-core

Headless core for Outerworld AI: the Station and StationState schemas (zod, with JSON Schema
export), the glossary, layout and handoff geometry, rig derivation, the event model, and ledger
parsing. Zero React, zero DOM, zero filesystem. Private package, consumed in-workspace.

The contract is `docs/SCHEMA.md`; versioning is ADR-0009. Committed JSON Schemas live in
`schema/` and a test fails when they drift from the zod source (regenerate with
`pnpm build && node scripts/write-schemas.mjs`).

## Public API

### Schema
| Export | Description |
|--------|-------------|
| `SCHEMA_VERSION` | Current schema version (`1`). |
| `parseStation(input)` | `Result<Station>`: zod parse plus cross-field rules (team refs, allowlist ⊆ team grants, no self or duplicate handoffs, reserved overseer rig parts, 60-minute minimum interval). Never throws. |
| `parseRunRecord`, `parseTeamStatus`, `parseOverseerStatus` | `Result<…>` for the three status files Routines write. |
| `parseStationState(input)` | `Result<StationState>` for the derived state. |
| `Station`, `Team`, `Agent`, `Grant`, `Handoff`, `Overseer`, `RunRecord`, `TeamStatus`, `OverseerStatus`, `StationState`, … | zod schemas and their inferred types. |
| `jsonSchemaFor(name)`, `JSON_SCHEMAS` | Draft 2020-12 JSON Schema per document. |
| `Result<T>`, `Issue` | `{ ok, value, issues }` / `{ ok: false, issues }`; issues are `{ level, path, message }`. |

### Ledger
| Export | Description |
|--------|-------------|
| `parseLedger(station, files, { now, sourcePath, sourceRef? })` | Derives `StationState` from an in-memory map of ledger-repo files. Health: stalled after 2× the schedule interval, attention on failure, overseer flag, or malformed file. Never throws. |
| `parseLedgerMarkdown(text)` | The three fixed sections of a team ledger. |

### Events
| Export | Description |
|--------|-------------|
| `emptyState(station, { now, sourcePath })` | All idle, all healthy. |
| `applyEvent(state, event, station)` / `bindReducer(station)` | Pure reducer over `StationEvent` (run started/finished, agent state, ledger written, overseer state, digest posted). |

### Layout and rig
| Export | Description |
|--------|-------------|
| `layoutStation(station)` | Deterministic boxes in a 1000-unit square: radial ≤ 8 teams, two rings ≤ 16, list beyond; overseer at center. |
| `handoffGeometry(handoff, layout, all)` | SVG cubic path, midpoint, angle, chevron point; paired handoffs offset to opposite sides. |
| `deriveRig(agent, station)` | Shoulder (pauldron if any write grant) and accessory (antenna / thruster / plate / none). |
| `overseerRig()` | The fixed overseer rig. |

### Glossary
| Export | Description |
|--------|-------------|
| `term(key)`, `glossary`, `GLOSSARY_KEYS` | The only place themed display strings live (naming Set D). |

## Develop

```
pnpm --filter @darthsaul/outerworld-ai-core test      # vitest with coverage thresholds 90/85
pnpm --filter @darthsaul/outerworld-ai-core typecheck
pnpm --filter @darthsaul/outerworld-ai-core build     # tsc → dist/
```
