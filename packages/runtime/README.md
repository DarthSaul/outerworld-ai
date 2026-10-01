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

### Crew and rooms (Phase 2)
| Export | Description |
|--------|-------------|
| `CrewService({ home, events, connectorTools? })` | `view()`, `agent(id)` (config, documents, effective tools from core's `resolveGrants`), `createAgent`, `updateAgent`, `putDocument`, `deleteAgent` (keeps the workspace), `createRoom`, `updateRoom`, `deleteRoom` (refused while crew or hallways use it), `addSchedule` / `updateSchedule` / `removeSchedule` (every cron checked with croner). Reads from disk every call; writes run one at a time, are validated across the whole station, and emit `agent.updated` / `station.updated`. Refuses only errors a change would introduce. |
| `NotFoundError`, `ConflictError` | What the daemon maps to 404 and 409; `ConflictError.issues` says why. |

### Scheduler (Phase 8, brief §13)
| Export | Description |
|--------|-------------|
| `Scheduler({ home, runs, sessions, events, store, clock?, timezone? })` | `start()` records or catches up (once, with `catchUp`) an occurrence missed while the daemon was down, arms every enabled schedule, and re-arms on `agent.updated` / `station.updated`; `reload()`, `stop()`, `idle()`, `view(agentId)` → `ScheduleView[]` (effective zone, next run, error, last 10 fires), `runNow(agentId, scheduleId)`. A run goes into the schedule's configured session or its own "Scheduled" session through `RunService`, so grants, approval mode, and budgets apply. An occurrence is `schedule.missed` (`down`, `busy`, `stopped`, `error`) when it cannot run. New, edited, and re-enabled schedules count from the moment they are armed. |
| `ScheduleStore(db)` | Per schedule: the config it was armed with, the last occurrence accounted for, its session; and a history of fires joined to the run's state. |
| `Clock`, `systemClock` | Time and timers; `systemClock` chains timeouts past setTimeout's 24.8-day cap. Tests pass a manual clock. |
| `cronIssue(cron, timezone?)`, `machineTimeZone()` | croner's reason for refusing a cron or zone; the zone used when a schedule names none. |

### Notifications (Phase 9, brief §10)
| Export | Description |
|--------|-------------|
| `NotificationService({ events, db })` | `page({ before?, limit? })` → `{ items, unread, readSeq, nextBefore? }`: the event log projected through core's `notificationFor`, newest first; `markRead(seq)` moves one persisted read marker forward (never back); `unread()` counts up to 999. |

### Database and event log
| Export | Description |
|--------|-------------|
| `openDatabase(path)` | better-sqlite3 with WAL and foreign keys; applies `MIGRATIONS` not yet recorded in `schema_migrations`, each in a transaction. |
| `EventStore` | `append(event)` validates against core's `RuntimeEvent`, assigns `seq` and `at`, commits, then notifies subscribers; `since(seq, limit)` replays for SSE `Last-Event-ID` and restart recovery; `ofTypes(types, { afterSeq?, beforeSeq?, limit? })` newest first, for projections; `subscribe(listener)`; `latestSeq()`. Updates and deletes are refused by triggers. |

## Tests

```
pnpm --filter @darthsaul/outerworld-ai-runtime test   # vitest with coverage (lines >= 85, branches >= 80)
```

`src/test/no-network.ts` is a Vitest setup file: any `fetch` or socket to a non-loopback host
fails the test. Real-network smoke tests opt out with `OUTERWORLD_ALLOW_NETWORK=1`, set by hand.
