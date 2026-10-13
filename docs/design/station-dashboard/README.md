# Handoff: Station Dashboard (retro agent ops console)

## Overview
An AI-agent management dashboard with a 16-bit / Super FX-era space-station look. The whole system is the **Station**. One top-level orchestrator agent, the **Overseer**, sits on the **Bridge**. Agents ("crew") live in **Rooms**, which are teams scoped by capability. **Hallways** are authorized handoff lanes between rooms. **Placed objects** in a room are real capability grants (Notion DB, Web Access, Gmail, GitHub, …).

There are two pages:
1. **Station**: the live ops dashboard (map, crew, Overseer comms, scanner, vitals).
2. **Crew Select**: picking an agent's appearance from 24 pixel characters.

## About the design files
Everything in `reference/` is a **design reference built in HTML**: a working prototype that shows the intended look and behavior. It is not production code to copy. Rebuild it in the existing **React + Vite SPA**, following that codebase's patterns (component structure, state management, data fetching, styling approach). The prototype runs on a custom runtime; ignore that runtime and treat the template and logic only as a spec.

To view it, serve the folder (`npx serve reference`) and open `Station Dashboard.dc.html`.

`src/` holds files that **are** meant to be dropped into the codebase:
- `tokens.css`: CSS custom properties and global resets.
- `characterSprites.ts`: character specs plus the pixel generator, typed.
- `stationSeed.ts`: mock data and types. Replace it with real API data.

## Fidelity
**High-fidelity.** Colors, type, spacing, borders and interactions are final. Recreate them pixel-accurately.

---

## Global visual rules
- **Fonts**: `Press Start 2P` for every label, title, button and chip (sizes 6/7/8/9/10/14/18px). `VT323` for body copy and values (14–22px, base 19px, line-height 1.15). Both come from Google Fonts.
- **No border radius.** The only exceptions are the circular A/B button glyphs (22px), the pause pill (26×10, radius 5) and the character pedestal ellipse.
- **Panels**: background `--st-panel`, 2px solid `--st-line` border, hard shadow `4px 4px 0 --st-shadow`.
  - Title strip: background `--st-panel-head`, 2px bottom border `--st-line`, padding 8px 10px, Press Start 9px, letter-spacing 1px, color `--st-cyan`.
  - Right side of the strip: meta text at 7px in `--st-text-mute`.
- **Progress / fuel bars**: a track at background `oklch(0.1 0.02 265)` with a 1–2px border. The fill is a segmented `repeating-linear-gradient(90deg, COLOR 0 8px, transparent 8px 10px)` (6/8 spacing on small bars).
- **Avatar chips**: a square in the room color holding 2-letter initials in `--st-ink`, Press Start. Sizes are 22, 30, 38 and 52px. Selected avatars get a double ring: `0 0 0 3px <bg>, 0 0 0 5px <color>`.
- **Blink**: a 2.5Hz on/off square wave. It is used on the comms LED, typing cursor, ACTIVE lamps, BLOCKED lamps, alert borders and the P1 cursor. Blinking stops while paused.
- **CRT overlay** (`.st-crt`): scanlines plus vignette. It must be user-toggleable.

## Page shell (shared by both pages)
Column flex, `min-height:100vh`.

### Header
- Bar: background `--st-bar`, 3px bottom border `--st-line`, `box-shadow 0 3px 0 --st-shadow`, padding 12px 16px.
- Layout: flex, wrap, space-between, gap 12px 20px.

**Left side:**
- Logo: a 34px cyan arrowhead (`clip-path: polygon(50% 0,100% 100%,50% 78%,0 100%)`).
- Title "STATION ORION-7" in Press Start 14px, ls 2px, `oklch(0.92 0.06 200)`.
- Subtitle "OVERSEER CONSOLE · 3 ROOMS · 7 CREW" in VT323 17px, `oklch(0.68 0.05 250)`.
- **Page tabs** "STATION" and "CREW SELECT": 7px Press Start, padding 7px 9px, 2px cyan border. Active tab is a cyan fill with ink text; inactive is transparent with cyan text.

