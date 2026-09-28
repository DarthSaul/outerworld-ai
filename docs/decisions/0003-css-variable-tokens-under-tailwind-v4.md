# ADR-0003: Design tokens as CSS custom properties under Tailwind v4

## Status
Accepted

## Date
2026-09-27

## Context
Every color, radius, spacing step, size, and motion value comes from the design spec
(`docs/design/outerworld-spec.dc.html`). Components must never hardcode a value, light and dark
themes must switch at runtime, per-agent recoloring must work by setting a hue, and reduced motion
must be honored everywhere. The brief asked for "a Tailwind preset"; Tailwind v4 has replaced the
JavaScript preset with CSS-first configuration.

## Decision
`packages/ui/src/tokens/tokens.css` defines every value as an `--ow-*` custom property: light by
default, dark under `@media (prefers-color-scheme: dark)` guarded by
`:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`, and a reduced-motion
block that collapses durations. `theme.css` maps the namespaced ones into Tailwind v4 with
`@theme inline` so utilities emit `var(--ow-*)` and follow the theme at runtime; the stock color,
radius, text, ease, and animate namespaces are reset so no off-token utility exists. Derived
colors (emblem shade and glow, rig chrome from a hue) use CSS relative color syntax so components
set only a hue. The "preset" is a CSS file the app imports.

## Alternatives considered
- **Tailwind v3 with a JavaScript preset.** Rejected: v4 is current, and its CSS-first theme reads
  custom properties natively, which is exactly the token rule.
- **CSS-in-JS or a tokens-to-TypeScript build step.** Rejected: adds a build and a runtime for
  what CSS variables already do; SSR and theme switching get harder.
- **Computing derived colors in JavaScript.** Rejected: puts numbers in components, which the
  floor forbids; relative color syntax keeps the math beside the tokens.

## Consequences
- The one literal in the theme is the desktop breakpoint, because media queries cannot read
  custom properties; a test keeps it equal to the `--ow-breakpoint-mobile` token.
- Browser support for `oklch()`, `color-mix()`, and relative color syntax is a floor (Chrome
  119+, Safari 16.4+, Firefox 128+), to be confirmed in the ui step's browser verification.
- The floor guard flags hex, `rgb()`, `hsl()`, pixel radii, and `ms` literals in ui and web
  source outside `tokens/`.
- IBM Plex is self-hosted through Fontsource (OFL) so the token file can name it without a
  network request.
