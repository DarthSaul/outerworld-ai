# @darthsaul/outerworld-ai-core

Headless core for Outerworld AI: the station runtime's schemas (`station.json`, `agent.json`,
runtime events), the glossary, an SSE parser, pure policy, the station dashboard model and the 24
pixel characters (ADR-0013); plus the milestone 1 schemas and ledger parsing kept for the archive
(ADR-0010). Zero React, zero DOM, zero filesystem. Private package,
consumed in-workspace.

Versioning is ADR-0009. Committed JSON Schemas live in `schema/` and a test fails when they drift
from the zod source (regenerate with `pnpm build && node scripts/write-schemas.mjs`).

## Public API: station runtime

### Config documents (brief §9)
| Export | Description |
|--------|-------------|
| `parseStationConfig(input)` | `Result<StationConfig>` for `station.json`: rooms with props (`web`, `files`, `memory`), lanes between rooms, connectors (http or stdio transport, no secrets: headers and env are rejected), budgets in USD, dispatch policy (`maxDepth` 0 or 1, `autoReview`). Defaults filled; unknown fields kept. Never throws. |
| `parseAgentConfig(input)` | `Result<AgentConfig>` for `agents/<id>/agent.json`: name, `roomId`, `role` (`overseer` \| `crew`), `model`, `approvalMode` (`ask` \| `full`), `connectorGrants`, `schedules` (cron with 5 or 6 fields, IANA time zone, prompt, `catchUp`, `enabled`), optional `look` (0–23, a character index). |
| `stationCrewIssues(station, crew)` | Cross-file rules: agent ids, known rooms, installed connectors, at most one overseer. |
| `StationConfig`, `Room`, `Prop`, `PropKind`, `Lane`, `Connector`, `ConnectorTransport`, `Budgets`, `DispatchPolicy`, `AgentConfig`, `AgentRole`, `ApprovalMode`, `AgentSchedule` | zod schemas and inferred types. |

### Event log (brief §10)
| Export | Description |
|--------|-------------|
| `RuntimeEvent`, `parseRuntimeEvent(input)` | The v1 event union: envelope `{ seq, type, at, agentId?, sessionId?, runId?, payload }`, with the ids each family requires (run, dispatch, and consent events carry agent, session, and run). Payloads keep unknown fields. |
| `foldCrewActivity(state, event)`, `activityOf(state, agentId)`, `CREW_ACTIVITY_EVENT_TYPES` | What each crew member is doing, folded from run events: `idle`, `running`, `awaiting_consent`, `done`, `failed`, `blocked` (budget or kill switch); several runs at once aggregate, waiting for consent first. |
| `notificationFor(event)`, `NOTIFICATION_EVENT_TYPES`, `Notification` | The Notifications projection: `action` (consent, memory proposals), `alert` (failed, interrupted, max steps, budget stop, missed schedule, connector sign-in or error, kill switch), `info` (a scheduled run's result, a finished dispatch, a budget warning). Ids and details only; the words are glossary keys `notification.<kind>`. |
| `EVENT_TYPES`, `EventType`, `EventOf<T>`, `NewRuntimeEvent` | Every type; one event by type; an event before the store assigns `seq` and `at`. |

### Server-sent events
| Export | Description |
|--------|-------------|
| `createSseParser(onMessage)` | Incremental `text/event-stream` parser for fetch-based clients: `push(chunk)`, `lastEventId()`. |

### Glossary
| Export | Description |
|--------|-------------|
| `glossary`, `term(key)`, `GLOSSARY_KEYS` | The only place on-screen words live (brief §4): Room, Crew, Hallway, Prop, COMMS, Commander, Ask first, Full power, … Keys are the neutral code identifiers. |

## Public API: milestone 1 map model

### Schema
| Export | Description |
|--------|-------------|
| `SCHEMA_VERSION` | Current schema version (`1`). |
| `parseStation(input)` | `Result<Station>`: zod parse plus cross-field rules (team refs, allowlist ⊆ team grants, no self or duplicate handoffs, 60-minute minimum interval). Never throws. |
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

### Station dashboard (ADR-0013)
| Export | Description |
|--------|-------------|
| `dashboardModel(input)` | The dashboard as one projection of runtime state. Input is the station config, agents, folded crew activity, recent runs, running dispatches, the active run count and pending proposals. Output is placed rooms (crew, grants as placed objects, alert), routed hallways (label, tag point, traffic), the roster, sorted missions, `liveCount` and `alerts`. |
| `placeRooms(roomIds, bridgeId)`, `routeBetween(a, b, others)`, `pointAlong`, `tagPoint`, `routeLength`, `laneLabel`, `sectorFor` | Layout in percent of the map. The Bridge (the Overseer's room) sits in the middle with the other rooms in slots around it. Hallways route orthogonally (straight, L, Z, then a U detour) around other rooms. |
| `runDisplayStatus`, `crewDisplayStatus`, `sortRuns`, `isLive`, `alertCount`, `initials` | The dashboard's status words, mapped from run states and crew activity. |
| `chatterLines(snapshot)` | The Overseer's ambient lines: glossary keys filled only from proven state, plus tips. |
| `CHARACTERS`, `characterGrid(spec)`, `gridRuns`, `lookFor(id, look)`, `SPRITE_W`, `SPRITE_H` | The 24 pixel characters and their 20×26 grids, checked pixel for pixel against the exported sprites, and a stable look for an agent without one. |

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
