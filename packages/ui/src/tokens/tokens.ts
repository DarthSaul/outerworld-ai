/**
 * Typed access to the design tokens defined in tokens.css. Components never write a literal
 * value; they reference a token by name through `tokenVar`, or use the Tailwind utilities that
 * theme.css derives from the same variables. Vocabularies come from core's schemas so the
 * tokens are checked against the real state space.
 */
import { AgentRunState, GrantMode as GrantModeSchema, Health } from "@darthsaul/outerworld-ai-core";

/** Token names that vary between light and dark. tokens.test.ts checks each is defined in all three theme blocks. */
export const THEMED_TOKENS = [
  "accent-l",
  "surface-map",
  "surface-map-end",
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
] as const;

/** Run states, from core; the rig sets --ow-rig-glow to the matching glow token. */
export const RUN_STATES = AgentRunState.options;
export type RunState = (typeof RUN_STATES)[number];

/** Team health states, from core. */
export const HEALTH_STATES = Health.options;
export type HealthState = (typeof HEALTH_STATES)[number];

/** Grant modes, from core; one hue each. */
export const GRANT_MODES = GrantModeSchema.options;
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

/** Map zoom range and step (design spec §04: 60–140%). Mirrors --ow-zoom-* in tokens.css. */
export const ZOOM = { min: 0.6, max: 1.4, step: 0.1 } as const;

/** Blink offset between agents on one panel, in milliseconds. Mirrors --ow-rig-blink-stagger. */
export const BLINK_STAGGER_MS = 900;

export type TokenName = string;

/** `tokenVar("ink-1")` → `var(--ow-ink-1)`. */
export function tokenVar(name: TokenName): string {
  return `var(--ow-${name})`;
}

/** The custom property that carries a run state's glow color. */
export function glowToken(state: RunState): string {
  return `--ow-rig-glow-${state}`;
}

/**
 * Station dashboard clocks in milliseconds (ADR-0013), for the JavaScript that types messages
 * and holds chatter. Mirrors --st-dur-* in station.css; tokens.test.ts fails if the two drift.
 */
export const STATION_MS = {
  blink: 400,
  "type-tick": 60,
  "chatter-hold": 4200,
  "reply-hold": 3600,
} as const;

/** Hallway packet speed in map percent per second. Mirrors --st-packet-speed. */
export const PACKET_SPEED = 9;

/** How many room colors station.css defines (--st-room-0 …). Rooms past this reuse them in order. */
export const ROOM_COLOR_COUNT = 6;

/** The color token for the room at `index` in station order. */
export function roomColorVar(index: number): string {
  const slot = ((index % ROOM_COLOR_COUNT) + ROOM_COLOR_COUNT) % ROOM_COLOR_COUNT;
  return `var(--st-room-${slot})`;
}

/** `stVar("cyan")` → `var(--st-cyan)`. */
export function stVar(name: TokenName): string {
  return `var(--st-${name})`;
}
