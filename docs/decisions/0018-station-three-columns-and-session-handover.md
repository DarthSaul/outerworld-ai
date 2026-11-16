# ADR-0018: Station in three columns, and handing a session to another crew member

## Status
Accepted

## Date
2026-11-16

## Context
The owner supplied a layout reference (`docs/design/station-dashboard/reference/main-station-view.png`).
It shows the Station as CREW | MAP | COMMS. COMMS shows one conversation, chosen from a
station-wide session list, and its answering crew member can be switched. Before this, the Station
was the map beside a column that held comms tabs (Overseer comms, Crew comms) over the scanner
(ADR-0014). The header and footer were also a page padding narrower than the screens between them.

## Decision
- **Three columns.** On desktop the Station is crew, map, and comms, 1fr / 2fr / 1fr. The handle
  between the map and comms still resizes comms, now 0.75fr to 1.5fr of 4fr. Phones stack the
  map, crew, comms, then the scanner.
- **Crew column.** The roster (pick a crew member to scan them), a working / idle count, then
  every session on the station, newest activity first. An All / Dispatched filter and New (clears
  COMMS for a new conversation) sit above the list. Search and projects from the reference are
  not built. The caret in the strip folds the column away, kept per viewer
  (`outerworld.crewColumn`). A folded column leaves a folder tab on the left edge, and its 1fr
  goes to the map.
- **COMMS column.** The strip has COMMS and Expand. Expand widens COMMS across the row and hides
  crew and map; Collapse brings them back. Under the strip, the agent row is a crew dropdown.
  - **With a session open**, picking someone else hands the conversation to them.
  - **With none open**, it picks who the first message goes to (the Overseer by default). The
    approvals and chatter card and the message box sit below. The first message starts a new
    session, which opens.
  - The open session is kept per viewer (`outerworld.commsSession`; the old
    `outerworld.overseerOrder` is read once and moved). It is dropped once archived or gone.
  - The Overseer comms and Crew comms tabs are removed.
- **Scanner** stays under COMMS. It starts folded to its strip, and opened it takes at most half
  the column.
- **Session handover** (`PATCH /api/sessions/:id {agentId}`, `RunService.reassignSession`). The
  transcript stays. The next run is the new crew member's, with their documents, grants, and
  model. The handover is refused while a run is going (409). It is also refused for a dispatched
  worker's session (409), since its report belongs to the lead. An unknown crew member is a 404.
  It logs `session.reassigned {from, to}`. Earlier replies stay under the name of the crew member
  whose run wrote them.
- **Station-wide sessions** (`GET /api/sessions`). Every crew member's session summaries, each
  with `origin`. `origin` is `dispatch` when a dispatch opened the session for its worker, else
  `commander`. It is derived from the dispatches table, so no migration is needed.
- **Width and edges.** `--st-app-max-width` goes from 1440px to 1920px. `main` is laid out like
  the header and footer bars: padding outside, the app's width inside. Screens pad only above and
  below, so all three share their left and right edges.
- **Header tab.** The `/crew` tab reads "Manifest" (`tab.crew` in the glossary). Code keeps
  neutral words; the floor guard lists "manifest" as themed.

## Consequences
- The prompt after a handover includes the earlier crew member's replies as assistant turns. This
  is the simplest reading of "the transcript stays".
- The Station's session list invalidates on every session and run event (`["sessions"]` prefix).
- `browser:verify` checks the new layout:
  - header, main, and footer edges line up;
  - the folded scanner is a strip, and the open one takes at most half the column;
  - folding the crew column widens the map;
  - Expand hides the map.
