import { describe, expect, it } from "vitest";
import {
  CREW_LIMITS,
  CREW_SHARE,
  DEFAULT_SIDE,
  parseCrew,
  parseSide,
  resizeCrew,
  resizeSide,
  SIDE_LIMITS,
  SPLIT_TOTAL,
  splitTemplate,
} from "./split.js";

describe("station split", () => {
  it("starts as crew 1fr, map 2fr, comms 1fr, with a handle after crew and one before comms", () => {
    expect(splitTemplate(DEFAULT_SIDE, { crew: true })).toBe(
      "minmax(0,1.000fr) auto minmax(0,2.000fr) auto minmax(0,1.000fr)",
    );
  });

  it("takes a wider crew column from the map", () => {
    expect(splitTemplate(DEFAULT_SIDE, { crew: true, crewShare: 1.5 })).toBe(
      "minmax(0,1.500fr) auto minmax(0,1.500fr) auto minmax(0,1.000fr)",
    );
  });

  it("converts pixels to fr for the crew handle: dragging right widens crew, within limits", () => {
    expect(resizeCrew(CREW_SHARE, 100, 1600)).toBeCloseTo(1.25);
    expect(resizeCrew(CREW_SHARE, -100, 1600)).toBeCloseTo(0.75);
    expect(resizeCrew(CREW_SHARE, 5000, 1600)).toBe(CREW_LIMITS.max);
    expect(resizeCrew(CREW_SHARE, -5000, 1600)).toBe(CREW_LIMITS.min);
    expect(resizeCrew(CREW_SHARE, 100, 0)).toBe(CREW_SHARE);
    // At both limits the map still keeps a full fr.
    expect(SPLIT_TOTAL - CREW_LIMITS.max - SIDE_LIMITS.max).toBe(1);
  });

  it("reads a stored crew width, clamped, and falls back on anything else", () => {
    expect(parseCrew("1.2")).toBe(1.2);
    expect(parseCrew("9")).toBe(CREW_LIMITS.max);
    expect(parseCrew(null)).toBe(CREW_SHARE);
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
