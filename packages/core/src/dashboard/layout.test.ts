import { describe, expect, it } from "vitest";
import {
  BRIDGE_RECT,
  branchTag,
  laneLabel,
  placeRooms,
  pointAlong,
  type Rect,
  routeBetween,
  routeLength,
  sectorFor,
  tagPoint,
  treeRoute,
} from "./layout.js";

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const ids = (n: number) => ["bridge", ...Array.from({ length: n }, (_, i) => `room-${i}`)];

describe("placeRooms", () => {
  it("puts the Bridge at the top center and the other rooms in one row below it (ADR-0025)", () => {
    const placed = placeRooms(["research", "command", "operations", "build"], "command");
    expect(placed.map((p) => [p.id, p.sector, p.colorIndex, p.bridge, p.row])).toEqual([
      ["command", "HQ", 0, true, -1],
      ["research", "A-1", 0, false, 0],
      ["operations", "B-1", 1, false, 0],
      ["build", "C-1", 2, false, 0],
    ]);
    expect(placed[0]?.rect).toEqual(BRIDGE_RECT);
    expect(BRIDGE_RECT).toEqual({ x: 35, y: 4, w: 30, h: 30 });
    expect(placed.slice(1).map((p) => p.rect)).toEqual([
      { x: 4, y: 46, w: 28, h: 50 },
      { x: 36, y: 46, w: 28, h: 50 },
      { x: 68, y: 46, w: 28, h: 50 },
    ]);
  });

  it("centers a short row, at most 30% wide per room", () => {
    const [, one] = placeRooms(ids(1), "bridge");
    expect(one?.rect).toEqual({ x: 35, y: 46, w: 30, h: 50 });
    const [, left, right] = placeRooms(ids(2), "bridge");
    expect([left?.rect.x, right?.rect.x, left?.rect.w]).toEqual([18, 52, 30]);
  });

  it("wraps past four rooms into a grid, and shortens the Bridge to make room", () => {
    const placed = placeRooms(ids(6), "bridge");
    expect(placed.map((p) => p.row)).toEqual([-1, 0, 0, 0, 0, 1, 1]);
    expect(placed[0]?.rect.h).toBe(22);
    expect(placed[5]?.rect.x).toBe(placed[1]?.rect.x);
    expect(placeRooms(ids(13), "bridge")[0]?.rect.h).toBe(16);
  });

  it("lays the rooms out from the top without a Bridge (no Overseer yet)", () => {
    const placed = placeRooms(["a", "b"]);
    expect(placed.every((p) => !p.bridge)).toBe(true);
    expect(placed).toHaveLength(2);
    expect(placed.map((p) => p.rect.y)).toEqual([4, 4]);
  });

  it.each(Array.from({ length: 14 }, (_, n) => n))(
    "keeps every room below the Bridge, apart, and on the map with %i rooms",
    (n) => {
      const placed = placeRooms(ids(n), "bridge");
      expect(placed).toHaveLength(n + 1);
      const bridgeBottom = BRIDGE_RECT.y + (placed[0]?.rect.h ?? 0);
      for (const [i, p] of placed.entries()) {
        expect(p.rect.x).toBeGreaterThanOrEqual(0);
        expect(p.rect.y).toBeGreaterThanOrEqual(0);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(100);
        expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(100);
        if (!p.bridge) expect(p.rect.y).toBeGreaterThan(bridgeBottom);
        for (const q of placed.slice(i + 1))
          expect(overlaps(p.rect, q.rect), `${p.id}/${q.id}`).toBe(false);
      }
    },
  );

  it("names sectors A-1 to Z-1, then A-2", () => {
    expect([sectorFor(0), sectorFor(25), sectorFor(26)]).toEqual(["A-1", "Z-1", "A-2"]);
  });
});

describe("treeRoute (ADR-0025)", () => {
  const [bridge, left, middle, right] = placeRooms(ids(3), "bridge");

  it("runs down from the Bridge to a bus, along it, and down into a first-row room", () => {
    if (!bridge || !left || !middle || !right) throw new Error("layout");
    expect(treeRoute(bridge.rect, left.rect, left.row)).toEqual([
      [50, 34],
      [50, 40],
      [18, 40],
      [18, 46],
    ]);
    expect(treeRoute(bridge.rect, right.rect, right.row)).toEqual([
      [50, 34],
      [50, 40],
      [82, 40],
      [82, 46],
    ]);
    // Straight below the Bridge: one drop.
    expect(treeRoute(bridge.rect, middle.rect, middle.row)).toEqual([
      [50, 34],
      [50, 46],
    ]);
  });

  it("reaches a later row down the gutter on the room's left, entering from its side", () => {
    // Six rooms: four in the first row, then room-4 and room-5 below.
    const placed = placeRooms(ids(6), "bridge");
    const [b, lower] = [placed[0], placed[5]];
    if (!b || !lower) throw new Error("layout");
    expect(lower.row).toBe(1);
    const route = treeRoute(b.rect, lower.rect, lower.row);
    const last = route[route.length - 1];
    expect(last).toEqual([lower.rect.x, lower.rect.y + lower.rect.h / 2]);
    expect(route[route.length - 2]?.[0]).toBe(lower.rect.x - 2);
  });

  it.each(Array.from({ length: 14 }, (_, n) => n))(
    "never passes through another room, orthogonal throughout, with %i rooms",
    (n) => {
      const placed = placeRooms(ids(n), "bridge");
      const [b, ...rest] = placed;
      if (!b) throw new Error("layout");
      const inside = (x: number, y: number, r: Rect) =>
        x > r.x + 0.5 && x < r.x + r.w - 0.5 && y > r.y + 0.5 && y < r.y + r.h - 0.5;
      for (const child of rest) {
        const route = treeRoute(b.rect, child.rect, child.row);
        expect(route.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < route.length; i++) {
          const [x1, y1] = route[i - 1] ?? [0, 0];
          const [x2, y2] = route[i] ?? [0, 0];
          expect(x1 === x2 || y1 === y2).toBe(true);
          // Sample the segment and check no point lies inside any room, its own two included.
          for (let s = 0; s <= 20; s++) {
            const x = x1 + ((x2 - x1) * s) / 20;
            const y = y1 + ((y2 - y1) * s) / 20;
            for (const p of placed)
              expect(inside(x, y, p.rect), `${child.id} via ${p.id}`).toBe(false);
          }
        }
      }
    },
  );

  it("tags a Bridge hallway on the branch nearest its room, never on the shared bus", () => {
    if (!bridge || !left || !middle) throw new Error("layout");
    expect(branchTag(treeRoute(bridge.rect, left.rect, left.row))).toEqual([18, 43]);
    expect(branchTag(treeRoute(bridge.rect, middle.rect, middle.row))).toEqual([50, 40]);
    const placed = placeRooms(ids(6), "bridge");
    const lower = placed[5];
    if (!placed[0] || !lower) throw new Error("layout");
    const tag = branchTag(treeRoute(placed[0].rect, lower.rect, lower.row));
    expect(tag?.[0]).toBe(lower.rect.x - 2);
  });
});

describe("routeBetween", () => {
  const [, research, operations] = placeRooms(["command", "research", "operations"], "command").map(
    (p) => p.rect,
  );

  it("runs straight between two rooms side by side in a row", () => {
    if (!research || !operations) throw new Error("layout");
    expect(routeBetween(research, operations)).toEqual([
      [48, 71],
      [52, 71],
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
