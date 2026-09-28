# Schema and contracts

The Station and StationState schemas are the product's real API. `packages/core` defines them
with zod, exports JSON Schema, and provides the pure functions that ui and generator build on.
This document is the contract; the code follows it. Status: **implemented in core, 2026-09-27**; kept current with the code. Sections marked *generator* are documented fully in the generator step.

Conventions: neutral vocabulary (ADR-0002); collections are lowercase plural arrays, references
are singular `<thing>Id` strings; ids are `^[a-z0-9][a-z0-9-]*$` and unique within their
collection; timestamps are ISO 8601 UTC strings; every object tolerates unknown fields
(`.passthrough()`), so additive changes need no version bump (ADR-0009).

## 1. Station (config the user owns)

```ts
Station = {
  schemaVersion: 1,
  id: string,                      // the station's own id, e.g. "demo-station"
  name: string,                    // display name
  teams: Team[],                   // 1..n
  agents: Agent[],                 // each belongs to exactly one team
  grants: Grant[],                 // each belongs to exactly one team
  handoffs: Handoff[],             // directional; A→B and B→A are two records
  overseer: Overseer,              // singleton
}

Team = {
  id: string,
  name: string,
  mission: string,                 // required, one line
  category: "research" | "build" | "operations" | "records" | "coordination" | "other",
  emblem: { hue: number /* 0..360 */, mark: "spire" | "forge" | "dome" | "archive" | "beacon" | "none" },
  scope: {
    repos: string[],               // GitHub "owner/name" strings the team's Routine may clone
  },
  schedule: {
    kind: "interval", everyMinutes: number /* >= 60, Routines' minimum */,
  } | {
    kind: "cron", expression: string, timezone: string,
  },
}

Grant = {
  id: string,
  teamId: string,
  tool: string,                    // connector or skill id, e.g. "notion", "git", "discord", "skill:release-notes"
  mode: "read" | "write",
  kind: "connector" | "skill",     // connector: enable on the Routine; skill: emitted under skills/
  label?: string,                  // display override; defaults to tool
}

Agent = {
  id: string,
  teamId: string,
  persona: {
    name: string,
    mandate: string,               // one line, what this agent is for
    tone: string,                  // free text, goes into the persona file
    allowlist: string[],           // grant ids; must be a subset of the team's grants (validated)
    rig: {
      tintHue: number,             // 0..360, chrome tint
      trimHue: number,             // 0..360, trim metal
      head: "dome" | "wedge" | "crest",   // crest is reserved for the overseer (validated)
      trace: "core" | "bar" | "chevron" | "split" | "frame" | "twin",  // frame reserved for the overseer (validated)
    },
  },
}

Handoff = {
  id: string,
  from: string,                    // writer teamId
  to: string,                      // reader teamId; from !== to (validated); (from,to) unique (validated)
  note?: string,                   // why this lane exists; goes into CLAUDE.md
}

Overseer = {
  persona: { name: string, mandate: string, tone: string },   // rig is fixed: crest + frame, achromatic
  schedule: Team["schedule"],
  outward: { kind: "discord-webhook" },                        // the only channel in milestone 1; URL is never here
}
```

Cross-field validation (all produce structured issues, never throws): every `agent.teamId`,
`grant.teamId`, `handoff.from/to` resolves; `allowlist ⊆ team grants`; no self-handoff; no
duplicate `(from, to)`; `crest`/`frame` not used by agents; `everyMinutes >= 60`; ids unique.

Derived, never stored: layout positions, handoff pairing, rig shoulder and accessory, palette
colors from hues.

## 2. Ledger repo layout (what the generator writes, what core reads)

```
CLAUDE.md                        # for the Routine: purpose, teams, handoff table, ledger rules, status rules
station.json                     # copy of the Station document
agents/<agentId>.md              # persona: name, mandate, tone, allowlist, rig (for the record)
skills/<skillId>/SKILL.md        # one per grant with kind "skill"
routines/<teamId>.prompt.md      # the prompt to paste into the Routine, with a setup checklist header
routines/overseer.prompt.md
ledger/<teamId>.md               # the team's ledger (below)
scripts/post-digest.sh           # posts status/digest.md to $DISCORD_WEBHOOK_URL
status/README.md                 # the JSON contract, copied from this section
status/teams/<teamId>.json       # latest state of the team (TeamStatus)
status/runs/<teamId>/<startedAt>.json   # one RunRecord per run, filename = startedAt with ':' → '-'
status/overseer.json             # OverseerStatus
status/digest.md                 # the overseer's last outward post (Markdown)
```

