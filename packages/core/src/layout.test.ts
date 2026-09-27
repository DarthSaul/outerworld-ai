import { describe, expect, it } from "vitest";
import { handoffGeometry, LAYOUT_SIZE, layoutStation } from "./layout.js";
import type { Handoff, Station, Team } from "./schema/station.js";

const team = (id: string): Team => ({
  id,
  name: id,
  mission: "m",
  category: "build",
  emblem: { hue: 1, mark: "none" },
  scope: { repos: [] },
  schedule: { kind: "interval", everyMinutes: 60 },
});

const station = (n: number, handoffs: Handoff[] = []): Station => ({
  schemaVersion: 1,
  id: "s",
  name: "S",
  teams: Array.from({ length: n }, (_, i) => team(`t${i}`)),
  agents: [],
  grants: [],
  handoffs,
  overseer: {
    persona: { name: "M", mandate: "m", tone: "t" },
    schedule: { kind: "interval", everyMinutes: 60 },
    outward: { kind: "discord-webhook" },
  },
});

const center = (b: { x: number; y: number; w: number; h: number }) => ({
  x: b.x + b.w / 2,
  y: b.y + b.h / 2,
});
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("layoutStation", () => {
  it("places the overseer at the center of the unit square", () => {
    const l = layoutStation(station(3));
    expect(center(l.overseer)).toEqual({ x: LAYOUT_SIZE / 2, y: LAYOUT_SIZE / 2 });
  });

  it("uses radial mode for up to eight teams, all on one ring, equidistant from the center", () => {
    const l = layoutStation(station(8));
    expect(l.mode).toBe("radial");
    const radii = Object.values(l.teams).map((b) => dist(center(b), center(l.overseer)));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 2); // boxes are rounded to 3 decimals
    expect(Object.values(l.teams).every((b) => b.ring === 0)).toBe(true);
  });

  it("uses two rings for nine to sixteen teams", () => {
    const l = layoutStation(station(12));
    expect(l.mode).toBe("rings");
    const rings = new Set(Object.values(l.teams).map((b) => b.ring));
    expect(rings).toEqual(new Set([0, 1]));
  });

  it("uses list mode above sixteen teams, stacked top to bottom", () => {
    const l = layoutStation(station(17));
    expect(l.mode).toBe("list");
    const ys = Object.values(l.teams).map((b) => b.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it("is deterministic and orders teams by their position in the station", () => {
    const a = layoutStation(station(5));
    const b = layoutStation(station(5));
    expect(a).toEqual(b);
    // First team sits at the top (12 o'clock), the rest go clockwise.
    expect(center(a.teams.t0!).y).toBeLessThan(center(a.overseer).y);
    expect(center(a.teams.t1!).x).toBeGreaterThan(center(a.teams.t0!).x);
  });

  it("keeps every team inside the square and clear of the overseer core", () => {
    for (const n of [1, 3, 8, 16]) {
      const l = layoutStation(station(n));
      for (const b of Object.values(l.teams)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(LAYOUT_SIZE);
        expect(b.y + b.h).toBeLessThanOrEqual(LAYOUT_SIZE);
        expect(dist(center(b), center(l.overseer))).toBeGreaterThan(l.overseer.w / 2 + b.w / 2);
      }
    }
  });
});

describe("handoffGeometry", () => {
  const pairStation = station(4, [
    { id: "a-b", from: "t0", to: "t1" },
    { id: "b-a", from: "t1", to: "t0" },
    { id: "a-c", from: "t0", to: "t2" },
  ]);
  const layout = layoutStation(pairStation);

  it("draws a cubic path from the writer to the reader with the chevron at the reading end", () => {
    const g = handoffGeometry(pairStation.handoffs[2]!, layout, pairStation.handoffs);
    expect(g.path).toMatch(/^M [\d.-]+ [\d.-]+ C /);
    expect(g.paired).toBe(false);
    expect(g.side).toBe(0);
    expect(dist(g.chevronAt, center(layout.teams.t2!))).toBeLessThan(
      dist(g.chevronAt, center(layout.teams.t0!)),
    );
  });

  it("offsets the two halves of a paired handoff to opposite sides", () => {
    const ab = handoffGeometry(pairStation.handoffs[0]!, layout, pairStation.handoffs);
    const ba = handoffGeometry(pairStation.handoffs[1]!, layout, pairStation.handoffs);
    expect(ab.paired).toBe(true);
    expect(ba.paired).toBe(true);
    expect(ab.side).toBe(-ba.side);
    expect(ab.side).not.toBe(0);
    expect(dist(ab.midpoint, ba.midpoint)).toBeGreaterThan(0);
  });

  it("arcs around the overseer core: paired midpoints sit on opposite sides of the chord and clear the core", () => {
    const ab = handoffGeometry(pairStation.handoffs[0]!, layout, pairStation.handoffs);
    const ba = handoffGeometry(pairStation.handoffs[1]!, layout, pairStation.handoffs);
    const a = center(layout.teams.t0!);
    const b = center(layout.teams.t1!);
    const chordMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const core = center(layout.overseer);
    const coreRadius = Math.max(layout.overseer.w, layout.overseer.h) / 2;
    // Signed distance of each midpoint from the chord.
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const sideOf = (p: { x: number; y: number }) =>
      Math.sign((p.x - chordMid.x) * nx + (p.y - chordMid.y) * ny);
    expect(sideOf(ab.midpoint)).toBe(-sideOf(ba.midpoint));
    expect(dist(ab.midpoint, core)).toBeGreaterThan(coreRadius);
    expect(dist(ba.midpoint, core)).toBeGreaterThan(coreRadius);
  });

  it("reports the angle in degrees from writer to reader", () => {
    const g = handoffGeometry(pairStation.handoffs[2]!, layout, pairStation.handoffs);
    const a = center(layout.teams.t0!);
    const b = center(layout.teams.t2!);
    const expected = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    expect(g.angle).toBeCloseTo(expected, 6);
  });

  it("throws for a handoff whose team is not in the layout", () => {
    expect(() => handoffGeometry({ id: "x", from: "t0", to: "ghost" }, layout, [])).toThrow(
      /ghost/,
    );
  });
});
