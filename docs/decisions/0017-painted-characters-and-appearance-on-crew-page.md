# ADR-0017: Painted characters, and Appearance on each crew member's page

## Status
Accepted

## Date
2026-11-11

## Context
The owner added pixel-art characters made outside the design's generator (64×64 and 96×96 PNGs,
in `docs/design/station-dashboard/sprites/art/`). The 24 characters of ADR-0013 are drawn from
specs on a 20×26 grid; these cannot be. Crew Select was a tab of its own; the owner wants the
picker on each crew member's page instead.

## Decision
- **Painted characters.** `CHARACTERS` is the 24 drawn characters (`DRAWN_CHARACTERS`, export
  order unchanged) followed by `ART_CHARACTERS`. A painted character carries its art as a PNG data
  URI, generated into `packages/core/src/character-art.ts` by `scripts/character-art.mjs`; core
  stays pure and needs no asset pipeline. A test fails when the module and the PNGs drift.
- **Size.** A painted character draws in a 32×32 box per sprite scale step (64px art at ½, 96px at
  ⅓), pixelated, so it stands about as tall as a drawn one. On a 2× display 64px art lands 1:1.
- **Default looks.** `lookFor` still picks an unset look from the drawn 24 only, so adding art
  never changes anyone's default character. `look` in agent.json accepts every index.
- **Appearance on the crew member's page.** The Crew Select tab is gone; `/crew-select` redirects
  to `/crew`. Each crew member's page opens with an Appearance row: a small stage with (A) assign
  and (B) random, and every character in one row that scrolls sideways. Arrow keys, Home and End
  move the cursor only while focus is in that row; Enter assigns.

## Consequences
- New art is a PNG in `sprites/art/`, an entry in `ART_CHARACTERS`, and a run of the script.
- Some of the first painted set resemble characters from existing films; swap them before any
  public release.