Routines commit status changes to the default branch (their own repo, only the owner's commits,
so the push check passes); if the push is rejected they push `claude/status` and the prompt says
so in the run's `notes`. The dashboard reads whichever checkout is at `OUTERWORLD_LEDGER_PATH`.

### Team ledger (`ledger/<teamId>.md`)

Markdown with a fixed skeleton the Routine must keep, so the diff view has stable anchors:

```
# <Team name> · ledger
<!-- ow:ledger v1 · team:<teamId> -->

## Next steps
- ...

## Waiting on
- ...

## Log
- <ISO timestamp> · <one line>
```

Headings are matched exactly. Anything else is preserved but not interpreted.

### Status files

```ts
RunRecord = {
  schemaVersion: 1,
  teamId: string,
  startedAt: string,
  endedAt?: string,                // absent while the run is open
  outcome?: "done" | "failed",     // absent while open; a missing endedAt older than the schedule → stalled (derived)
  sessionId?: string,              // from CLAUDE_CODE_REMOTE_SESSION_ID
  sessionUrl?: string,
  agents: Array<{ agentId: string, state: "idle" | "working" | "done" | "failed", note?: string }>,
  grantsUsed: Array<{ grantId: string, count: number }>,
  ledger: { changed: boolean, linesAdded: number, linesRemoved: number, summary?: string },
  error?: string,                  // when outcome is failed
  notes?: string,
}

TeamStatus = {
  schemaVersion: 1,
  teamId: string,
  updatedAt: string,
  lastRunStartedAt?: string,       // pointer into status/runs/
  agents: RunRecord["agents"],     // last known per-agent state
  ledgerPath: string,              // "ledger/<teamId>.md"
}

OverseerStatus = {
  schemaVersion: 1,
  updatedAt: string,
  state: "idle" | "reconciling" | "reported" | "attention",
  lastRunStartedAt?: string,
  lastOutwardPostAt?: string,
  reconciled: number,              // ledgers read in the last run
  attention: Array<{ teamId: string, reason: string }>,
  digestPath: "status/digest.md",
}
```

## 3. StationState (derived by core from the ledger)

```ts
StationState = {
  schemaVersion: 1,
  provenance: {
    asOf: string,                  // newest timestamp seen in status/, or the read time when none
    sourceRef?: string,            // commit sha if the reader supplies it
    sourcePath: string,            // the ledger root as given
  },
  teams: Record<teamId, {
    health: "ok" | "attention" | "stalled",
    healthReason?: string,
    run: "idle" | "working" | "done" | "failed",     // from the latest RunRecord
    lastRun?: RunSummary,
    recentRuns: RunSummary[],      // newest first, at most 6
    ledger: { path: string, exists: boolean, sections?: LedgerSections, changedInLastRun: boolean },
    degraded: boolean,             // last run older than 24 h
  }>,
  agents: Record<agentId, { state: "idle" | "working" | "done" | "failed", note?: string }>,
  handoffs: Record<handoffId, { carrying: boolean }>,   // true when the writer's ledger changed in its last run
  overseer: OverseerStatus-like + { digest?: string },
  issues: Issue[],                 // everything the parser could not prove, never thrown
}

Issue = { level: "warn" | "error", path: string, message: string }
RunSummary = pick(RunRecord, startedAt, endedAt, outcome, sessionUrl, grantsUsed, ledger, error)
LedgerSections = { nextSteps: string[], waitingOn: string[], log: string[] }
```

Health derivation (pure, tested):
- `stalled` when the latest run started more than `2 × schedule interval` ago, or an open run has
  no `endedAt` and started more than `2 × schedule interval` ago, or there is no run at all and
  the ledger exists.
- `attention` when the latest run's outcome is `failed`, or the overseer's `attention` list names
  the team, or a status file for the team was malformed (issue recorded).
- `ok` otherwise. Cron schedules use the gap between the two most recent runs as the interval,
  falling back to 24 h.

