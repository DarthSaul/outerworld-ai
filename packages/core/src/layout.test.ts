import { describe, expect, it } from "vitest";
import { handoffGeometry, LAYOUT_SIZE, layoutStation, overseerLinkGeometry } from "./layout.js";

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
  it("places the overseer at the right edge, vertically centered, with a gutter", () => {
    const l = layoutStation(station(3));
    expect(l.overseer.x + l.overseer.w).toBeLessThan(LAYOUT_SIZE);
    expect(l.overseer.x + l.overseer.w).toBeGreaterThan(LAYOUT_SIZE * 0.8);
    expect(center(l.overseer).y).toBeCloseTo(LAYOUT_SIZE / 2, 6);
  });

  it("stacks up to four teams in one column to the left of the overseer, in station order top to bottom", () => {
    const l = layoutStation(station(4));
    expect(l.mode).toBe("radial");
    const xs = new Set(Object.values(l.teams).map((b) => b.x));
    expect(xs.size).toBe(1);
    const ys = ["t0", "t1", "t2", "t3"].map((id) => l.teams[id]!.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    for (const b of Object.values(l.teams)) expect(b.x + b.w).toBeLessThan(l.overseer.x);
  });

  it("uses two columns for five to ten teams and three for eleven to sixteen", () => {
    expect(new Set(Object.values(layoutStation(station(8)).teams).map((b) => b.x)).size).toBe(2);
    expect(new Set(Object.values(layoutStation(station(12)).teams).map((b) => b.x)).size).toBe(3);
    expect(layoutStation(station(12)).mode).toBe("rings");
  });

  it("uses list mode above sixteen teams, stacked top to bottom", () => {
    const l = layoutStation(station(17));
    expect(l.mode).toBe("list");
    const ys = Object.values(l.teams).map((b) => b.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it("is deterministic", () => {
    expect(layoutStation(station(5))).toEqual(layoutStation(station(5)));
  });

  it("keeps every team inside the square and clear of the overseer core", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16]) {
      const l = layoutStation(station(n));
      for (const b of Object.values(l.teams)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(LAYOUT_SIZE);
        expect(b.y + b.h).toBeLessThanOrEqual(LAYOUT_SIZE);
        expect(b.x + b.w).toBeLessThan(l.overseer.x);
      }
    }
  });

  it("wires each team into the overseer: the link starts at the team's right edge and ends at the overseer's left edge", () => {
    const l = layoutStation(station(3));
    const g = overseerLinkGeometry("t1", l);
    const t = l.teams.t1!;
    expect(g.path.startsWith(`M ${t.x + t.w} ${t.y + t.h / 2}`)).toBe(true);
    expect(g.path.endsWith(`${l.overseer.x} ${l.overseer.y + l.overseer.h / 2}`)).toBe(true);
    expect(g.chevronAt.x).toBeGreaterThan(g.midpoint.x);
    expect(() => overseerLinkGeometry("ghost", l)).toThrow(/ghost/);
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
