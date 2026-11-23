# @darthsaul/outerworld-ai-core

Headless core for Outerworld AI: the station runtime's schemas (`station.json`, `agent.json`,
runtime events), the glossary, an SSE parser, pure policy, the station dashboard model and the 31
pixel characters (ADR-0013, ADR-0017); plus the milestone 1 schemas and ledger parsing kept for the archive
(ADR-0010). Zero React, zero DOM, zero filesystem. Private package,
consumed in-workspace.

Versioning is ADR-0009. Committed JSON Schemas live in `schema/` and a test fails when they drift
from the zod source (regenerate with `pnpm build && node scripts/write-schemas.mjs`).

## Public API: station runtime

### Config documents (brief §9)
| Export | Description |
|--------|-------------|
| `parseStationConfig(input)` | `Result<StationConfig>` for `station.json`: rooms with props (`web`, `files`, `memory`), lanes between rooms, connectors (http or stdio transport, no secrets: headers and env are rejected), budgets in USD, dispatch policy (`maxDepth` 0–3, `maxRunsPerTree`, `autoReview`), budgets including `perTreeUsd` (missing means 15, `null` no cap). Defaults filled; unknown fields kept. Never throws. |
| `parseAgentConfig(input)` | `Result<AgentConfig>` for `agents/<id>/agent.json`: name, `roomId`, `role` (`overseer` \| `crew`), `model`, `approvalMode` (`ask` \| `full`), `connectorGrants`, `schedules` (cron with 5 or 6 fields, IANA time zone, prompt, `catchUp`, `enabled`), optional `look` (a character id such as `"nova"`; an unknown one is a warning), optional `canDispatch` (ADR-0025). |
| `stationCrewIssues(station, crew)` | Cross-file rules: agent ids, known rooms, installed connectors, at most one overseer. |
| `hasDispatch(agent)`, `dispatchReach(from, station, crew)`, `dispatchTargets(...)` | Dispatch reach (ADR-0025): the Overseer reaches every crew member; crew with `canDispatch` reach roommates and rooms a directed hallway leads to from theirs, never the Overseer. Each target carries `via` (`overseer`, `room`, or `lane` with its id). |
| `checkDispatch({ from, to, depth, station, crew, chain, tree })` | `{ ok }` or a refusal reason, checked in order: has dispatch, delegation on, depth below `maxDepth`, not self, known target, reach (naming the missing hallway or its direction), no cycle, the tree's run cap, the tree's spend cap. |
| `resolveGrants(agent, station, catalog, { depth? })` | Effective tools: `dispatch` (when the agent has it and the run is below the depth limit), `read_session` (Overseer), props, connectors. |
| `checkBudget(budgets, { run, tree?, agentToday, stationToday })`, `effectiveApprovalMode(chain)` | Budget caps narrowest first (run, tree, agent, station; 80% warns). *Ask first* if any agent in a dispatch chain is. |
| `dispatchChain(events, runId)` | Who asked whom for a run, root first, from `dispatch.started` and `run.queued` alone. |
| `StationConfig`, `Room`, `Prop`, `PropKind`, `Lane`, `Connector`, `ConnectorTransport`, `Budgets`, `DispatchPolicy`, `AgentConfig`, `AgentRole`, `ApprovalMode`, `AgentSchedule` | zod schemas and inferred types. |