Run state: `working` when the latest RunRecord has no `endedAt` and is not stalled; otherwise
the outcome, or `idle` when there is no record. Agent state comes from the latest RunRecord's
`agents` entry, defaulting to `idle`.

## 4. Core public API

```ts
// schema
parseStation(input: unknown): Result<Station>
parseStationState(input: unknown): Result<StationState>
Result<T> = { ok: true, value: T, issues: Issue[] } | { ok: false, issues: Issue[] }
stationJsonSchema, stationStateJsonSchema, runRecordJsonSchema, teamStatusJsonSchema, overseerStatusJsonSchema
SCHEMA_VERSION = 1

// ledger
parseLedger(station: Station, files: LedgerFiles, options?: { now?: string, sourceRef?: string, sourcePath?: string }): StationState
LedgerFiles = Record<string /* path relative to ledger root, posix */, string /* contents */>
parseLedgerMarkdown(text: string): LedgerSections | undefined   // undefined only when neither the marker nor a known heading is present

// events
StationEvent =
  | { type: "run.started", teamId, at }
  | { type: "agent.state", teamId, agentId, state, at }
  | { type: "ledger.written", teamId, at, linesAdded, linesRemoved }
  | { type: "run.finished", teamId, at, outcome: "done" | "failed", error? }
  | { type: "overseer.state", state, at }
  | { type: "digest.posted", at }
applyEvent(state: StationState, event: StationEvent, station: Station): StationState   // pure, returns a new object
bindReducer(station: Station): (state, event) => StationState                          // the two-argument form for reducers
emptyState(station: Station, { now, sourcePath, sourceRef? }): StationState             // all idle, all ok, no runs

// layout (abstract 1000×1000 unit square, origin top-left)
layoutStation(station: Station): Layout
Layout = {
  overseer: { x, y, w, h },
  teams: Record<teamId, { x, y, w, h, ring: 0 | 1 }>,
  mode: "columns" | "list",       // overseer at the right edge, teams in columns to its left; list above 16 teams
}
handoffGeometry(handoff: Handoff, layout: Layout, all: Handoff[]): HandoffGeometry
HandoffGeometry = { path: string /* SVG d, cubic */, midpoint: {x,y}, angle: number, chevronAt: {x,y}, paired: boolean, side: -1 | 0 | 1 }

// rig
deriveRig(agent: Agent, station: Station): { shoulder: "ball" | "pauldron", accessory: "antenna" | "thruster" | "plate" | "none" }
overseerRig(): { head: "crest", trace: "frame", shoulder: "pauldron", accessory: "crest" }

// glossary
glossary: Record<GlossaryKey, string>   // the only place themed display strings live
term(key: GlossaryKey): string
GlossaryKey = "station" | "team" | "teams" | "scope" | "grant" | "grants" | "grant.read" | "grant.write" | "grant.verb"
  | "handoff" | "handoffs" | "agent" | "agents" | "persona" | "ledger" | "run" | "runs" | "overseer"
  | "emblem" | "health.ok" | "health.attention" | "health.stalled" | "run.idle" | "run.working" | "run.done" | "run.failed"
  | "empty.handoffs.title" | "empty.handoffs.body" | "eyebrow.team" | ...
```

Glossary contents (simplified 2026-09-27, reconciliation A20): station "the Reach", team
"Station", scope "Standing orders", grant "Tool", handoff "Handoff", agent "Agent", persona
"Persona", ledger "Station Report", system report (the digest) "System Report", run "Routine run", overseer role "Overseer". Health and run words
stay plain. The overseer's proper name comes from its persona.

## 5. Fixture (`fixtures/demo-station/`)

A fictional person's Station: two teams, three agents, one overseer named "Ultron" (owner's choice; a placeholder to replace before public release).
- `project-management` (category operations, emblem dome, hue 230): agents `planner` (working)
  and `scribe` (idle); grants notion read, ledger write; interval 360 min; last run open.
- `strength-app` (category build, emblem forge, hue 55): agent `builder` (failed); grants git
  read, notion read, ledger write, discord write; interval 360 min; last run failed 26 h ago,
  so health is `stalled` and `degraded` is true.
- Handoffs: `strength-app → project-management` and `project-management → strength-app`
  (a pair), the first carrying.
