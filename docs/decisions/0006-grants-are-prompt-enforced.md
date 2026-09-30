# ADR-0006: Grants are prompt-enforced and shown as declared

## Status
Superseded by ADR-0010

## Date
2026-09-27

## Context
A grant says a team may use a tool or skill in read or write mode. Routines get their connectors
from the Routine's own configuration, which has no API; this app cannot set or verify them.

## Decision
A grant is enforced by prompt, not by platform. The generator emits (1) the tool allowlist in each
persona file, (2) a skill file under `skills/` when the grant is a skill, and (3) a "before you
create this Routine, enable these connectors" checklist at the top of the routine prompt. The
dashboard shows grants as declared, never as verified. Confirmed by the owner during the intent
interview on 2026-09-27.

## Alternatives considered
- **Verified grants.** The Routine reports which connectors it actually had at run start and the
  dashboard flags drift. Deferred to the roadmap: it needs a status-file field and a prompt
  instruction, and milestone 1 is read-only. The schema tolerates unknown fields so it can be
  added without a version bump.

## Consequences
- The rig derives its shoulder from write grants and its accessory from handoffs and repo access,
  so the permission model is visible on the figure even though it is prompt-enforced.
- `docs/PRIVACY.md` records that connector configuration is the user's, on the Routine.
