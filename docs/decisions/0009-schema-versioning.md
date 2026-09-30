# ADR-0009: Schema versioning strategy

## Status
Accepted

The versioning rules apply to `station.json` and `agent.json` from ADR-0010 on. References to the
ledger repo, status files, Routines, and the generator are historical (milestone 1).

## Date
2026-09-27

## Context
The Station document is written into users' private ledger repos and read back by this app and
by Routines. Status files are written by Routines (an LLM following a prompt) and read by this
app. Both sides will evolve. Users will not upgrade in lockstep, and a ledger repo may contain
status files written by an older prompt next to a `station.json` written by a newer app.

## Decision
- One integer `schemaVersion` on every top-level document: Station, RunRecord, TeamStatus,
  OverseerStatus, and the derived StationState. Exported as `SCHEMA_VERSION` from core.
- **Additive changes do not bump the version.** Every object is parsed with `.passthrough()`, new
  fields are optional with defaults, and readers ignore what they do not know. This is the normal
  kind of change.
- **A breaking change bumps the version** and ships with a pure `migrate(document) → document`
  function in core from each previous version, so `parseStation` accepts any version it has a
  migration for and reports `issues` of level `warn` naming the migration applied.
- A document with a version newer than the build's is parsed on a best-effort basis: known fields
  are read, and an `issue` of level `warn` says the app is older than the file. It is never
  rejected outright, because the dashboard's job is to show what it can prove.
- The generator stamps the version it emits for (`GENERATOR_SCHEMA_VERSION`) into the ledger
  repo's `status/README.md`, so a Routine writes the format the app expects.
- JSON Schema files are committed under `packages/core/schema/` and a test fails when they drift
  from the zod source, so the version's shape is reviewable in diffs.

## Alternatives considered
- **Semver strings.** Rejected: the minor/patch distinction adds nothing when additive changes
  are already tolerated by construction; an integer is what the prompt can copy reliably.
- **No version, rely on passthrough only.** Rejected: a breaking change would have no signal.
- **Reject newer documents.** Rejected: contradicts "never assert state it can't prove"; a warn
  issue plus best-effort read is more honest than a blank map.

## Consequences
- Adding a field is a one-line schema change plus a fixture update.
- Breaking changes are rare, visible (a migration function with tests), and recorded in an ADR
  that supersedes this one's table of versions.
- The floor guard's threshold rules do not cover schema versions; review does.
