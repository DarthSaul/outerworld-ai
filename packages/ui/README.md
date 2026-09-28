# @darthsaul/outerworld-ai-ui

React 19 components, the design tokens, and the rigged character SVG for Outerworld AI. Knows
nothing about Routines or GitHub; consumes `@darthsaul/outerworld-ai-core` for schema types,
layout geometry, rig derivation, the event reducer, and the glossary. Private package, consumed
in-workspace.

## Setup

```css
/* app stylesheet */
@import "tailwindcss";
@import "@darthsaul/outerworld-ai-ui/styles.css";
@source "../../packages/ui/src";
```

```tsx
<RigSprite />          {/* once, near the root: every figure references its parts by id */}
<StationView station={station} state={state} />
```

## Public API

### Views
| Export | Description |
|--------|-------------|
| `StationView` | The dashboard: owns selection (or takes a controlled one), sidebar + map + report as three `Pane`s on desktop (1fr 3fr 2fr), stacked map with a bottom-sheet panel below the breakpoint. The map pane is a drag-to-pan camera with a zoom bar (fit on first layout); Escape or a click on empty map clears. Accepts a `sidebar` and a `toolbar`. |
| `StationMap` | The map alone: core's layout in a `LAYOUT_SIZE` frame (one unit per pixel at `zoom` 1), handoffs and overseer wires as SVG, teams as HTML panels, overseer at the right edge. `stacked` for a column layout. Memoized. |
| `DetailPanel` | The Report view for a selection, dispatching to one view per kind under `components/report/` (team, agent, grant, handoff, overseer), each with a proof line (as-of · path · commit). Memoized. |

### Pieces
| Export | Description |
|--------|-------------|
| `TeamPanel`, `AgentCard`, `GrantChip`, `TeamEmblem`, `HandoffLayer`, `Packet`, `OverseerCore`, `Pane`, `EmptyState`, `Toast`, `ToastRegion` | Controlled, state-via-data-attributes, styled only through tokens. Display words (`healthLabel`, `stateLabel`, `roleNoun`) come in as props from core's glossary; the pieces hold no strings of their own. |
| `Character`, `OverseerCharacter`, `RigSprite` | The rig: five `<use>`s over one sprite, recolored by two persona hues; the overseer's own 48×64 hero rig; `data-state` drives motion in `character.css`. |
| `Selection`, `isSelected`, `sameSelection`, `resolveSelection`, `teamOfSelection` | One selection at a time: `{ kind, id }`; `resolveSelection` turns it into the entity (or undefined when the Station no longer has it). |
| `usePan`, `DRAG_THRESHOLD_PX` | Drag-to-pan for a surface: offset + pointer handlers; a press under the threshold stays a click, a drag swallows the click that ends it. |

### Demo
| Export | Description |
|--------|-------------|
| `runDigestTimeline(station, startAt)` | The scripted sequence: run started → agent working → ledger written → agent done → run finished → overseer reconciling → digest posted. |
| `useTimeline(station, initial, { stepMs })` | Plays it through core's reducer; `{ state, playing, step, play, reset }`. |
| `RunDigestButton` | Play and reset controls. |

### Tokens
| Export | Description |
|--------|-------------|
| `tokenVar(name)`, `glowToken(state)`, `MOTION_MS`, `ZOOM`, `BLINK_STAGGER_MS`, `RUN_STATES`, `HEALTH_STATES`, `GRANT_MODES`, `THEMED_TOKENS` | Typed access to the `--ow-*` tokens. `MOTION_MS`, `ZOOM`, and `BLINK_STAGGER_MS` mirror CSS values and a test keeps them equal; the state vocabularies come from core's schemas. |
| `useDesktop()` | True at or above the desktop breakpoint token. |
| `dateLabel`, `clockLabel`, `durationLabel`, `timeLabel`, `isHttpsUrl` | UTC, locale-free formatting for evidence text; only https session links are rendered as links. |

Tokens are a translation of `docs/design/`; see `docs/design/README.md` for the name map.
Components never contain a color, radius, or duration literal; the floor guard enforces it.

## Verify

```
pnpm --filter @darthsaul/outerworld-ai-ui test    # RTL + vitest-axe under happy-dom
pnpm browser:verify                               # Playwright screenshots of the gallery and the app
```

Chromium only in this milestone; WebKit and Firefox are a follow-up.
