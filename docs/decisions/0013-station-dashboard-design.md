# ADR-0013: The station dashboard design replaces the Reach spec, the rig, and light theme

## Status
Accepted

## Date
2026-10-01

## Context
The owner supplied a new high-fidelity design: a 16-bit space-station operations console, with a
Station page (crew roster, station map, Overseer comms, scanner, header and footer vitals) and a
Crew Select page (24 pixel characters). It lives in `docs/design/station-dashboard/`. It replaces
the look in `docs/design/outerworld-spec.dc.html` (the Reach spec) in three ways: it is dark only,
characters are pixel sprites rather than the rig, and it shows things the runtime does not track
yet. The product law still holds: the interface never asserts state the runtime cannot prove.

## Decision
`docs/design/station-dashboard/` is the design source of truth. The Reach spec, UI mock, and rig
studies stay in `docs/design/` marked superseded. Every screen moves to the new visual language.

- **Tokens.** `--st-*` custom properties replace `--ow-*`, still under Tailwind v4
  (ADR-0003 stands for the mechanism). The design's inline values (map style colors, type sizes,
  blink rate) become tokens too, so the literal ban keeps working.
- **Dark only.** There is no light theme and no `data-theme` toggle. CLAUDE.md, CONSTRAINTS.md and
  `browser:verify` drop the two-theme requirement. Reduced motion is still honored: blinking and
  packets stop.
- **Fonts.** Press Start 2P and VT323 are bundled through Fontsource rather than Google Fonts, so
  the app makes no third-party request.
- **Characters.** The 24 sprites replace the rig. `agent.json` gains `look` (a character index),
  edited on Crew Select. `rig` is no longer read and is removed from the schema. The specs and the
  pixel generator are pure data and logic in core; ui draws the grid as SVG at integer scales.
- **Feature by feature** (owner, 2026-10-01). Each design element is either backed by real state
  or adapted until it is:
  1. Mission progress shows the step count and a pulsing bar. There is no percentage, because
     there is no total.
  2. There is no per-agent fuel. The footer fuel bar is station spend today against
     `stationDailyUsd`.
  3. Run states map to mission statuses: queued → QUEUED; running → RUNNING;
     awaiting_consent and blocked_budget → BLOCKED; cancelled and interrupted → HALTED;
     completed → DONE; failed → FAILED, a new status in red.
  4. Crew activity maps the same way. HELD is dropped.
  5. HOLD AGENT becomes STOP RUN, which cancels the agent's active run.
  6. PAUSE drives the kill switch. Its words say runs are stopped, not held.
  7. Hallways draw as one authorized style. There are no PENDING or SEALED statuses and no
     SEAL or AUTHORIZE buttons. Enforcement is still v2.
  8. Hallways can be opened and closed. Small daemon endpoints edit `station.json` lanes and
     do not enforce anything. Routes run orthogonally between doors on the rooms' sides.
  9. A traffic packet runs on the Bridge↔room hallway only while a dispatch to that room runs.
  10. Grants are displayed read-only, as the runtime has them: room props plus connectors
      granted to the room's crew. They are edited where they are today.
  11. Prop object names: web = Radar dish, files = Archive cabinet, memory = Data terminal,
      connector = Transmitter. The real name is shown under each.
  12. Approvals in comms are consents and memory proposals.
  13. An order goes to the Overseer's most recent open session, or to a new one if none is open.
  14. Ambient chatter auto-advances. Its lines are templates filled from live state, plus lines
      that claim nothing (tips).
  15. Radio chatter is the event log, worded by the glossary's notification templates.
  16. TASKS LIVE counts active runs. ALERTS counts blocked runs plus pending approvals.
  17. TOKENS and UPTIME come from small daemon additions: today's tokens on `/api/spend`, and
      `startedAt` on `/api/health`.
  18. Room color, sector, and map position are derived from room order by core layout math, with
      no schema change. The Bridge is the Overseer's room.
  19. Map style (A, B, C) and the CRT overlay are per-viewer preferences in localStorage.
  20. The Overseer portrait slot shows the Overseer's sprite until a portrait is designed.
- **Words.** New terms (Mission, Fuel, Scanner, Radio chatter, Placed objects, Deck,
  Crew Select) are glossary keys used where the design uses them. Existing terms are unchanged.

## Alternatives considered
- **Keep light and dark by deriving a light palette.** Rejected by the owner: it would be
  invented, not designed.
- **Keep the rig beside the sprites.** Rejected: there would be two character systems for one
  agent, and the palette contract would no longer describe what is drawn.
- **Extend the runtime to back every design element** (lane statuses, per-agent hold, token
  fuel, progress). Rejected for now: some of it is v2 in the brief, and the rest is runtime work
  out of proportion to a redesign. The adaptations above keep the product law intact.

## Consequences
- ADR-0003's token mechanism stays. Its light/dark rule and `--ow-*` names are superseded here.
- The rig parts, `RigSprite`, `Character`, `OverseerCharacter`, core `rig.ts` and the Reach map
  components are deleted once nothing uses them.
- `docs/design/README.md` and CLAUDE.md point at the new spec.
- Runtime follow-ups that would unlock more of the design: lane statuses and enforcement (v2),
  per-agent hold, a progress estimate, and per-agent token budgets.