### Event log (brief §10)
| Export | Description |
|--------|-------------|
| `RuntimeEvent`, `parseRuntimeEvent(input)` | The v1 event union: envelope `{ seq, type, at, agentId?, sessionId?, runId?, payload }`, with the ids each family requires (run, dispatch, and consent events carry agent, session, and run). Payloads keep unknown fields. |
| `foldCrewActivity(state, event)`, `activityOf(state, agentId)`, `CREW_ACTIVITY_EVENT_TYPES` | What each crew member is doing, folded from run events: `idle`, `running`, `awaiting_consent`, `done`, `failed`, `blocked` (budget or kill switch); several runs at once aggregate, waiting for consent first. |
| `notificationFor(event)`, `NOTIFICATION_EVENT_TYPES`, `Notification` | The Notifications projection: `action` (consent, memory proposals), `alert` (failed, interrupted, max steps, budget stop, missed schedule, connector sign-in or error, kill switch), `info` (a scheduled run's result, a finished dispatch, a budget warning, the kill switch cleared). Ids and details only; the words are glossary keys `notification.<kind>`. |
| `EVENT_TYPES`, `EventType`, `EventOf<T>`, `NewRuntimeEvent` | Every type; one event by type; an event before the store assigns `seq` and `at`. |

### Session titles (ADR-0014)
| Export | Description |
|--------|-------------|
| `SUPPORTED_MODELS`, `DEFAULT_MODEL`, `isSupportedModel(id)`, `findModel(id)` | The tested model list (OpenRouter ids, with `anthropicId` and list `pricing` for Claude). |
| `routeModel(id, { anthropic, openrouter })`, `anthropicModelId(id)` | Which provider a model call goes to with the keys present (ADR-0015): Claude to Anthropic when its key is set, otherwise OpenRouter; or why it cannot run (`no_key`, `needs_openrouter`). |
| `ModelSettings`, `resolveModelSettings(agentModel, ...layers)`, `ProviderChoice`, `ReasoningLevel` | A conversation's or scheduled job's model, key, and reasoning level, and how they layer over the crew member's model (ADR-0016). `routeModel` takes the key choice as a third argument. |
| `estimateCostUsd(id, { input, cacheRead, cacheWrite, output })` | USD for one call at list price, or undefined without a known price. |
| `DEFAULT_SESSION_TITLE`, `titlePrompt(firstMessage)`, `TITLE_INSTRUCTIONS` | A new session's title, and the short request that asks a model to name it from the first message (cut to 2,000 characters, passed as data). |
| `cleanTitle(reply)`, `fallbackTitle(message)`, `MAX_TITLE_CHARS` | A model reply as one plain line of at most 60 characters (undefined when nothing usable is left), and the message itself as the title when the model gives none. |

### Skills (ADR-0023)
| Export | Description |
|--------|-------------|
| `parseSkillFile(fileName, text)` → `{ skill?, issues }`, `Skill`, `SkillFrontmatter`, `MAX_SKILL_BYTES` | One skill file: strict `key: value` / `key: [a, b]` frontmatter, then the body. Never throws; a malformed file, a slug that is not the file name, or an empty body is `{ issues }` with no skill. An unknown requirement is kept with a warning. |
| `REQUIREMENTS`, `Requirement`, `isRequirement(value)` | `web`, `files`, `memory`, `dispatch`, `shell`, `media`, `browser`. |
| `isGloballyEnabled(skill, overrides)`, `skillOverride(id, overrides)`, `withSkillOverride(overrides, id, enabled \| null)` | Station-wide on/off: the Commander's override wins over the skill's `default`; `null` clears it. |
| `capabilitiesOf(tools)`, `missingRequirements(skill, caps)` | What a run's tools let it do (web ← `web_fetch`, files ← the file tools, memory ← `remember`, dispatch ← `dispatch`), and what a skill needs beyond that. |
| `selectSkills({ skills, overrides, agentSkills, tools })` → `{ offered, unavailable }`, `skillsForAgent(agent, station, skills)` | Enabled (station-wide ∪ the agent's own) and gated on tools; offered in priority order, the agent's own first. `skillsForAgent` derives the tools from config. |
| `withSkillTool(tools, offeredCount)`, `SKILL_VIEW_TOOL` | The effective tools plus `skill_view` (read, source `skill`) when a skill is offered. |
| `skillsSection(skills)`, `PromptSkills`, `PromptSkill`, `SKILLS_CHAR_BUDGET` | The `# Installed skills` prompt section: an index pointing at `skill_view`, or inline bodies; whole entries within 12,000 characters (the omitted-count note included), the rest counted; nothing at all when no skill is offered or none fits. `assemblePrompt` takes it as `skills`. |
| `skillCatalog(skills, station, agents)`, `agentSkillsView(selection)`, `SkillListItem`, `AgentSkillsView`, `SkillRef`, `UpdateSkillInput` | The catalog and a crew member's view, never with bodies; the `PUT /api/skills/:id` body. |

### Server-sent events
| Export | Description |
|--------|-------------|
| `createSseParser(onMessage)` | Incremental `text/event-stream` parser for fetch-based clients: `push(chunk)`, `lastEventId()`. |

### Glossary
| Export | Description |
|--------|-------------|
| `glossary`, `term(key)`, `GLOSSARY_KEYS` | The only place on-screen words live (brief §4): Room, Crew, Hallway, Prop, COMMS, Commander, Ask first, Full power, … Keys are the neutral code identifiers. |
| `toolDisplay(name)`, `propDisplay(kind)`, `connectorDisplay(name)`, `ItemDisplay`, `ITEM_ICONS`, `ItemIconName` | How a capability reads to people: a title (`web_fetch` → "Web & Browser"), a one-line description, and an icon id, from glossary `item.*` keys. Every built-in tool and prop has an entry; an unknown tool (a connector's own) shows as its name with the `tool` icon. |
| `abilityDisplay(id, name)`, `AbilityDisplay`, `AbilityKind`, `ABILITY_BRANDS`, `AbilityBrand` | An ability as its card shows it: title, one-line description (glossary `ability.*`), kind (`mcp`, or `api` for the Gmail service the runtime calls itself), and the service's logo id. Every connector preset has a logo and description; both Gmail abilities draw Gmail's logo; any other connector reads as a plain MCP server with no logo. |

### Connectors and mail (ADR-0012, ADR-0019, ADR-0022)
| Export | Description |
|--------|-------------|
| `CONNECTOR_PRESETS`, `CONNECTOR_PRESET_IDS`, `NOTION_PRESET`, `GITHUB_PRESET`, `GMAIL_PRESET`, `GMAIL_MCP_PRESET`, `GMAIL_MCP_URL` | The catalog, in order: Notion and GitHub (hosted MCP), Gmail (`{ type: "builtin", service: "gmail" }`, the Gmail REST API), Gmail MCP (Google's preview MCP server). |
| `isPresetAvailable(id)`, `AVAILABLE_PRESET_IDS` | Whether a preset can be added today; Gmail MCP cannot until preview access. `AddConnectorInput` takes only these. |
| `classifyConnectorTool(name, hints, service?)`, `KNOWN_TOOL_CLASSES`, `BUILTIN_TOOL_CLASSES` | Read or write for a connector tool: our map wins over annotations (Notion's tools; for a builtin `service`, that service's map alone, so the Gmail service's generic names never class another server's tools). |
| `ownClientProfile(url)`, `ownClientProfileOf({ url, service })`, `profileSource(transport)`, `needsOwnClient(connector)` | The sign-in profile (scope, extra parameters, setup steps) of a server or builtin service that needs the Commander's own OAuth app. |
| `migrateLegacyGmail(connectors)` | Moves a `gmail` connector at the Gmail MCP URL onto the Gmail service; the same array when there is nothing to move. |
| `buildMessage(draft)`, `buildRawMessage(draft)`, `encodeHeaderValue`, `replySubject`, `replyHeaders` | A plain-text RFC 2822 draft (base64 UTF-8 body, RFC 2047 subject, line breaks in headers refused), and as Gmail's base64url `raw`; a reply's subject and `In-Reply-To`/`References`. |
| `readThread`, `readMessage`, `summarizeThread`, `messageText`, `htmlToText`, `header`, `MAX_BODY_CHARS` | Gmail's parsed messages as text for the model: headers, plain-text body (HTML made readable, decoded in its charset, capped), labels, attachment names; a one-line thread summary. |
| `toBase64`, `toBase64Url`, `fromBase64` | Base64 without Buffer or the DOM. |

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
| `dashboardModel(input)` | The dashboard as one projection of runtime state. Input is the station config, agents, folded crew activity, recent runs, running dispatches (worker, and lead when it is crew, so traffic runs on the hallway it used), the active run count and pending proposals. Output is placed rooms (crew, grants as placed objects, alert), routed hallways (label, tag point, traffic), the roster, sorted missions, `liveCount` and `alerts`. |
| `placeRooms(roomIds, bridgeId)`, `routeBetween(a, b, others)`, `pointAlong`, `tagPoint`, `routeLength`, `laneLabel`, `sectorFor` | Layout in percent of the map. The Bridge (the Overseer's room) sits in the middle with the other rooms in slots around it. Hallways route orthogonally (straight, L, Z, then a U detour) around other rooms. |
| `runDisplayStatus`, `crewDisplayStatus`, `sortRuns`, `isLive`, `alertCount`, `initials` | The dashboard's status words, mapped from run states and crew activity. |
| `overseerFirst(crew)` | The crew in listing order: the Overseer first, everyone else in the order given. |
| `chatterLines(snapshot)` | The Overseer's ambient lines: glossary keys filled only from proven state, plus tips. |
| `CHARACTERS`, `characterById(id)`, `characterGrid(spec)`, `gridRuns`, `lookFor(id, look)`, `SPRITE_W`, `SPRITE_H` | The 26 characters in the picker's order (9 painted, `ART_CHARACTERS`, then 17 drawn 20×26 grids, `DRAWN_CHARACTERS`), checked pixel for pixel against the exported sprites; lookup by id; and the character id an agent appears as (its `look` if that names a character, else a stable drawn one). Order is display only: a saved look is an id. |

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
