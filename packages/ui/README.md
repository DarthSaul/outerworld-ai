# @darthsaul/outerworld-ai-ui

React 19 components and the design tokens for the Outerworld AI station dashboard (ADR-0013).
It knows core (types, the glossary, the dashboard model, the pixel characters) and nothing about
the runtime, HTTP, or OpenRouter. Private package, consumed by `apps/station`.

```tsx
import "tailwindcss";
import "@darthsaul/outerworld-ai-ui/styles.css"; // fonts, --st-* tokens, Tailwind theme mapping
```

The design source of truth is `docs/design/station-dashboard/`. The theme is dark only.

## Station dashboard

Each component renders a core `Dashboard` (from `dashboardModel`) or plain props. Words come from
the glossary.

| Export | What it is |
|--------|------------|
| `DashboardMap` | The station map in three styles (`MAP_STYLES`: schematic, floorplan, polygon). It draws rooms around the Bridge, hallways routed between doors, packets while a dispatch runs, a draw-hallway mode (`drawFrom`), and the stopped scrim (`paused`). Room, crew and hallway selection go through callbacks. The plane is never smaller than `--st-map-min-*`: drag to pan, zoom buttons, and Recenter to fit every room (ADR-0014). |
| `OverseerComms` | The typed Overseer message (`useTypewriter`), (A)/(B) approvals, Next, and the order line. Chatter and replies move on after the design's hold; a streaming reply waits. |
| `Scanner` | A crew picker (grouped by room, with status and the crew count), then the selected room, crew member, or hallway. It has Stop run (`onStopRun`) and Demolish (`onDemolish`). |
| `CrewSelect` | Crew Select (the Appearance tab). The agent picker, an 8× stage on a pedestal, and the 6×4 character grid. Arrow keys move the P1 cursor and Enter assigns. |
| `StationHeader`, `CrtToggle` | The header bar: station name, tabs, and controls (the status drawer's toggle, the scanline switch). |
| `StatusDrawer`, `StatusDrawerToggle`, `RadioChatter` | The status drawer: TASKS LIVE, ALERTS and the radio (lines open where they point) in a modal overlay from the right; the toggle keeps a live dot and the alert count in sight (ADR-0014). |
| `StationVitals`, `StopButton`, `formatTokens`, `formatUptime`, `useUptime` | The footer: today's tokens, fuel against the daily cap, uptime, and `controls` at its right end (stop/resume). |

## Primitives

| Export | What it is |
|--------|------------|
| `Panel`, `PanelLabel` | A region with a title strip (2px line border, hard shadow), and a small section label. |
| `StatBox` | A labelled value in a well. `alert` blinks its border. |
| `SegmentBar` | A segmented bar. It is a meter when it has a percent; with no proven amount it marches while `active`. |
| `Avatar`, `overseerAvatarProps` | A square initials chip, with an optional double ring and status lamp. |
| `Sprite` | One of core's 24 characters as SVG rects, at an integer scale. |
| `OutlineButton`, `ChoiceButton`, `tabClass`, `Diamond` | Outline buttons (also `type="submit"`), the (A)/(B) buttons, tab classes for router links, and the placed-object diamond. |
| `Dropdown` | A select drawn in the station style: a button opening a listbox of grouped options with rich labels (avatar, colored status). Arrow keys, Home/End, type-ahead, Enter/Space, Escape and Tab; focus moves to the options while open; a click outside closes it. |
| `Checkbox`, `fieldClass`, `inputClass` | A checkbox drawn as a pixel box (the native input stays, visually hidden and focusable), and the classes for a labelled field and an input or select at the shared form height. |
| `EmptyState` | A status region: a title, one sentence, and at most one action. |
| `toneVar`, `CREW_STATUS_TONE`, `RUN_STATUS_TONE`, `lampBlink` | Status colors and lamp blink classes. |
| `useAnimationClock`, `useReducedMotion` | A requestAnimationFrame clock that holds still while stopped or under reduced motion. |

## Tokens

`src/tokens/station.css` defines every value as a `--st-*` custom property. It covers surfaces,
lines, text, accents, room colors, the type scale, map styles, motion, the CRT overlay, blink,
segment and ring classes. `src/tokens/theme.css` maps them into Tailwind v4 with `@theme inline`.
Examples: `bg-panel`, `text-fg-mute`, `border-line`, `font-display`, `text-d7`, `text-b19`,
`shadow-panel`. Stock namespaces are reset, so no off-token utility exists.

`tokens.ts` mirrors the values JavaScript needs: `STATION_MS` (blink, type tick, chatter and reply
holds), `PACKET_SPEED`, `ROOM_COLOR_COUNT`, `roomColorVar(i)`, `stVar(name)`. `tokens.test.ts`
fails if the CSS and TypeScript drift.

Motion is CSS. It stops under `prefers-reduced-motion` and while an ancestor has `data-paused`
(the kill switch). Text never blinks; lamps, the LED, cursors and borders do.

## Tests

Each component has a `*.test.tsx` (React Testing Library and vitest-axe, under happy-dom). The
test helper `src/test/dashboard.ts` builds a `Dashboard` from `fixtures/demo-station`.
