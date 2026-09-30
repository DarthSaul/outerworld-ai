# ADR-0008: One Routine and one ledger per team; handoffs are read authorization

## Status
Superseded by ADR-0010

## Date
2026-09-27

## Context
The brief implied one routine prompt per agent and one ledger file per handoff. The design spec
and UI mock record runs per team and give each team one ledger ("manifest") that a handoff
("relay") carries to a reader team. Routines are created by hand, so their number matters, and
a run record per team is what the Report tab renders. The owner decided both points on
2026-09-27 (design reconciliation A8 and A9).

## Decision
- **One Routine per team.** The generator emits `routines/<teamId>.prompt.md`, which orchestrates
  that team's agents in one session, plus `routines/overseer.prompt.md`. Per-agent state is
  recorded inside the team's run record.
- **One ledger per team.** `ledger/<teamId>.md` with required section headings so the dashboard
  can show a since-last-run diff.
- **A handoff is authorization, not a file.** It says a reader team may read a writer team's
  ledger, with direction. The generator writes the handoff table into the ledger repo's
  `CLAUDE.md` and each prompt; there is no `handoffs/` directory.

## Alternatives considered
- **One Routine per agent.** Rejected: N agents means N hand-created Routines and N connector
  checklists; agents on one team share a permission scope anyway.
- **One ledger file per handoff.** Rejected: a team with two readers would write the same content
  twice; the design's per-team manifest is the natural unit and matches the packet animation
  (one packet per handoff per run when the writer's ledger changed).

## Consequences
- Status files are per team: `status/teams/<teamId>.json` and
  `status/runs/<teamId>/<timestamp>.json`.
- The core schema's `handoff` is `{ id, from, to }`; pairing (A→B and B→A) is detected by
  geometry, not stored.
- The rig accessory derivation reads inbound handoffs per team.
