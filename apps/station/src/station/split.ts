import { useState } from "react";

/**
 * The Station's desktop split (ADR-0014, ADR-0018): crew, map, and comms in fr of a 4fr row,
 * 1fr / 2fr / 1fr by default. Crew's and comms' shares are stored, each set with its own handle
 * (crew's between it and the map, comms' between the map and comms); the map takes the rest. A
 * folded crew column gives its share to the map.
 */
export const SPLIT_TOTAL = 4;
export const CREW_SHARE = 1;
export const DEFAULT_SIDE = 1;
/** Comms from 0.75fr to 1.5fr; the map keeps at least 1fr beside the widest crew column. */
export const SIDE_LIMITS = { min: 0.75, max: 1.5 } as const;
/** The crew column from 0.75fr to 1.5fr. */
export const CREW_LIMITS = { min: 0.75, max: 1.5 } as const;

const clamp = (limits: { readonly min: number; readonly max: number }, fr: number) =>
  Math.min(limits.max, Math.max(limits.min, fr));

export const clampSide = (side: number) => clamp(SIDE_LIMITS, side);
export const clampCrew = (crew: number) => clamp(CREW_LIMITS, crew);

/** Moves the comms handle `dx` pixels across a row `width` pixels wide: rightwards narrows comms. */
export function resizeSide(side: number, dx: number, width: number): number {
  if (width <= 0) return side;
  return clampSide(side - (dx * SPLIT_TOTAL) / width);
}

/** Moves the crew handle `dx` pixels across a row `width` pixels wide: rightwards widens crew. */
export function resizeCrew(crew: number, dx: number, width: number): number {
  if (width <= 0) return crew;
  return clampCrew(crew + (dx * SPLIT_TOTAL) / width);
}

/**
 * `grid-template-columns` for the row: crew, its handle, map, comms' handle, comms. A folded crew
 * column has no column at all (its tab lies over the map's edge), and no handle. Expanded, comms
 * is the only column.
 */
export function splitTemplate(
  side: number,
  {
    crew,
    crewShare = CREW_SHARE,
    expanded = false,
  }: { readonly crew: boolean; readonly crewShare?: number; readonly expanded?: boolean },
): string {
  if (expanded) return "minmax(0,1fr)";
  const col = (fr: number) => `minmax(0,${fr.toFixed(3)}fr)`;
  const map = SPLIT_TOTAL - side - (crew ? crewShare : 0);
  return `${crew ? `${col(crewShare)} auto ` : ""}${col(map)} auto ${col(side)}`;
}

/** A share of the row in percent, for the handle's aria values. */
export const percentOf = (fr: number) => (fr / SPLIT_TOTAL) * 100;

const KEY = "outerworld.split";
const CREW_KEY = "outerworld.crewSplit";

const parse = (raw: string | null, fallback: number, clampTo: (fr: number) => number) => {
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? clampTo(value) : fallback;
};

export const parseSide = (raw: string | null): number => parse(raw, DEFAULT_SIDE, clampSide);
export const parseCrew = (raw: string | null): number => parse(raw, CREW_SHARE, clampCrew);

/** One column's width, kept per viewer in localStorage like the map style. */
function useStoredShare(
  key: string,
  read: (raw: string | null) => number,
  fallback: number,
): [number, (next: number) => void] {
  const [share, setShare] = useState(() => {
    try {
      return read(localStorage.getItem(key));
    } catch {
      return fallback;
    }
  });
  return [
    share,
    (next) => {
      setShare(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Storage can be blocked (private windows); the width just won't stick.
      }
    },
  ];
}

/** The comms column's width. */
export const useSplit = () => useStoredShare(KEY, parseSide, DEFAULT_SIDE);
/** The crew column's width. */
export const useCrewSplit = () => useStoredShare(CREW_KEY, parseCrew, CREW_SHARE);
