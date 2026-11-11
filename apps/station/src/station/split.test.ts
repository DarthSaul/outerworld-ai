import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDE,
  parseSide,
  resizeSide,
  SIDE_LIMITS,
  SPLIT_TOTAL,
  splitTemplate,
} from "./split.js";

describe("station split", () => {
  it("starts with the map at 2fr and the side column at 1fr", () => {
    expect(splitTemplate(DEFAULT_SIDE)).toBe("minmax(0,2.000fr) auto minmax(0,1.000fr)");
  });

  it("converts pixels to fr: dragging right grows the map, left grows the side column", () => {
    // 3fr across 1200px: 100px is 0.25fr.
    expect(resizeSide(DEFAULT_SIDE, 100, 1200)).toBeCloseTo(0.75);
    expect(resizeSide(DEFAULT_SIDE, -100, 1200)).toBeCloseTo(1.25);
    expect(resizeSide(DEFAULT_SIDE, 100, 0)).toBe(DEFAULT_SIDE);
  });

  it("keeps the side column between a quarter and a half of the row", () => {
    expect(resizeSide(DEFAULT_SIDE, 5000, 1200)).toBe(SIDE_LIMITS.min);
    expect(resizeSide(DEFAULT_SIDE, -5000, 1200)).toBe(SIDE_LIMITS.max);
    expect(SIDE_LIMITS.min / SPLIT_TOTAL).toBe(0.25);
    expect(SIDE_LIMITS.max / SPLIT_TOTAL).toBe(0.5);
  });

  it("reads a stored width, clamped, and falls back on anything else", () => {
    expect(parseSide("1.2")).toBe(1.2);
    expect(parseSide("9")).toBe(SIDE_LIMITS.max);
    expect(parseSide(null)).toBe(DEFAULT_SIDE);
    expect(parseSide("wide")).toBe(DEFAULT_SIDE);
  });
});
