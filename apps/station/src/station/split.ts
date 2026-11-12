import { useState } from "react";

/**
 * The Station's desktop split (ADR-0014): the map and the side column (comms over the scanner),
 * in fr of a 3fr row. The side column's share is the one stored; the map takes the rest.
 */
export const SPLIT_TOTAL = 3;
export const DEFAULT_SIDE = 1;
/** The side column from a quarter of the row to a half; the map keeps at least half. */
export const SIDE_LIMITS = { min: 0.75, max: 1.5 } as const;

export const clampSide = (side: number) =>
  Math.min(SIDE_LIMITS.max, Math.max(SIDE_LIMITS.min, side));

/** Moves the handle `dx` pixels across a row `width` pixels wide: rightwards narrows the side. */
export function resizeSide(side: number, dx: number, width: number): number {
  if (width <= 0) return side;
  return clampSide(side - (dx * SPLIT_TOTAL) / width);
}

/** `grid-template-columns` for the row: map, handle, side column. */
export function splitTemplate(side: number): string {
  const col = (fr: number) => `minmax(0,${fr.toFixed(3)}fr)`;
  return `${col(SPLIT_TOTAL - side)} auto ${col(side)}`;
}

/** A share of the row in percent, for the handle's aria values. */
export const percentOf = (fr: number) => (fr / SPLIT_TOTAL) * 100;

const KEY = "outerworld.split";

export function parseSide(raw: string | null): number {
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? clampSide(value) : DEFAULT_SIDE;
}

function read(): number {
  try {
    return parseSide(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SIDE;
  }
}

/** The side column's width, kept per viewer in localStorage like the map style. */
export function useSplit(): [number, (next: number) => void] {
  const [side, setSide] = useState(read);
  return [
    side,
    (next) => {
      setSide(next);
      try {
        localStorage.setItem(KEY, String(next));
      } catch {
        // Storage can be blocked (private windows); the width just won't stick.
      }
    },
  ];
}
