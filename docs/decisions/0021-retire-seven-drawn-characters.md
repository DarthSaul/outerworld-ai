# ADR-0021: Retire seven drawn characters, add two painted ones

## Status
Accepted

## Date
2026-11-18

## Context
The owner wants a smaller, stronger character set: seven of the 24 drawn characters (RIVET,
SPROCKET, SABLE, TOCK, JUNO, ATLAS, QUILL) go, and new painted art comes in.

## Decision
- `DRAWN_CHARACTERS` drops the seven; the other 17 keep the design export's order. The design
  export (`sprites/characters.json`, `1x/`, `8x/`, the sheet) is left whole as the generator's
  record; core's test checks each kept character against its export entry by id and lists the
  retired ids.
- Two painted characters join `ART_CHARACTERS` after DUSTY: MERLO (Star mage) and SHADE (Hooded
  adept), as `sprites/art/merlo.png` and `shade.png`.
- `look` stays an index (ADR-0013). There is no migration: a saved `look` past index 4 now points
  at a different character, and `lookFor` defaults change for agents without a `look`. The demo
  fixture is remapped (wren 14 → 11, still ECHO).

## Consequences
- 26 characters: 17 drawn (0–16), then 9 painted (17–25).
- A real station's agent.json `look` values need remapping by hand: drawn indexes shift down past
  each retired one, and painted ones move from 24+k to 17+k.
