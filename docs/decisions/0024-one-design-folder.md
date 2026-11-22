# ADR-0024: One design folder; drop the Reach-era docs and the retired sprite exports

## Status
Accepted. Amends ADR-0021 (the design export is no longer kept whole) and ADR-0013 (the Reach
spec, UI mock, and rig studies are no longer kept in `docs/design/`).

## Date
2026-11-22

## Context
Design assets lived in two places. `docs/design/` was tracked. An untracked `design-spec/` at the
repo root served as the owner's drop folder, so worktrees never saw it, and one `git add -A` in
the main checkout would have published it. Almost everything in `design-spec/` already had a
byte-identical copy in `docs/design/station-dashboard/`. The rest was an older README, the old
`manifest.json`, and raw PixelLab exports, nine of which are the committed `sprites/art/` PNGs.

`docs/design/` also still held the superseded Reach spec, UI mock, naming workshop, rig parts,
generated robot reference art ("never ship, never trace"), and trace studies. ADR-0021 kept the
seven retired drawn characters in the export as the generator's record.

## Decision
- `docs/design/` is the only design folder, and it is tracked. New assets go under
  `station-dashboard/`. `design-spec/` is removed.
- Delete the Reach-era files: `outerworld-spec.dc.html`, `outerworld-ui.dc.html`,
  `naming-workshop.dc.html`, `support.js`, `.thumbnail`, `assets/`, `reference/`, `rig/`, and
  `studies/`. Git history keeps them.
- Delete the exports of the seven retired drawn characters (RIVET, SABLE, TOCK, SPROCKET, QUILL,
  ATLAS, JUNO): their `1x` and `8x` PNGs, their `characters.json` entries, and their cells on
  `sheet-4x.png`. The sheet is rebuilt from the kept cells (6×3, export order) and checked pixel
  for pixel against the 1x PNGs. File numbers and `index` keep the prototype's numbering.
- The prototype (`reference/Station Dashboard.dc.html`, `src/characterSprites.ts`,
  `src/stationSeed.ts`) stays verbatim and still draws all 24. Its looks are indices, so pruning
  it would shift them.
- One unused PixelLab export joins `sprites/candidates/armored-hunter.png` at the owner's request.
  It imitates a franchise character: never ship it or trace it.
- Two Claude.ai screenshots from `design-spec/reference/` are not committed, because one shows
  the owner's own artifact titles and the repo is public.

## Alternatives considered
- **Ignore `design-spec/`** and copy it into worktrees with `.worktreeinclude`. This keeps assets
  private, but leaves two design folders. Rejected by the owner.
- **Keep the retired exports (ADR-0021).** This keeps the export whole, but leaves the exports
  disagreeing with what the station offers. Rejected by the owner.

## Consequences
- Core's character test compares `DRAWN_CHARACTERS` with `characters.json` directly, with no
  retired list.
- Bringing back a retired character means regenerating its export from the prototype.
- The brief, older ADRs, and `docs/specs/design-reconciliation.md` still mention the deleted files
  as history.
