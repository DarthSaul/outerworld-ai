/**
 * Typed access to the station dashboard tokens in station.css (ADR-0013). Components never write
 * a literal; they reference a token through `stVar`, or use the Tailwind utilities theme.css
 * derives from the same variables.
 */

export type TokenName = string;

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
