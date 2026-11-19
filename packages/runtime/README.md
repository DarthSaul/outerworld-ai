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
| `CrewService({ home, events, connectorTools? })` | `view()`, `agent(id)` (config, documents, effective tools from core's `resolveGrants`), `createAgent`, `updateAgent`, `putDocument`, `deleteAgent` (keeps the workspace), `createRoom`, `updateRoom`, `deleteRoom` (refused while crew or hallways use it), `addSchedule` / `updateSchedule` / `removeSchedule` (every cron checked with croner), `updateBudgets`, `onboard({ overseerName, tone, stationName? })` (an empty station only: station.json with the Command room and `DEFAULT_BUDGETS`, and the Overseer), `addFromTemplate("project-manager", { name? })` (adds the Operations room, a hallway to Command, and the Notion connector when missing; daily briefing disabled). Reads from disk every call; writes run one at a time, are validated across the whole station, and emit `agent.updated` / `station.updated`. Refuses only errors a change would introduce. |
| `NotFoundError`, `ConflictError` | What the daemon maps to 404 and 409; `ConflictError.issues` says why. |
| `CrewService({ …, skills? })` | With the skills library: `skills()` → the catalog (core `skillCatalog`), `setSkillOverride(id, enabled \| null)` (writes `station.json`, emits `station.updated`, 404 for an unknown skill), and each `AgentView` carries `skills` and `skill_view` from the same selection a run makes. |

### Skills (ADR-0023)
| Export | Description |
|--------|-------------|
| `loadSkillLibrary(dir)` → `{ skills, issues }`, `BUNDLED_SKILLS_DIR` | Parses every `.md` skill in a folder; skips a malformed, oversized, misnamed, or symlinked file with an issue. Never throws; a missing folder is an empty library. The bundled library is `skills/library/` in this package, with its `LICENSE` and `NOTICE.md`. |
| `createSkillViewTool({ home, skills })` | `skill_view` (read): returns `{ id, name, body }` for a skill the calling run listed at setup (the `skills` ids in the tool context) that is still offered to the agent now, recomputed from config; refuses any other. |
| `RunService({ …, skills? })` | Each run gates the library on the tools it can call, adds `skill_view` when a skill is offered, and puts an index (with `skill_view`) or the bodies (without) in the prompt, and passes the offered ids to every tool call as `skills`. Without `skills`, prompts are unchanged. |

### Sessions and session titles (ADR-0014)
| Export | Description |
|--------|-------------|
| `SessionStore.sessionSummaries(agentId?, { includeArchived? })` → `SessionSummary[]` | An agent's sessions (every agent's when `agentId` is omitted), most recently active first, each with `messageCount`, `lastMessageAt`, `lastMessage` (the newest user or assistant line with text, clipped to 160 characters), `active` (a run is queued, running, or waiting for consent), and `origin` (`dispatch` when a dispatch opened it for its worker, else `commander`). |
| `RunService.reassignSession(sessionId, agentId)` → `Promise<SessionRecord>` | Hands a conversation to another crew member; the transcript stays and the next run is theirs. Refused for an unknown agent, while a run is going, and for a dispatched worker's session. Logs `session.reassigned {from, to}` (ADR-0018). |
| `liveModels({ openrouter, anthropic? })`, `openRouterModels(keys)`, `scriptedModels()` | Model factories: real providers routed by core's `routeModel` (ADR-0015), OpenRouter only, or the scripted fake. Keys are read per run. |
| `ApiKeyService({ store, env, provider? })`, `OPENROUTER_PROVIDER`, `ANTHROPIC_PROVIDER` | One provider's key: keychain first, env fallback, checked with the provider before storing; reports only whether it is set. |
| `RunService({ …, titles? })` | With `titles: true`, the first message of a session still titled "New session" names it: one short call to the crew member's model beside the run, budget-checked and recorded as that run's spend, falling back to the message itself. Emits `session.renamed`; a name the Commander set first is kept. |

### Scheduler (Phase 8, brief §13)
| Export | Description |
|--------|-------------|
| `Scheduler({ home, runs, sessions, events, store, clock?, timezone? })` | `start()` records or catches up (once, with `catchUp`) an occurrence missed while the daemon was down, arms every enabled schedule, and re-arms on `agent.updated` / `station.updated`; `reload()`, `stop()`, `idle()`, `view(agentId)` → `ScheduleView[]` (effective zone, next run, error, last 10 fires), `runNow(agentId, scheduleId)`. A run goes into the schedule's configured session or its own "Scheduled" session through `RunService`, so grants, approval mode, and budgets apply. An occurrence is `schedule.missed` (`down`, `busy`, `stopped`, `error`) when it cannot run. New, edited, and re-enabled schedules count from the moment they are armed. |
| `ScheduleStore(db)` | Per schedule: the config it was armed with, the last occurrence accounted for, its session; and a history of fires joined to the run's state. |
| `Clock`, `systemClock` | Time and timers; `systemClock` chains timeouts past setTimeout's 24.8-day cap. Tests pass a manual clock. |
| `cronIssue(cron, timezone?)`, `machineTimeZone()` | croner's reason for refusing a cron or zone; the zone used when a schedule names none. |

### Crew activity (Phase 9, D24)
| Export | Description |
|--------|-------------|
| `crewActivity(events)` | What each crew member is doing now: the last 5000 run events folded with core's `foldCrewActivity`, as `{ [agentId]: CrewActivityEntry }`. The station map renders it. |

### Notifications (Phase 9, brief §10)
| Export | Description |
|--------|-------------|
| `NotificationService({ events, db })` | `page({ before?, limit? })` → `{ items, unread, readSeq, nextBefore? }`: the event log projected through core's `notificationFor`, newest first; `markRead(seq)` moves one persisted read marker forward (never back); `unread()` counts up to 999. |

### Connectors and the Gmail service (ADR-0012, ADR-0019, ADR-0022)
| Export | Description |
|--------|-------------|
| `ConnectorManager({ home, events, secrets, redirectUrl, transports?, signIn?, fetch? })` | Connects the station's connectors, keeps them up, signs in (OAuth in the keychain, the Commander's own client where needed), classifies tools, and reports `connector.status` events. HTTP connectors go over streamable HTTP; the Gmail service (`builtin`) goes over an in-memory MCP adapter, with `fetch` for Google. |
| `KeychainOAuthProvider`, `connectorSecretKey(id, server, kind)` | One connector's sign-in: own client, tokens, registration in the keychain; verifier and `state` in memory. |
| `GmailApi({ fetch, token })` | Gmail REST API v1 as `users/me`: `searchThreads`, `getThread`, `listLabels`, `createDraft` (a reply goes in its thread with the threading headers; nothing sends), `modifyThreadLabels`, `trashThread`. A 401 is retried once with a renewed token. |
| `createGmailServer(api, { onSignInRequired? })`, `gmailTransport(provider, fetch)` | The six Gmail tools as an in-process MCP server, and the transport the manager connects to it (with `finishAuth` for the callback's code). |
| `startGoogleSignIn`, `finishGoogleSignIn`, `googleAccessToken`, `SignInRequiredError` | Google's OAuth with the Commander's client: PKCE S256 authorization URL; code exchange storing `expires_at`; a current access token, renewed a minute early, with a refused renewal deleting the tokens. |
| `migrateLegacyGmailConnector({ home, secrets, events? })` | Once at daemon start: a `gmail` connector at the Gmail MCP URL becomes the Gmail service; the saved OAuth app moves over, the MCP tokens are deleted. |

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
