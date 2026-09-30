# @darthsaul/outerworld-ai-runtime

The Outerworld AI station runtime (ADR-0010). Owns everything with side effects: the station
data directory, SQLite, the append-only event log, and, as v1 lands phase by phase, the agent
loop, dispatcher, scheduler, tools, MCP client, memory, and budgets. Pure policy and schemas live
in `@darthsaul/outerworld-ai-core`; `apps/daemon` only wires this package to HTTP.

Private package, consumed in-workspace. Loads native modules (`better-sqlite3`), so it is never
imported by core, ui, or the SPA.

## Public API

### Station data directory (`$OUTERWORLD_HOME`, brief §9)
| Export | Description |
|--------|-------------|
| `stationPaths(home)` | Paths inside the station directory: `station.json`, `agents/<id>/`, `workspaces/`, `station.db`, `logs/`, `daemon.token`. |
| `loadStationDir(home)` | Reads `station.json` and every `agents/<id>/` (`agent.json` plus the four documents). Never throws for bad data: returns `{ station?, agents, issues }`; an invalid agent is skipped with an issue; symlinked agent directories are not followed; documents over 256 KiB are truncated with a warning. |
| `saveStationConfig(home, config)`, `saveAgentConfig(home, id, config)`, `saveAgentDocument(home, id, name, text)` | Validate with core, then write atomically. Throw on invalid input and write nothing. |
| `AGENT_DOCUMENTS` | `identity`, `purpose`, `standing-orders`, `context`. |
| `writeFileAtomic(path, data, { mode })` | Temp file in the same directory, fsync, rename, fsync the directory. Readers see the old file or the whole new one. |

### Database and event log
| Export | Description |
|--------|-------------|
| `openDatabase(path)` | better-sqlite3 with WAL and foreign keys; applies `MIGRATIONS` not yet recorded in `schema_migrations`, each in a transaction. |
| `EventStore` | `append(event)` validates against core's `RuntimeEvent`, assigns `seq` and `at`, commits, then notifies subscribers; `since(seq, limit)` replays for SSE `Last-Event-ID` and restart recovery; `subscribe(listener)`; `latestSeq()`. Updates and deletes are refused by triggers. |

## Tests

```
pnpm --filter @darthsaul/outerworld-ai-runtime test   # vitest with coverage (lines >= 85, branches >= 80)
```

`src/test/no-network.ts` is a Vitest setup file: any `fetch` or socket to a non-loopback host
fails the test. Real-network smoke tests opt out with `OUTERWORLD_ALLOW_NETWORK=1`, set by hand.
