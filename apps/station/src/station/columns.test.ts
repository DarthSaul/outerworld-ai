import { describe, expect, it } from "vitest";
import {
  COLUMN_LIMITS,
  clampColumns,
  columnsTemplate,
  DEFAULT_COLUMNS,
  MIN_MAP_COLUMN,
  parseColumns,
  resizeColumns,
} from "./columns.js";

describe("station columns", () => {
  it("starts at the design's 1fr / 3fr / 2fr", () => {
    expect(columnsTemplate(DEFAULT_COLUMNS)).toBe(
      "minmax(0,1.000fr) auto minmax(0,3.000fr) auto minmax(0,2.000fr)",
    );
  });

  it("lets the crew column grow to twice its default, and no further", () => {
    const wide = resizeColumns(DEFAULT_COLUMNS, "left", 2000, 1200);
    expect(wide.left).toBe(COLUMN_LIMITS.left.max);
    expect(COLUMN_LIMITS.left.max).toBe(2 * DEFAULT_COLUMNS.left);
    const narrow = resizeColumns(DEFAULT_COLUMNS, "left", -500, 1200);
    expect(narrow.left).toBe(COLUMN_LIMITS.left.min);
  });

  it("keeps the map at least 2fr: the column being dragged gives way", () => {
    const comms = resizeColumns({ left: 2, right: 2 }, "right", -2000, 1200);
    expect(comms).toEqual({ left: 2, right: 6 - MIN_MAP_COLUMN - 2 });
    const crew = resizeColumns({ left: 1, right: 3 }, "left", 2000, 1200);
    expect(crew).toEqual({ left: 6 - MIN_MAP_COLUMN - 3, right: 3 });
    expect(resizeColumns(DEFAULT_COLUMNS, "right", -2000, 1200).right).toBe(
      COLUMN_LIMITS.right.max,
    );
  });

  it("converts pixels to fr across the row; the right handle widens comms as it moves left", () => {
    // 6fr across 1200px: 100px is 0.5fr.
    expect(resizeColumns(DEFAULT_COLUMNS, "left", -60, 1200).left).toBeCloseTo(0.7);
    expect(resizeColumns({ left: 0.8, right: 2 }, "left", -60, 1200).left).toBeCloseTo(0.6);
    expect(resizeColumns(DEFAULT_COLUMNS, "right", -100, 1200).right).toBeCloseTo(2.5);
    expect(resizeColumns(DEFAULT_COLUMNS, "right", 100, 1200).right).toBeCloseTo(1.5);
    expect(resizeColumns(DEFAULT_COLUMNS, "right", 100, 0)).toBe(DEFAULT_COLUMNS);
  });

  it("reads stored widths, clamped, and falls back on anything else", () => {
    expect(parseColumns('{"left":0.7,"right":2.5}')).toEqual({ left: 0.7, right: 2.5 });
    expect(parseColumns('{"left":4,"right":0}')).toEqual(clampColumns({ left: 4, right: 0 }));
    expect(parseColumns(null)).toBe(DEFAULT_COLUMNS);
    expect(parseColumns("not json")).toBe(DEFAULT_COLUMNS);
    expect(parseColumns('{"left":"wide"}')).toBe(DEFAULT_COLUMNS);
  });
});
