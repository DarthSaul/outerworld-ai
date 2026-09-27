# @darthsaul/outerworld-ai-ui

React 19 components, the design tokens, and (from the ui step) the rigged character SVG for
Outerworld AI. Knows nothing about Routines or GitHub. Private package, consumed in-workspace.

## Public API

| Export | Description |
|--------|-------------|
| `Badge` | A grant chip: mode glyph (R/W) plus label, colored by grant tokens. |
| `tokenVar(name)` | `var(--ow-<name>)` for inline styles. |
| `glowToken(state)` | The glow custom property for a run state. |
| `RUN_STATES`, `HEALTH_STATES`, `GRANT_MODES`, `THEMED_TOKENS` | Token vocabularies with types. |

### Styles

```css
@import "tailwindcss";
@import "@darthsaul/outerworld-ai-ui/styles.css";
@source "../../packages/ui/src";
```

`styles.css` loads IBM Plex (OFL, self-hosted via Fontsource), `tokens.css` (every `--ow-*`
custom property, light default, dark under both guards, reduced motion), and `theme.css`
(Tailwind v4 `@theme inline` mapping). Tokens are a translation of `docs/design/`; see
`docs/design/README.md` for the name map. Components never contain a color, radius, or duration
literal.

## Develop

```
pnpm --filter @darthsaul/outerworld-ai-ui test    # RTL + vitest-axe under happy-dom
```
