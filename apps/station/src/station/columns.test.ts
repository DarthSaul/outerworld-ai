import { describe, expect, it } from "vitest";
import {
  COLUMN_LIMITS,
  clampColumns,
  columnsTemplate,
  DEFAULT_COLUMNS,
  parseColumns,
  resizeColumns,
} from "./columns.js";

describe("station columns", () => {
  it("starts at the design's 1fr / 3fr / 2fr", () => {
    expect(columnsTemplate(DEFAULT_COLUMNS)).toBe(
      "minmax(0,1.000fr) auto minmax(0,3.000fr) auto minmax(0,2.000fr)",
    );
  });

  it("never lets the crew column grow past 1fr, and the map keeps at least 2fr", () => {
    const wide = resizeColumns(DEFAULT_COLUMNS, "left", 500, 1200);
    expect(wide.left).toBe(COLUMN_LIMITS.left.max);
    const narrow = resizeColumns(DEFAULT_COLUMNS, "left", -500, 1200);
    expect(narrow.left).toBe(COLUMN_LIMITS.left.min);
    const comms = resizeColumns(DEFAULT_COLUMNS, "right", -2000, 1200);
    expect(comms.right).toBe(COLUMN_LIMITS.right.max);
    expect(6 - COLUMN_LIMITS.left.max - COLUMN_LIMITS.right.max).toBeGreaterThanOrEqual(2);
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
