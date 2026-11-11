import { useState } from "react";

/**
 * The Station's three desktop columns (ADR-0014), in fractions of the row: the crew list, the map,
 * and Overseer comms with the scanner. The map takes what the other two leave.
 */
export interface Columns {
  readonly left: number;
  readonly right: number;
}

/** The whole row, in fr: the design's 1fr / 3fr / 2fr. */
export const COLUMN_TOTAL = 6;
export const DEFAULT_COLUMNS: Columns = { left: 1, right: 2 };
/** The crew column never grows past its default 1fr; the map always keeps at least 2fr. */
export const COLUMN_LIMITS = {
  left: { min: 0.6, max: 1 },
  right: { min: 1.25, max: 3 },
} as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function clampColumns(c: Columns): Columns {
  return {
    left: clamp(c.left, COLUMN_LIMITS.left.min, COLUMN_LIMITS.left.max),
    right: clamp(c.right, COLUMN_LIMITS.right.min, COLUMN_LIMITS.right.max),
  };
}

/**
 * Moves one handle by `dx` pixels across a row `width` pixels wide. The left handle widens the
 * crew column as it moves right; the right handle narrows the comms column.
 */
export function resizeColumns(
  c: Columns,
  handle: "left" | "right",
  dx: number,
  width: number,
): Columns {
  if (width <= 0) return c;
  const fr = (dx * COLUMN_TOTAL) / width;
  return clampColumns(
    handle === "left" ? { ...c, left: c.left + fr } : { ...c, right: c.right - fr },
  );
}

/** `grid-template-columns` for the row: column, handle, column, handle, column. */
export function columnsTemplate(c: Columns): string {
  const middle = COLUMN_TOTAL - c.left - c.right;
  const col = (fr: number) => `minmax(0,${fr.toFixed(3)}fr)`;
  return `${col(c.left)} auto ${col(middle)} auto ${col(c.right)}`;
}

/** A column's share of the row in percent, for the handles' aria values. */
export const percentOf = (fr: number) => (fr / COLUMN_TOTAL) * 100;

const KEY = "outerworld.columns";

export function parseColumns(raw: string | null): Columns {
  try {
    const v: unknown = raw ? JSON.parse(raw) : undefined;
    if (
      v &&
      typeof v === "object" &&
      typeof (v as Columns).left === "number" &&
      typeof (v as Columns).right === "number" &&
      Number.isFinite((v as Columns).left) &&
      Number.isFinite((v as Columns).right)
    ) {
      return clampColumns(v as Columns);
    }
  } catch {
    // A corrupt value falls back to the default.
  }
  return DEFAULT_COLUMNS;
}

function read(): Columns {
  try {
    return parseColumns(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** The column widths, kept per viewer in localStorage like the map style. */
export function useColumns(): [Columns, (next: Columns) => void] {
  const [columns, setColumns] = useState(read);
  return [
    columns,
    (next) => {
      setColumns(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage can be blocked (private windows); the widths just won't stick.
      }
    },
  ];
}
