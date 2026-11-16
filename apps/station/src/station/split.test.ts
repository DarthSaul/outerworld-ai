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
  it("starts as crew 1fr, map 2fr, comms 1fr, with the handle before comms", () => {
    expect(splitTemplate(DEFAULT_SIDE, { crew: true })).toBe(
      "minmax(0,1.000fr) minmax(0,2.000fr) auto minmax(0,1.000fr)",
    );
  });

  it("gives a folded crew column's share to the map, with no column left for it", () => {
    expect(splitTemplate(DEFAULT_SIDE, { crew: false })).toBe(
      "minmax(0,3.000fr) auto minmax(0,1.000fr)",
    );
  });

  it("widens comms across the whole row when expanded", () => {
    expect(splitTemplate(DEFAULT_SIDE, { crew: true, expanded: true })).toBe("minmax(0,1fr)");
  });

  it("converts pixels to fr: dragging right grows the map, left grows comms", () => {
    // 4fr across 1600px: 100px is 0.25fr.
    expect(resizeSide(DEFAULT_SIDE, 100, 1600)).toBeCloseTo(0.75);
    expect(resizeSide(DEFAULT_SIDE, -100, 1600)).toBeCloseTo(1.25);
    expect(resizeSide(DEFAULT_SIDE, 100, 0)).toBe(DEFAULT_SIDE);
  });

  it("keeps comms between three sixteenths and three eighths of the row", () => {
    expect(resizeSide(DEFAULT_SIDE, 5000, 1600)).toBe(SIDE_LIMITS.min);
    expect(resizeSide(DEFAULT_SIDE, -5000, 1600)).toBe(SIDE_LIMITS.max);
    expect(SIDE_LIMITS.min / SPLIT_TOTAL).toBe(0.1875);
    expect(SIDE_LIMITS.max / SPLIT_TOTAL).toBe(0.375);
  });

  it("reads a stored width, clamped, and falls back on anything else", () => {
    expect(parseSide("1.2")).toBe(1.2);
    expect(parseSide("9")).toBe(SIDE_LIMITS.max);
    expect(parseSide(null)).toBe(DEFAULT_SIDE);
    expect(parseSide("wide")).toBe(DEFAULT_SIDE);
  });
});
