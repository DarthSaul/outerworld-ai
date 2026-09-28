/**
 * Typed access to the design tokens defined in tokens.css. Components never write a literal
 * value; they reference a token by name through `tokenVar`, or use the Tailwind utilities that
 * theme.css derives from the same variables.
 */

/** Token names that vary between light and dark. tokens.test.ts checks each is defined in all three theme blocks. */
export const THEMED_TOKENS = [
  "accent-l",
  "surface-map",
  "surface-team",
  "surface-panel",
  "surface-raised",
  "border-subtle",
  "border-strong",
  "ink-1",
  "ink-2",
  "ink-3",
  "health-attention",
  "health-stalled",
  "selection-halo",
  "handoff-default",
  "rig-frame",
  "overseer-primary",
  "overseer-secondary",
  "overseer-frame",
  "frame-bezel",
  "frame-bezel-highlight",
  "frame-bezel-shadow",
  "frame-chin-ink",
  "screen-vignette",
  "screen-glass",
] as const;

/** Run-state glow tokens; the rig sets --ow-rig-glow to one of these from `data-state`. */
export const RUN_STATES = ["idle", "working", "done", "failed"] as const;
export type RunState = (typeof RUN_STATES)[number];

/** Team health tokens. */
export const HEALTH_STATES = ["ok", "attention", "stalled"] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

/** Grant modes, one hue each. */
export const GRANT_MODES = ["read", "write"] as const;
export type GrantMode = (typeof GRANT_MODES)[number];

/**
 * Motion durations in milliseconds for JavaScript that schedules against the same clock as the
 * CSS (the demo timeline). Mirrors tokens.css; tokens.test.ts fails if the two drift.
 */
export const MOTION_MS = {
  instant: 80,
  fast: 160,
  base: 240,
  slow: 400,
  packet: 1200,
  breathe: 2400,
  reduced: 120,
} as const;

export type TokenName = string;

/** `tokenVar("ink-1")` → `var(--ow-ink-1)`. */
export function tokenVar(name: TokenName): string {
  return `var(--ow-${name})`;
}

/** The custom property that carries a run state's glow color. */
export function glowToken(state: RunState): string {
  return `--ow-rig-glow-${state}`;
}