- Overseer state `attention`, one attention entry for `strength-app`, a digest file.
The scripted demo timeline (ui step) walks: run.started → agent working → ledger.written →
run.finished done → overseer reconciling → digest.posted.

## 6. Generator: CLI and emitted files

Implemented 2026-09-27. `packages/generator` turns a Station document into the
files a private ledger repo needs. Pure functions produce `{ path, contents }` records; the CLI
is the only place `node:fs` appears.

### CLI

```
outerworld generate --station <path/to/station.json> --out <dir> [--dry-run] [--force]
outerworld validate --station <path/to/station.json>
```

- `generate` validates the Station (same rules as core's `parseStation`), emits the file set,
  and writes it under `--out`. It refuses to overwrite `ledger/*.md`, `status/**`, or
  `station.json` when they already exist unless `--force`, because those are the user's and
  the Routines' data; everything else (personas, skills, prompts, `CLAUDE.md`, the script) is
  regenerated on every run. `--dry-run` prints the file list with sizes and writes nothing.
- Exit codes: `0` written (or dry run), `1` invalid station (issues printed as `path: message`),
  `2` could not read or write (the OS error, no stack).
- Output is deterministic: same Station, same bytes. Files are sorted by path.

### Emitted layout

```
CLAUDE.md                        the ledger repo's agent guide: what this repo is, the teams, the
                                 handoff table (who may read whose station report), the status
                                 contract, and the rules every Routine follows
station.json                     the Station document, verbatim (pretty-printed)
agents/<agentId>.md              persona: name, mandate, tone, allowlist, rig (for the record)
skills/<skillId>/SKILL.md        one per grant with kind "skill" (skillId = the grant's tool id)
routines/<teamId>.prompt.md      the prompt to paste into the Routine, with a setup header
routines/overseer.prompt.md      the overseer's prompt
ledger/<teamId>.md               the team's station report skeleton (fixed headings)
scripts/post-digest.sh           posts status/digest.md to $DISCORD_WEBHOOK_URL; fails loudly if unset
status/README.md                 the status JSON contract (schemas in section 2), stamped with the
                                 schema version; status/teams/ and status/runs/ hold .gitkeep
```

### Routine prompt shape (`routines/<teamId>.prompt.md`)

1. **Setup checklist** (a fenced block at the top, for the human creating the Routine): the
   repository to attach, which connectors to keep enabled (from the team's connector grants)
   and a reminder that every other connector should be removed, the schedule (interval or cron
   from the Station), the environment variable the overseer needs (`DISCORD_WEBHOOK_URL`) and the
   network allow-list entry for `discord.com`, and the two ways to create it: claude.ai/code/routines
   or `/schedule` in the CLI. Facts come from the Claude Code docs; nothing is invented.
2. **Identity**: team name, mission, the agents and their personas (linked to `agents/*.md`).
3. **Allowed tools**: the team's grants with modes, restated as rules the prompt enforces.
4. **Handoffs**: which station reports this team may read (inbound) and that its own report is
   read by whom (outbound), with paths.
5. **Procedure**: read `ledger/<teamId>.md`, read inbound reports, do the mission, update the
   three fixed sections of the station report, write the status files, commit to the default
   branch with a conventional message (fall back to `claude/status` if the push is rejected).
6. **Status contract**: exact JSON shapes for `status/teams/<teamId>.json` and
   `status/runs/<teamId>/<startedAt>.json`, with `CLAUDE_CODE_REMOTE_SESSION_ID` for the session
   link. Filenames use the ISO start time with `:` replaced by `-`.

The overseer prompt reads every station report and status file, writes `status/overseer.json`
and `status/digest.md`, runs `scripts/post-digest.sh`, and commits.

### Public API

```ts
emitLedger(station: Station, options?: { generatedAt?: string }): EmittedFile[]
// individual emitters, all pure:
emitClaudeMd, emitStationJson, emitAgentPersona, emitSkill, emitRoutinePrompt,
emitOverseerPrompt, emitLedgerSkeleton, emitPostDigestScript, emitStatusReadme
protectedPaths(files: EmittedFile[]): string[]   // ledger/*.md, status/**, station.json
```

`generatedAt` stamps headers; the fixture snapshot uses a fixed value so output is stable.
