import { describe, expect, it } from "vitest";
import {
  BRIDGE_RECT,
  laneLabel,
  placeRooms,
  pointAlong,
  type Rect,
  routeBetween,
  routeLength,
  sectorFor,
  tagPoint,
} from "./layout.js";

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("placeRooms", () => {
  it("puts the Overseer's room on the Bridge and the design's three rooms around it", () => {
    const placed = placeRooms(["command", "research", "operations", "build"], "command");
    expect(placed.map((p) => [p.id, p.sector, p.colorIndex, p.bridge])).toEqual([
      ["command", "HQ", 0, true],
      ["research", "A-1", 0, false],
      ["operations", "B-1", 1, false],
      ["build", "C-1", 2, false],
    ]);
    expect(placed[0]?.rect).toEqual(BRIDGE_RECT);
    expect(placed.slice(1).map((p) => p.rect)).toEqual([
      { x: 4, y: 8, w: 28, h: 36 },
      { x: 68, y: 8, w: 28, h: 36 },
      { x: 28, y: 68, w: 44, h: 29 },
    ]);
  });

  it("works without a Bridge (no Overseer yet)", () => {
    const placed = placeRooms(["a", "b"]);
    expect(placed.every((p) => !p.bridge)).toBe(true);
    expect(placed).toHaveLength(2);
  });

  it.each(Array.from({ length: 14 }, (_, n) => n))(
    "never overlaps two rooms and stays on the map with %i rooms around the Bridge",
    (n) => {
      const ids = ["bridge", ...Array.from({ length: n }, (_, i) => `room-${i}`)];
      const placed = placeRooms(ids, "bridge");
      expect(placed).toHaveLength(n + 1);
      for (const [i, p] of placed.entries()) {
        expect(p.rect.x).toBeGreaterThanOrEqual(0);
        expect(p.rect.y).toBeGreaterThanOrEqual(0);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(100);
        expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(100);
        for (const q of placed.slice(i + 1))
          expect(overlaps(p.rect, q.rect), `${p.id}/${q.id}`).toBe(false);
      }
    },
  );

  it("names sectors A-1 to Z-1, then A-2", () => {
    expect([sectorFor(0), sectorFor(25), sectorFor(26)]).toEqual(["A-1", "Z-1", "A-2"]);
  });
});

describe("routeBetween", () => {
  const [, research, operations, build] = placeRooms(
    ["command", "research", "operations", "build"],
    "command",
  ).map((p) => p.rect);

  it("matches the design's Bridge hallways", () => {
    if (!research || !operations || !build) throw new Error("layout");
    expect(routeBetween(BRIDGE_RECT, research)).toEqual([
      [38, 40],
      [32, 40],
    ]);
    expect(routeBetween(BRIDGE_RECT, operations)).toEqual([
      [62, 40],
      [68, 40],
    ]);
    expect(routeBetween(BRIDGE_RECT, build)).toEqual([
      [50, 64],
      [50, 68],
    ]);
  });

  it("goes around a room in the way instead of through it", () => {
    const a: Rect = { x: 0, y: 40, w: 20, h: 20 };
    const b: Rect = { x: 80, y: 40, w: 20, h: 20 };
    const wall: Rect = { x: 40, y: 30, w: 20, h: 40 };
    const straight = routeBetween(a, b);
    expect(straight).toHaveLength(2);
    const around = routeBetween(a, b, [wall]);
    expect(around).not.toEqual(straight);
    expect(around.length).toBeGreaterThan(2);
  });

  it("starts on the first room's edge and ends on the second's", () => {
    const a: Rect = { x: 4, y: 8, w: 28, h: 36 };
    const b: Rect = { x: 66, y: 68, w: 30, h: 29 };
    const route = routeBetween(a, b);
    const [first] = route;
    const last = route[route.length - 1];
    const onEdge = ([x, y]: readonly [number, number], r: Rect) =>
      ((x === r.x || x === r.x + r.w) && y >= r.y && y <= r.y + r.h) ||
      ((y === r.y || y === r.y + r.h) && x >= r.x && x <= r.x + r.w);
    expect(first && onEdge(first, a)).toBe(true);
    expect(last && onEdge(last, b)).toBe(true);
    for (let i = 1; i < route.length; i++) {
      const p = route[i - 1];
      const q = route[i];
      expect(p && q && (p[0] === q[0] || p[1] === q[1])).toBe(true);
    }
  });

  it("returns no route for overlapping rooms", () => {
    expect(routeBetween({ x: 0, y: 0, w: 50, h: 50 }, { x: 10, y: 10, w: 50, h: 50 })).toEqual([]);
  });
});

describe("route helpers", () => {
  const route = [
    [18, 44],
    [18, 84],
    [28, 84],
  ] as const;

  it("weights horizontal travel 1.5× like the design", () => {
    expect(routeLength(route)).toBe(40 + 15);
  });

  it("tags the middle of the longest segment", () => {
    expect(tagPoint(route)).toEqual([18, 64]);
    expect(tagPoint([])).toBeUndefined();
  });

  it("finds points along the route and clamps u", () => {
    expect(pointAlong(route, 0)).toEqual([18, 44]);
    expect(pointAlong(route, 1)).toEqual([28, 84]);
    expect(pointAlong(route, 2)).toEqual([28, 84]);
    expect(pointAlong(route, 40 / 55)).toEqual([18, 84]);
  });

  it("labels hallways L-01, L-02, …", () => {
    expect([laneLabel(0), laneLabel(9), laneLabel(99)]).toEqual(["L-01", "L-10", "L-100"]);
  });
});
