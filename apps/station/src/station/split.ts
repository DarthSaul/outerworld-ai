import { useState } from "react";

/**
 * The Station's desktop split (ADR-0014, ADR-0018): crew, map, and comms in fr of a 4fr row,
 * 1fr / 2fr / 1fr by default. The crew column keeps 1fr (a folded one gives it to the map); comms'
 * share is the one stored, set with the handle between it and the map; the map takes the rest.
 */
export const SPLIT_TOTAL = 4;
export const CREW_SHARE = 1;
export const DEFAULT_SIDE = 1;
/** Comms from 0.75fr to 1.5fr; the map keeps at least 1.5fr beside an open crew column. */
export const SIDE_LIMITS = { min: 0.75, max: 1.5 } as const;

export const clampSide = (side: number) =>
  Math.min(SIDE_LIMITS.max, Math.max(SIDE_LIMITS.min, side));

/** Moves the handle `dx` pixels across a row `width` pixels wide: rightwards narrows comms. */
export function resizeSide(side: number, dx: number, width: number): number {
  if (width <= 0) return side;
  return clampSide(side - (dx * SPLIT_TOTAL) / width);
}

/**
 * `grid-template-columns` for the row: crew (or the folded column's tab), map, handle, comms.
 * Expanded, comms is the only column.
 */
export function splitTemplate(
  side: number,
  { crew, expanded = false }: { readonly crew: boolean; readonly expanded?: boolean },
): string {
  if (expanded) return "minmax(0,1fr)";
  const col = (fr: number) => `minmax(0,${fr.toFixed(3)}fr)`;
  const map = SPLIT_TOTAL - side - (crew ? CREW_SHARE : 0);
  return `${crew ? col(CREW_SHARE) : "auto"} ${col(map)} auto ${col(side)}`;
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
