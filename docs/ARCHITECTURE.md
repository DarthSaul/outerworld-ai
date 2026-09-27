# Architecture

Outerworld AI has two jobs and three packages. This file is a stub that grows with the
milestone; the schema is documented in `SCHEMA.md` (core step) and decisions in `decisions/`.

## The two jobs

1. **Configuration editor.** A Station document (teams, agents, grants, handoffs, overseer) goes
   in; ledger-repo files come out. `packages/generator` does this as pure functions; the CLI is
   the only thing that touches the filesystem.
2. **State renderer.** A ledger repo (status files, run history, team ledgers) goes in; a
   StationState comes out and the map renders it. `packages/core` parses an in-memory file map;
   `apps/web` reads the files from disk; `packages/ui` renders.

Neither job talks to the network. The agents run elsewhere, as Claude Code Routines.

## Package boundaries

```
apps/web ──▶ packages/ui ──▶ packages/core ◀── packages/generator
```

- **core** knows nothing about React or files. Schema (zod), glossary, layout and handoff
  geometry, rig derivation, event model, ledger parsing. Zero runtime dependencies beyond zod.
- **ui** knows nothing about Routines or GitHub. Tokens, the character rig, map and panel
  components, the scripted demo timeline.
- **generator** knows nothing about rendering. Station → files.

The Station and StationState schemas in core are the product's real API; ui and generator both
key off them. Schema versions are recorded in `decisions/`.

## Runtime flow (milestone 1)

```
station.json ──generate──▶ ledger repo ──clone──▶ Routine (cloud) ──commit──▶ ledger repo
                                                                                   │
apps/web (OUTERWORLD_LEDGER_PATH) ◀────────────────────── read status/, ledger/, station.json
```

The dashboard shows the last committed state with a proof line (timestamp, path, commit) on
every reporter view. It never streams.
