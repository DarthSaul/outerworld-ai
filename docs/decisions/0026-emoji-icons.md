# ADR-0026: Icons are standard emoji

## Status
Accepted

## Date
2026-11-22

## Context
The ui drew its icons as hand-made pixel glyphs (`PixelIcon`): the System menu's gear, sliders,
and bolt, and every capability icon in core's catalog (tools, props, connectors, skills) on
connector cards, a room's props, and a crew member's "What this crew member can use". The
Commander asked for standard emoji instead, with Settings as the standard gear. The pixel
character sprites stay.

## Decision
`Icon` in ui replaces `PixelIcon`: it draws each icon id as a standard emoji (`ICON_EMOJI`) in
the emoji font (`--st-font-emoji`), hidden from assistive tech as before. Core's icon ids
(`ItemIconName`) are unchanged, so the catalog stays neutral and the glyph choice is a one-file
change in ui. Settings uses ⚙️ (the System button keeps the gear too); `sliders` is gone.
Service logos (`BrandIcon`: Notion, GitHub, Gmail) are the services' own marks, not part of the
icon set, and stay; so do the character sprites.

## Alternatives considered
- **Keep the pixel glyphs.** Matches the 16-bit look, but every new capability needs a new
  drawing. Rejected: the Commander asked for emoji.
- **Emoji for brand logos too.** No emoji stands for Notion, GitHub, or Gmail, and the marks are
  how people recognize the services. Rejected.

## Consequences
- An icon's look now depends on the platform's emoji font; the glyphs differ slightly between
  macOS, Windows, and Linux.
- Emoji draw in their own colors, so an icon no longer takes the text color around it.
- Adding a capability icon is one entry in `ICON_EMOJI`, with no drawing.
