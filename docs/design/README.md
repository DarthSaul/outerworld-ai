# Design assets and guidelines

> **Current design: [`station-dashboard/`](station-dashboard/README.md)** (ADR-0013). Its README is
> the spec, `reference/Station Dashboard.dc.html` the prototype, `src/tokens.css` the token source.
> [ADR-0014](../decisions/0014-station-dashboard-revisions.md) amends it:
> - the status drawer replaces the header's counts and radio;
> - the kill switch moves to the footer;
> - Connectors becomes a Settings section;
> - the map pans, zooms, and recenters;
> - the map takes 2fr beside comms and the scanner, and the crew roster merges into the scanner;
> - forms use the pixel checkbox.
>
> [ADR-0018](../decisions/0018-station-three-columns-and-session-handover.md) amends it again: the
> Station is crew | map | COMMS (reference: `station-dashboard/reference/main-station-view.png`),
> COMMS shows one session with a switchable crew member, and the app is up to 1920px wide.

This folder is the only place design assets live. New exports, references, and sprite candidates
go under `station-dashboard/`, in the folder for their kind.

## Index

| Path | What it is | Ships? |
|------|------------|--------|
| `station-dashboard/README.md` | The spec: layout, components, states, motion, assets. | Source doc |
| `station-dashboard/reference/` | The interactive prototype (`Station Dashboard.dc.html` + `support.js`) and reference screenshots. A spec, not code to copy. | No |
| `station-dashboard/src/` | `tokens.css` (the token source), and the prototype's `characterSprites.ts` and `stationSeed.ts`, kept verbatim. | Translated into ui and core |
| `station-dashboard/sprites/1x`, `8x`, `sheet-4x.png`, `characters.json` | Exports of the 17 drawn characters the station offers. Core's test checks every drawn character against them pixel for pixel. | Generated in core |
| `station-dashboard/sprites/art/` | Painted characters, embedded by `scripts/character-art.mjs`. | Yes |
| `station-dashboard/sprites/candidates/` | Painted art that is not offered. `armored-hunter.png` imitates a franchise character. | **Never** |

Rule from the brief: everything shipped is original.

## History

The superseded Reach spec, UI mock, naming workshop, rig parts, generated robot reference art,
and trace studies were deleted in ADR-0024. They remain in git history before that commit.

The milestone 1 fixture (`fixtures/map-demo/`) names its overseer "Ultron" at the owner's request
(a Marvel trademark; replace before any public release).
