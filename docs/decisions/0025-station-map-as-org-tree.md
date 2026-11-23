# ADR-0025: The station map is an org tree under Command

## Status
Accepted

## Date
2026-11-22

## Context
The station map put the Bridge (the Overseer's room, shown as Command) in the middle with the
other rooms in slots around it (ADR-0013 #18), so hallways left the Bridge in every direction.
Past three rooms the picture stopped reading as "the Overseer hands work down to teams". The
Commander asked for Command always at the top and every other room below it, like an org tree.
The lists already lead with the Overseer and Command (Manifest, COMMS, the crew column).

## Decision
Core's `placeRooms` lays the map out as an org tree: the Bridge at the top center, every other
room in rows below it in station order (one centered row up to four rooms, then a grid). Bridge
hallways route like org-chart connectors: a trunk down from the Bridge, a shared bus, and a drop
into each first-row room; a room in a later row is reached down the gutter to its left. Each
placement carries its `row`, and `treeRoute` / `branchTag` in core draw a Bridge hallway and
place its tag on the branch nearest its room. Other hallways keep `routeBetween`.

It is still pure layout math derived from room order (ADR-0013 #18): no schema change, no layout
fields, and only the hallways that exist are drawn, so the tree never asserts a lane the runtime
does not have. The design spec (`docs/design/station-dashboard/README.md`, Viewport) records the
geometry.

## Alternatives considered
- **Keep the Bridge in the middle.** Matches the prototype, but hallways fan out every way and the
  chain of command is not visible. Rejected: the Commander asked for the tree.
- **A true multi-level tree (rooms under rooms).** Lanes do not express hierarchy, and recursive
  delegation is out of scope for v1 (brief §3), so there is no second level to draw. Rejected.
- **One row only, however many rooms.** Rooms become unreadably narrow past five or six. Rejected
  in favor of wrapping into a grid.

## Consequences
- The map always reads top-down from Command, at any room count; `BRIDGE_RECT` is the Bridge's
  rect for one row of rooms.
- Bridge hallways share their trunk and bus segments, so packets on different lanes overlap there;
  each lane's tag sits on its own branch.
- Hallways between two non-Bridge rooms may detour around rooms in the grid, as before.
