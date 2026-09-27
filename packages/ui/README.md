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
| `StationView` | The dashboard: owns selection (or takes a controlled one), map + report panel side by side on desktop, stacked map with a bottom-sheet panel below the breakpoint, zoom fitted to width, Escape clears. Accepts a `toolbar`. |
| `StationMap` | The map alone: core's layout in a 1000-unit frame (one unit per pixel at `zoom` 1), lanes as SVG, teams as HTML panels, overseer at the center. `stacked` for a column layout. |
| `DetailPanel` | The Report view for a selection: team, agent, grant, handoff, or overseer, each with a proof line (as-of · path · commit). |

### Pieces
| Export | Description |
|--------|-------------|
| `TeamPanel`, `AgentCard`, `GrantChip`, `TeamEmblem`, `HandoffLayer`, `Packet`, `OverseerCore`, `EmptyState`, `Toast`, `ToastRegion` | Controlled, state-via-data-attributes, styled only through tokens. |
| `Character`, `OverseerCharacter`, `RigSprite` | The rig: five `<use>`s over one sprite, recolored by two persona hues; the overseer's own 48×64 hero rig; `data-state` drives motion in `character.css`. |
| `Selection`, `isSelected` | One selection at a time: `{ kind, id }`. |

### Demo
| Export | Description |
|--------|-------------|
| `runDigestTimeline(station, startAt)` | The scripted sequence: run started → agent working → ledger written → agent done → run finished → overseer reconciling → digest posted. |
| `useTimeline(station, initial, { stepMs })` | Plays it through core's reducer; `{ state, playing, step, play, reset }`. |
| `RunDigestButton` | Play and reset controls. |

### Tokens
| Export | Description |
|--------|-------------|
| `tokenVar(name)`, `glowToken(state)`, `MOTION_MS`, `RUN_STATES`, `HEALTH_STATES`, `GRANT_MODES`, `THEMED_TOKENS` | Typed access to the `--ow-*` tokens; `MOTION_MS` mirrors the CSS durations and a test keeps them equal. |
| `useDesktop()` | True at or above the desktop breakpoint token. |
| `dateLabel`, `clockLabel`, `durationLabel`, `timeLabel` | UTC, locale-free formatting for evidence text. |

Tokens are a translation of `docs/design/`; see `docs/design/README.md` for the name map.
Components never contain a color, radius, or duration literal; the floor guard enforces it.

## Verify

```
pnpm --filter @darthsaul/outerworld-ai-ui test    # RTL + vitest-axe under happy-dom
pnpm browser:verify                               # Playwright screenshots of the gallery and the app
```

Chromium only in this milestone; WebKit and Firefox are a follow-up.
