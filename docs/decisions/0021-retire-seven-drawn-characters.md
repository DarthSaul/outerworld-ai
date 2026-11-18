# ADR-0021: Retire seven drawn characters, add two painted ones, key looks by id

## Status
Accepted

## Date
2026-11-18

## Context
The owner wants a smaller, stronger character set: seven of the 24 drawn characters (RIVET,
SPROCKET, SABLE, TOCK, JUNO, ATLAS, QUILL) go, and new painted art comes in. `look` was an index
into `CHARACTERS` (ADR-0013), so every removal or reorder silently changed saved looks and could
push a saved index out of range, which made the agent fail to load. The owner expects to keep
editing sprites.

## Decision
- `DRAWN_CHARACTERS` drops the seven; the other 17 keep the design export's order. The design
  export (`sprites/characters.json`, `1x/`, `8x/`, the sheet) is left whole as the generator's
  record; core's test checks each kept character against its export entry by id and lists the
  retired ids.
- Two painted characters join `ART_CHARACTERS` after DUSTY: MERLO (Star mage) and SHADE (Hooded
  adept), as `sprites/art/merlo.png` and `shade.png`.
- **`look` is a character id** (`"nova"`, `"dusty"`), the `id` every character already has.
  This replaces ADR-0013's index. Order in `CHARACTERS` is only the picker's order, so adding,
  removing, or reordering sprites never changes anyone's look.
- **Writes** (`PATCH /api/agents/:id`) accept only an id that names a character. **Reads** never
  drop an agent over its look: an id naming a deleted character is a warning, and the agent shows
  its default (`lookFor`); a numeric look from before this ADR is dropped on load with a warning,
  the file untouched.
- `lookFor(agentId, look)` returns a character id; `characterById` finds the character. The
  demo fixture stores ids (vesper `"kestrel"`, wren `"echo"`).

## Consequences
- 26 characters: 17 drawn, then 9 painted.
- Deleting a sprite still in use by a station shows a warning on load, and that agent falls back
  to its default character until a new one is picked.
- A station with numeric looks must rewrite them as ids, or pick again in Appearance.
- `lookFor` defaults still change when the drawn set changes, for agents with no `look`.