**Right side** (flex-wrap, gap 8px, justify end):
- **Stat boxes**: padding 6px 10px, 2px `--st-line-soft` border, background `--st-well`. Each has a label (7px Press Start, mute) above a value (VT323 22px).
  - TASKS LIVE, green value.
  - ALERTS, red value. Its border blinks red while the count is above 0. Alerts = BLOCKED agents + PENDING lanes.
- **Radio Chatter widget** (flex 1 1 300px, max 520px):
  - Label row: "RADIO CHATTER" and "CH-01 · ALL ROOMS".
  - A 40px-tall scroll area with the newest entry on top. Each row is `HH:MM:SS` (dim) · WHO (the speaker's room color) · text (ellipsis), VT323 17px, nowrap.
- **PAUSE/START button**: a pill plus a label. Amber when running, green ("START") when paused.

### Footer
- Same bar style as the header, with a 3px *top* border and `box-shadow 0 -3px 0`.
- Left: "STATION VITALS" (Press Start 10px) over "BUDGET · TOKENS · UPTIME".
- Right: three stat boxes.
  - **TOKENS**: `1.284M`-style value in cyan.
  - **FUEL · $X.XX / $25 DAY**: min-width 170, with a 12px segmented amber bar.
  - **UPTIME**: `03d 04:12:11`.

## Page 1: Station
Main area: `display:grid; grid-template-columns: minmax(0,1fr) minmax(0,3fr) minmax(0,2fr); gap:14px; padding:14px; align-items:stretch`.

### Column 1: Crew Roster (fills the column height)
- Header: "CREW ROSTER" with "7 + OV" on the right.
- One row per agent: a grid of `30px | 1fr | auto` with padding 6px.
  - Avatar 30px.
  - Name (VT323 19px, ellipsis) with the role in mute 16px.
  - Status at 7px in the status color. The BLOCKED status blinks.
  - A full-width 6px fuel bar in the room color.
- Selected row: 2px cyan border. Hover background `--st-hover`. Clicking a row selects that agent.

### Column 2: Station Map (fills the column height)
**Header row:**
- "STATION MAP · DECK 01".
- Map style buttons "A SCHEMATIC", "B FLOORPLAN", "C POLYGON", styled like the page tabs.
- A divider.
- "+ DRAW HALLWAY" (amber outline). While drawing it becomes "CANCEL" with an amber fill.

**Viewport:**
- `position:relative; flex:1; min-width:860px; min-height:580px; overflow:hidden`.
- Wrapped in an `overflow-x:auto` container so the map scrolls instead of crushing the rooms.
- All children are absolutely positioned in **% of the viewport**. Room rects come from `ROOMS` in `stationSeed.ts`; the Bridge is at left 38%, top 36%, w 24%, h 28%.
- An inner "plane" div holds everything and takes the per-style background and transform.

**Rooms:**
- Background and border per style (below), padding 6px, column gap 6px, overflow hidden.
- Row 1: a sector chip (room-color fill, 7px), the room name (7px, room color, on a dark chip), and an `! ALERT` tag (red, 6px, blinking) when any crew member is BLOCKED.
- Row 2: crew chips (wrap, gap 6). Each chip is a 22px avatar plus a 6px status lamp at its top-right corner, the name in VT323 15px, and a 1px border (`--st-text-hi` when that agent is selected).
- Row 3, pinned to the bottom (`margin-top:auto`): grant chips. Each has a 1px dashed border in the room color, a 6px rotated-square diamond, and the real name in VT323 14px. **Revoked grants** show at opacity .45, struck through, with a red diamond.
- Selected room: ring `0 0 0 2px mapBg, 0 0 0 4px roomColor, 0 0 22px roomColor`. The room you are drawing from gets an amber ring.
- Rooms with an alert: the border alternates red and room color on the blink.

**Bridge:**
- 3px double border in `--st-white`.
- Contents: "HQ · BRIDGE", a 38px white "OV" avatar with a cyan double ring, and "OVERSEER".

**Hallways:**
- Each lane is a polyline from `ROUTES`. Each segment is a div 12px thick (22px on floorplan), centered on the line.
- Two parallel borders in the lane color: solid when AUTH, dashed when PENDING or SEALED.
- Colors: AUTH = `--st-lane-auth`, PENDING = amber, SEALED = red, selected = near-white.
- A lane-ID tag (6px Press Start, dark background, 1px border in the lane color) sits at the midpoint of the longest segment.
- Clicking a segment or its tag selects the lane.

**Traffic packets:**
- 8×8 squares in the destination room's color with `box-shadow: 0 0 8px` of the same color.
- They travel along AUTH lanes only. The count per lane is min(2, running tasks in the lane's non-bridge rooms).
- Speed: position `u = (t*9/totalLen + k/count + seed) % 1`, and every second packet runs in reverse.

**Overlays:**
- Draw-mode hint: an amber pill at top center reading "SELECT FIRST ROOM", then "LINK <ROOM> TO…".
- Paused: a full-viewport `oklch(0.08 0.02 265 / .6)` scrim with "PAUSE" (30px, ls 4px, `text-shadow 4px 4px 0 --st-line`) and "All crews holding position. Press START to resume."

**Map style tokens** (switchable at runtime):

| | Schematic (default) | Floorplan | Polygon |
|---|---|---|---|
| Viewport bg | `oklch(.11 .03 268)` | checker 32px `oklch(.14 .02 60)/(.12 .02 60)` | stars + `linear-gradient(oklch(.16 .07 285), oklch(.08 .03 268) 55%)` |
| Plane bg | 24px cyan grid at 10% + stars | transparent | 32px green grid `oklch(.75 .16 145 / .28)` |
| Plane transform | none | none | `perspective(1100px) rotateX(38deg) scale(.86) translateY(-6%)`, origin 50% 55% |
| Room bg | `oklch(.16 .04 265)` | checker 16px `oklch(.33 .035 70)/(.29 .035 70)` | `oklch(.2 .06 265 / .6)` |
| Room border | 2px room color | 6px wall `oklch(.5 .05 60)` + inset 2px room color, `0 6px 0 oklch(.26 .04 60)` | 2px room color, glow `0 0 14px`, `0 12px 0 -2px oklch(.28 .08 265)` |
| Lane thickness / AUTH color | 12px / `--st-lane-auth` | 22px, 4px walls / `oklch(.5 .05 60)` | 12px / `oklch(.75 .16 145)` |

### Column 3: Overseer Comms + Scanner
**Overseer Comms** panel:
- Header: "OVERSEER COMMS" with a blinking 8px red LED.
- Body (flex, gap 10, padding 10):
  - An 84×96 portrait slot (2px cyan border, striped placeholder). **The final pixel portrait is still to be supplied.**
  - Speaker label: Press Start 8px, amber.
  - Message: VT323 19px, typed out at 1 character per 60ms tick, with a blinking 9×15 cyan block cursor. Min-height 88px.
- When the message is an approval: two buttons, `(A) APPROVE` (green outline) and `(B) DENY` (red outline). Each has a 22px circular filled glyph.
- Otherwise: a `NEXT ▶` button. Non-approval chatter auto-advances about 4s after it finishes typing.
- **Order input row**: top border 2px `--st-line-faint`, background `oklch(.14 .03 265)`. Contents: a green `>` prompt, an unstyled input (placeholder "Give the Overseer an order…"), and a green-filled "SEND" button. Enter submits.

**Scanner** panel. The header shows "SCANNER" and the selection kind (ROOM / CREW / HALLWAY). The body is padding 12, gap 14, and depends on the selection:
- **Room**:
  - Sector chip and name, then the description.
  - CREW list: avatar, name, status. Clicking selects the agent.
  - PLACED OBJECTS · GRANTS: dashed cards with a diamond, the in-fiction object name (7px, room color), "real · scope", and a `REVOKE` / `RESTORE` toggle.
  - HALLWAYS · HANDOFF LANES: ID, "⇄ other room", status.
  - MISSIONS IN ROOM: task cards with title, status, "id · agent", %, and a segmented bar.
  - The Bridge shows the Overseer as its crew and the 6 most urgent station-wide tasks.
- **Crew**:
  - 52px avatar, name (11px), "role · room", status.
  - FUEL · TOKEN BUDGET bar.
  - TASK LOG cards.
  - CAN USE · ROOM GRANTS chips.
  - Buttons `HOLD AGENT` / `RELEASE AGENT` (amber) and `◀ ROOM` (back).
- **Hallway**:
  - ID chip and status.
  - "FROM ⇄ TO". Each name is clickable and selects that room.
  - CARRIES (purpose) and TRAFFIC NOW.
  - Buttons `SEAL HALLWAY` (red) / `AUTHORIZE` (green), and `DEMOLISH`.

**Task sort order:** BLOCKED, RUNNING/HELD, QUEUED, HALTED, DONE.

**Status colors:**
- Agents: ACTIVE green, IDLE mute, BLOCKED red, HALTED amber, HELD amber.
- Tasks: RUNNING green, QUEUED cyan, BLOCKED red, HALTED amber, DONE `--st-done`.

## Page 2: Crew Select
Main area: `grid-template-columns: minmax(0,1fr) minmax(0,2fr)`, gap 14, padding 14.

### Left panel: "APPEARANCE"
The header meta is the agent's room name. The body is a column with gap 14 and padding 12.
- **CONFIGURING AGENT**: a row of agent buttons. Each is a 20×26 sprite at 1× (pixelated) plus the name in VT323 17px. Active button: background `oklch(.26 .06 258)` with a 2px border in the room color. Clicking a button selects that agent and moves the cursor to its current look.
- **Stage** (flex 1, min-height 320):
  - Background: starfield over `linear-gradient(oklch(.16 .07 285), oklch(.1 .035 268) 70%)`, with a 2px `--st-line-soft` border.
  - Top-left: "NAME · Role" in the room color.
  - The sprite at 8× (160×208), standing on an elliptical pedestal: 210×30, background `oklch(.28 .06 255)`, 3px cyan border, cyan glow `0 0 26px`.
- Below the stage:
  - Character name: Press Start 18px, ls 2px.
  - Role: VT323 21px.
  - Status at 7px: "EQUIPPED ON X" (green), "ALSO WORN BY …" (amber) or "AVAILABLE" (cyan).
- Buttons: `(A) ASSIGN` (green) and `(B) RANDOM` (amber), styled like the approve/deny buttons.

### Right panel: "CHOOSE YOUR CREW · 24"
- Header meta: "ARROWS MOVE · ENTER ASSIGN".
- Grid: `repeat(6, minmax(0,1fr))`, gap 12, padding 14.
- **Tile**:
  - Background `oklch(.3 .035 250)` (the grey-blue echoes the reference sheet), 3px border, padding 12px 4px 10px.
  - The sprite at 4× (80×104), then the name in 7px Press Start.
  - Hover background `oklch(.35 .04 250)`.
- **Tile borders and badges**:
  - **Cursor tile**: the border blinks amber / `oklch(.95 .06 85)`, with a glow `0 0 0 2px mapBg, 0 0 18px amber` and a `P1` amber badge at the top-left.
  - **The configured agent's current look**: green border.
  - **Worn by other agents**: initials badge(s) at the top-right.
- **Keyboard**: ←/→ moves ±1, ↑/↓ moves ±6 (wrapping), Enter assigns. Ignore keys while focus is in an input.
- Assigning updates every place the sprite is shown and logs "<AGENT> now appears as <CHAR>" in green.

## Interactions & behavior summary
- **Selection**: one of `{type:'room'|'agent'|'lane', id}`. Map clicks call `stopPropagation` so crew chips win over their room.
- **Draw hallway**:
  - Toggling the mode turns room clicks into link picks: first click = from, second = to. Clicking the same room again clears the pick.
  - A duplicate pair logs "already linked" in mute.
  - Otherwise it creates lane `L-0N` (AUTH), selects it, and logs "BUILT · …".
  - Only room pairs that have a `ROUTES` entry are drawable. A real build needs routing for arbitrary pairs, e.g. orthogonal A* on a coarse grid, or a predefined door/port per room side.
- **Approvals queue**: the first approval preempts chatter.
  - APPROVE/DENY applies its side effect: unblocking/halting a task, or authorizing/sealing a lane. Then it logs and moves to the next approval.
  - Authorizing L-05 manually also clears its pending approval.
- **Order dispatch** (prototype heuristic; replace with the real Overseer call):
  - Keyword-match a room (`ROOMS[].keys`) and pick its least-loaded agent.
  - If the Bridge↔room lane is AUTH, the task starts RUNNING; otherwise it is QUEUED with a warning reply.
  - Then auto-select that room and post a typed Overseer reply.
- **Grants**: REVOKE/RESTORE toggles the grant and logs the change (red/green).
- **Hold agent**: freezes that agent's running tasks, which display as HELD.
- **Pause**: freezes all simulation, packets and blinking. The map scrim appears. Typing still runs.
- **Hand-offs**: when a task completes and a downstream task is QUEUED and waiting on a lane, it starts only if that lane is AUTH. Example: T-101 → T-103 over research↔pm.
- **Log**: capped at 40 entries, newest first.

## State (suggested shape)
```ts
type UIState = {
  page: 'dash' | 'select';
  sel: { type: 'room' | 'agent' | 'lane'; id: string };
  mapStyle: 'schematic' | 'floorplan' | 'wireframe';
  draw: null | { from: string | null };
  paused: boolean;
  crt: boolean;
  held: Record<string, boolean>;       // agentId
  cfgAgent: string;                     // crew select
  cursor: number;                       // 0–23
};
type StationState = {
  lanes: Lane[]; tasks: Task[]; approvals: Approval[];
  revoked: Record<string, boolean>;     // grantId
  fuel: Record<string, number>;         // agentId → % budget left
  looks: Record<string, number>;        // agentId → CHARACTERS index (persist per agent)
  tokens: number; spendUsd: number; uptimeStart: string;
  log: { ts: string; who: string; text: string; color: string }[];
};
```
Live data (tasks, log, fuel, tokens) should come from the backend over a subscription such as SSE or WebSocket. The prototype's 60ms tick and random log lines are simulation only. Keep a lightweight rAF clock for blink, packets and typing.

## Design tokens
All tokens are in `src/tokens.css`. Room colors:
- Research: cyan
- Project Ops: violet
- Dr. Dumbbell Bay: amber
- Bridge: white/cyan

Spacing in use: 2, 4, 5, 6, 8, 10, 12, 14, 16, 20px. The main gutter is 14.

## Assets
- **Character sprites**: 24 original characters, procedurally drawn on a 20×26 grid with a `#14121c` 1px outline added around the silhouette.
  - `sprites/1x/*.png`: native size.
  - `sprites/8x/*.png`: 160×208.
  - `sprites/sheet-4x.png`: 6×4 grid, 80×104 cells.
  - `sprites/characters.json`: index → id/name/role/file (renamed from manifest.json, D26).
  - Either use the PNGs, or generate at runtime with `characterSprites.ts`. That route is preferred if you want users to recolor later; the spec fields are documented in the `CharacterSpec` type.
  - Always render with `image-rendering: pixelated` at integer scales.
- **Overseer portrait**: not yet designed (placeholder slot).
- **Fonts**: Press Start 2P and VT323 (Google Fonts, OFL).
- No icon set. Glyphs are CSS shapes (diamonds, the arrowhead) or text (▶ ◀ ⇄ >).

## Suggested component breakdown
`AppShell` (Header, Footer, CRT), `StatBox`, `RadioChatter`, `Panel` (title strip), `CrewRoster`, `StationMap` (`MapRoom`, `MapBridge`, `HallwaySegment`, `LaneTag`, `Packet`), `OverseerComms`, `Scanner` (`RoomScan` / `AgentScan` / `LaneScan`), `TaskCard`, `SegmentBar`, `Avatar` / `Sprite`, `CrewSelect` (`AgentPicker`, `CharacterStage`, `CharacterGrid`).

## Files
- `reference/Station Dashboard.dc.html`: the full interactive prototype. Its template has all exact inline styles; the logic class has all behavior.
- `reference/support.js`: the runtime needed to open the prototype locally.
- `src/tokens.css`, `src/characterSprites.ts`, `src/stationSeed.ts`: drop-in starting points.
- `sprites/`: exported PNGs and manifest.
