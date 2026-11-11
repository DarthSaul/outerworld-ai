# ADR-0014: Station dashboard revisions: drawer, footer kill switch, pannable map, session titles

## Status
Accepted

## Date
2026-10-12

## Context
After using the ADR-0013 dashboard, the owner asked for a lighter header, a map that can be
moved, a fuller COMMS screen, clearer Crew forms, sessions named the way chat apps name them,
and a feed line when the kill switch is switched off. These change both the design (ADR-0013) and
the runtime (one extra model call per new session), so they are recorded here.

## Decision
**Shell**
- **Status drawer.** TASKS LIVE, ALERTS and the radio move out of the header into a drawer that
  slides in from the right over a scrim, hidden by default. A pixel radio-mast button in the
  header opens it. The button keeps the counts in sight: a green dot while tasks are live, and
  the alert count in red. While open, the drawer is a modal dialog:
  - focus moves into it, and Tab stays inside;
  - Escape or the scrim closes it, and focus returns to the button;
  - a radio line closes the drawer and opens where it points.

  Its motion is a stepped slide (`--st-dur-drawer`), off under reduced motion.
- **Kill switch in the footer.** STOP/RESUME sits at the right end of the vitals footer.
- **Connectors in Settings.** Connectors is no longer a tab. It is a section of Settings at
  `/settings#connectors`; `/connectors` and connector notifications land there.
- **Pages fill the height.** The main area is a flex column, so the Station grid and COMMS reach
  the footer. The map keeps a 580px minimum height on desktop.

**Station layout** (amended 2026-11-11)
- **Two columns.** On tablet and desktop the map always takes 2fr of a 3fr row; Overseer comms and
  the scanner share the remaining 1fr. Phones stack the map, comms, then the scanner. (A first
  pass with drag-resizable columns and a separate crew roster was replaced the same day.)
- **Crew lives in the scanner.** Picking a crew member only ever led to the scanner, so the
  roster panel is gone: the scanner opens with a crew picker (the station-styled `Dropdown`, not
  a native select: grouped by room, each option with its avatar and colored status; its label
  carries the crew count). `browser:verify` opens it, runs axe, and picks from the keyboard. Choosing one scans them; the
  picker shows whoever is being scanned.
- **Names.** The Crew Select tab is "Appearance" and sits after Crew. The Overseer's comms
  portrait is the 2× character alone, without the striped frame.

**Station map**
- **The plane and its viewport.** The map draws on a plane at least `--st-map-min-w` ×
  `--st-map-min-h` (860 × 580), which replaces the horizontal scroll. The viewport shows the plane
  through a translate-and-scale transform:
  - Dragging pans it. A press that moves less than 4px is still a click, and a drag across a room
    does not select it.
  - Zoom buttons scale it about the center, from the fitted scale up to 2×.
  - **Recenter** fits every room in view, never scaling above 1×. The map starts fitted and
    follows the viewport's size until the Commander moves it.
  - Panning is clamped so the plane can't be lost off screen.
  - Tabbing to a room outside the view pans it in.
- **Narrow screens.** The viewport takes the plane's aspect ratio, so the fitted map fills it.

**COMMS**
- **Crew list.** Each crew member shows their room (in its map color) and live status, with a lamp.
- **Profile.** The selected crew member's profile shows:
  - portrait, room, and a link to their crew file;
  - role, status, approval mode (Full power in amber), spend today, and model.
- **Session list.** Sessions are listed most recently active first. Each shows:
  - its title and how long ago it last spoke;
  - its last line, with who said it;
  - its message count, and a *Working* lamp while a run is active.

  `GET /api/agents/:id/sessions` adds `messageCount`, `lastMessageAt`, `lastMessage`, and
  `active` to each session. The list refreshes on run events.

**Session titles**
- A session created without a title starts as "New session". On the Commander's first message,
  the runtime asks the crew member's own model for a two-to-six-word title:
  - it is one short streamed call, capped at 32 output tokens and 30 s;
  - it runs beside the run, so it never delays the reply;
  - the message is sent as data, with an instruction not to follow it.

  The reply is cleaned to one plain line of at most 60 characters, redacted like any stored
  failure, and saved with `session.renamed`.
- **Spend and limits.** The call is budget-checked like any model call, and its spend is
  recorded against the run that triggered it. With the kill switch on, a cap reached, or a call
  that fails or returns nothing, the first message itself becomes the title, clipped. No
  model call is made in those cases.
- **When it runs.** Only on the first message of a session still titled "New session". A session
  named at creation, or renamed by the Commander before the title arrives, keeps that name.
  `RunServiceOptions.titles` turns this on; the daemon enables it, and tests opt in.
- **The fake model** answers a title request with the message's first five words.

**Notifications**
- Switching the kill switch off posts an `info` line, `kill_switch_cleared`: "The kill switch has
  been switched off. The station is running again: new runs can start." Runs it cancelled are not
  restarted, so it says no more than that.

**Forms**
- **Checkbox.** A `Checkbox` replaces native checkboxes everywhere (room props, connector grants,
  schedules, onboarding). The native input stays in the page, visually hidden but focusable and
  announced, and a pixel box drawn in CSS shows its state.
- **Field rows.** `fieldClass` and `inputClass` give fields and buttons one height, so form rows
  line up.
- **Crew screen.**
  - Rooms sit in a two-column grid, each with its map color, its crew's sprites, and a hint on
    what props do.
  - *Add crew member* and *Add room* are titled panels, each with a line saying what it is for.
  - The Project Manager template sits inside *Add crew member*.
  - The page opens with the add panels under an "Add" heading, then a divider, then the rooms
    under "Manifest" (amended 2026-11-11).
  - Labels that were hard-coded English are now glossary keys.

## Consequences
- **One extra model call per new session**, the size of a short prompt plus up to 2,000
  characters of the first message. It goes to the same provider as the run, so PRIVACY.md
  gains a line and nothing new leaves the machine.
- **Generated titles are model output.** They are displayed as plain text, never interpreted.
- **The header no longer shows live counts in full.** The drawer button's dot and alert badge
  stand in, and the drawer's toggle names both counts for screen readers.
- **The map can be smaller than before** on a narrow desktop column (fitted below 1×). Zoom and
  pan get the old size back.
- **`browser:verify` covers the new interactions.** On the Station it drags the map, recenters,
  opens the drawer, runs axe on it, screenshots it, and closes it with Escape. It also screenshots
  COMMS with a crew member selected.
