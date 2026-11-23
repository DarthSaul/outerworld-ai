/**
 * Station map layout for the dashboard (ADR-0013 #8, #18; ADR-0025). Pure geometry in percent of
 * the map viewport: x and y are the top-left corner, w and h the size. The map is an org tree: the
 * Bridge (the Overseer's room, Command) is always at the top center, and every other room sits in
 * rows below it in station order. Color index, sector, and position all follow from that order,
 * so the schema needs no layout fields. Hallways are orthogonal polylines between doors on the
 * rooms' sides; a Bridge hallway runs like an org chart's connector (`treeRoute`).
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type Point = readonly [x: number, y: number];

export interface RoomPlacement {
  readonly id: string;
  readonly rect: Rect;
  /** Index into the room colors (ui `roomColorVar`). */
  readonly colorIndex: number;
  /** `A-1`, `B-1`, …; the Bridge is `HQ`. */
  readonly sector: string;
  readonly bridge: boolean;
  /** The room's row below the Bridge, from 0; the Bridge itself is -1. */
  readonly row: number;
}

/** The map's outer margin and the gap between rooms. */
const EDGE = 4;
const GAP = 4;
/** How far the trunk drops from the Bridge to the bus, and the bus to the first row. */
const TRUNK = 6;
/** Rooms that share one row before the map wraps into a grid; and a room's widest. */
const ROW_MAX = 4;
const ROOM_MAX_W = 30;

/** The Bridge's rect when every other room fits in one row; it shortens for more rows. */
export const BRIDGE_RECT: Rect = { x: 35, y: EDGE, w: 30, h: 30 };
export const BRIDGE_SECTOR = "HQ";

function bridgeRect(rows: number): Rect {
  return { ...BRIDGE_RECT, h: rows <= 1 ? 30 : rows === 2 ? 22 : 16 };
}

const columnsFor = (count: number) =>
  count <= ROW_MAX ? count : Math.max(ROW_MAX, Math.ceil(Math.sqrt(1.6 * count)));

/**
 * The rooms' slots in rows from `top` down to the bottom margin: one centered row up to four
 * rooms, then a grid filled left to right, its columns aligned so the gutters run clear.
 */
function rowSlots(count: number, top: number): { rect: Rect; row: number }[] {
  if (count === 0) return [];
  const cols = columnsFor(count);
  const rows = Math.ceil(count / cols);
  const w = Math.min(ROOM_MAX_W, (100 - GAP * (cols + 1)) / cols);
  const x0 = (100 - cols * w - (cols - 1) * GAP) / 2;
  const h = (100 - EDGE - top - GAP * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    return {
      rect: { x: x0 + (i % cols) * (w + GAP), y: top + row * (h + GAP), w, h },
      row,
    };
  });
}

/** Sector label for the n-th room: A-1 … Z-1, then A-2 … */
export function sectorFor(index: number): string {
  return `${String.fromCharCode(65 + (index % 26))}-${Math.floor(index / 26) + 1}`;
}

/**
 * Places rooms on the map. `roomIds` is station order; `bridgeId` (the Overseer's room, when
 * there is one) goes at the top. Color index and sector count only the non-Bridge rooms.
 */
export function placeRooms(roomIds: readonly string[], bridgeId?: string): RoomPlacement[] {
  const hasBridge = bridgeId !== undefined && roomIds.includes(bridgeId);
  const others = roomIds.filter((id) => !hasBridge || id !== bridgeId);
  const rows = others.length ? Math.ceil(others.length / columnsFor(others.length)) : 0;
  const bridge = bridgeRect(rows);
  const top = hasBridge ? bridge.y + bridge.h + 2 * TRUNK : EDGE;
  const slots = rowSlots(others.length, top);
  const placed: RoomPlacement[] = others.map((id, i) => ({
    id,
    rect: slots[i]?.rect ?? bridge,
    colorIndex: i,
    sector: sectorFor(i),
    bridge: false,
    row: slots[i]?.row ?? 0,
  }));
  if (hasBridge) {
    placed.unshift({
      id: bridgeId,
      rect: bridge,
      colorIndex: 0,
      sector: BRIDGE_SECTOR,
      bridge: true,
      row: -1,
    });
  }
  return placed;
}

/* ---------------------------------------------------------------- routing */

/** The shared span of two intervals, or undefined when they overlap by less than `min`. */
function overlap(a0: number, a1: number, b0: number, b1: number, min: number) {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi - lo >= min ? { lo, hi, mid: (lo + hi) / 2 } : undefined;
}

const right = (a: Rect) => a.x + a.w;
const bottom = (a: Rect) => a.y + a.h;
const cx = (a: Rect) => a.x + a.w / 2;
const cy = (a: Rect) => a.y + a.h / 2;

/** How far into a room's interior a hallway may pass before it counts as crossing it. */
const MARGIN = 0.5;
/** Two rooms facing each other need this much shared span for a straight hallway. */
const MIN_FACE = 4;

function crosses([x1, y1]: Point, [x2, y2]: Point, room: Rect): boolean {
  const lo = (a: number, b: number) => Math.min(a, b);
  const hi = (a: number, b: number) => Math.max(a, b);
  const insideX = (x: number) => x > room.x + MARGIN && x < right(room) - MARGIN;
  const insideY = (y: number) => y > room.y + MARGIN && y < bottom(room) - MARGIN;
  if (y1 === y2)
    return insideY(y1) && lo(x1, x2) < right(room) - MARGIN && hi(x1, x2) > room.x + MARGIN;
  return insideX(x1) && lo(y1, y2) < bottom(room) - MARGIN && hi(y1, y2) > room.y + MARGIN;
}

function clear(points: readonly Point[], obstacles: readonly Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (p && q && obstacles.some((o) => crosses(p, q, o))) return false;
  }
  return true;
}

/** Length with horizontal travel weighted 1.5×, as the design measures it (the map is wide). */
export function routeLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i] ?? [0, 0];
    const [x2, y2] = points[i + 1] ?? [0, 0];
    total += Math.abs(x2 - x1) * 1.5 + Math.abs(y2 - y1);
  }
  return total;
}

/** How far outside the rooms a detour runs. */
const DETOUR = 2;

/**
 * U routes over the top or under the bottom of everything between the two rooms (for side by
 * side rooms), or around the left or right (for stacked rooms). Only those that stay on the map.
 */
function detours(a: Rect, b: Rect, others: readonly Rect[]): Point[][] {
  const out: Point[][] = [];
  const all = [a, b, ...others];
  const top = Math.min(...all.map((o) => o.y)) - DETOUR;
  const low = Math.max(...all.map(bottom)) + DETOUR;
  const left = Math.min(...all.map((o) => o.x)) - DETOUR;
  const far = Math.max(...all.map(right)) + DETOUR;
  if (top >= 0)
    out.push([
      [cx(a), a.y],
      [cx(a), top],
      [cx(b), top],
      [cx(b), b.y],
    ]);
  if (low <= 100)
    out.push([
      [cx(a), bottom(a)],
      [cx(a), low],
      [cx(b), low],
      [cx(b), bottom(b)],
    ]);
  if (left >= 0)
    out.push([
      [a.x, cy(a)],
      [left, cy(a)],
      [left, cy(b)],
      [b.x, cy(b)],
    ]);
  if (far <= 100)
    out.push([
      [right(a), cy(a)],
      [far, cy(a)],
      [far, cy(b)],
      [right(b), cy(b)],
    ]);
  return out;
}

/** Every reasonable orthogonal route from room `a` to room `b`, simplest shapes first. */
function candidates(a: Rect, b: Rect): Point[][] {
  const out: Point[][] = [];
  const leftToRight = right(a) <= b.x;
  const rightToLeft = right(b) <= a.x;
  const topToBottom = bottom(a) <= b.y;
  const bottomToTop = bottom(b) <= a.y;
  const ys = overlap(a.y, bottom(a), b.y, bottom(b), MIN_FACE);
  const xs = overlap(a.x, right(a), b.x, right(b), MIN_FACE);
  // Straight, between facing sides.
  if (ys && leftToRight)
    out.push([
      [right(a), ys.mid],
      [b.x, ys.mid],
    ]);
  if (ys && rightToLeft)
    out.push([
      [a.x, ys.mid],
      [right(b), ys.mid],
    ]);
  if (xs && topToBottom)
    out.push([
      [xs.mid, bottom(a)],
      [xs.mid, b.y],
    ]);
  if (xs && bottomToTop)
    out.push([
      [xs.mid, a.y],
      [xs.mid, bottom(b)],
    ]);
  // L: leave a vertically through its door, enter b sideways (and the mirror).
  const by = cy(b);
  if (by > bottom(a) || by < a.y) {
    const ay = by > bottom(a) ? bottom(a) : a.y;
    if (cx(a) < b.x)
      out.push([
        [cx(a), ay],
        [cx(a), by],
        [b.x, by],
      ]);
    if (cx(a) > right(b))
      out.push([
        [cx(a), ay],
        [cx(a), by],
        [right(b), by],
      ]);
  }
  const bx = cx(b);
  if (bx > right(a) || bx < a.x) {
    const ax = bx > right(a) ? right(a) : a.x;
    if (cy(a) < b.y)
      out.push([
        [ax, cy(a)],
        [bx, cy(a)],
        [bx, b.y],
      ]);
    if (cy(a) > bottom(b))
      out.push([
        [ax, cy(a)],
        [bx, cy(a)],
        [bx, bottom(b)],
      ]);
  }
  // Z: sideways out, across the gap, sideways in (and the vertical version).
  if (leftToRight || rightToLeft) {
    const [ax, bx2] = leftToRight ? [right(a), b.x] : [a.x, right(b)];
    const mx = (ax + bx2) / 2;
    out.push([
      [ax, cy(a)],
      [mx, cy(a)],
      [mx, cy(b)],
      [bx2, cy(b)],
    ]);
  }
  if (topToBottom || bottomToTop) {
    const [ay, by2] = topToBottom ? [bottom(a), b.y] : [a.y, bottom(b)];
    const my = (ay + by2) / 2;
    out.push([
      [cx(a), ay],
      [cx(a), my],
      [cx(b), my],
      [cx(b), by2],
    ]);
  }
  return out;
}

/** Drops zero-length segments, so a degenerate Z becomes the straight route it already is. */
function simplify(points: readonly Point[]): Point[] {
  return points.filter((p, i) => {
    const prev = points[i - 1];
    return !prev || prev[0] !== p[0] || prev[1] !== p[1];
  });
}

/**
 * The hallway between two rooms: the first candidate route that crosses no other room (straight,
 * then L, then Z, then a U detour), or the shortest one when every route crosses something.
 * Empty when the rooms overlap.
 */
export function routeBetween(a: Rect, b: Rect, others: readonly Rect[] = []): Point[] {
  if (
    overlap(a.x, right(a), b.x, right(b), 0.001) &&
    overlap(a.y, bottom(a), b.y, bottom(b), 0.001)
  ) {
    return [];
  }
  const all = [...candidates(a, b), ...detours(a, b, others)].map(simplify);
  const open = all.find((points) => clear(points, others));
  if (open) return open;
  return [...all].sort((p, q) => routeLength(p) - routeLength(q))[0] ?? [];
}

/** The midpoint of a route's longest segment, where the design puts the hallway's tag. */
export function tagPoint(points: readonly Point[]): Point | undefined {
  let best: Point | undefined;
  let bestLength = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (!p || !q) continue;
    const length = routeLength([p, q]);
    if (length > bestLength) {
      bestLength = length;
      best = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    }
  }
  return best;
}

/** The point a fraction `u` (0–1) of the way along a route, by weighted length. */
export function pointAlong(points: readonly Point[], u: number): Point | undefined {
  const total = routeLength(points);
  let d = Math.min(1, Math.max(0, u)) * total;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (!p || !q) continue;
    const length = routeLength([p, q]);
    if (d <= length) {
      const f = length ? d / length : 0;
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    }
    d -= length;
  }
  return points[points.length - 1];
}

/** The on-map label of the n-th hallway in station order: `L-01`, `L-02`, … */
export function laneLabel(index: number): string {
  return `L-${String(index + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------- the org tree (ADR-0025) */

/** Drops repeated points and the middle of three in a line, so a drop straight down is 2 points. */
function straighten(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of simplify(points)) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a && b && ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1]))) {
      out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * A Bridge hallway, from the Bridge to `child`, drawn like an org chart's connector: down from the
 * middle of the Bridge's bottom edge to a bus, along the bus, then down into the top of a
 * first-row room (`row` 0). A room in a later row is reached down the gutter on its left and
 * entered from its left side; the columns line up, so the gutter never crosses a room.
 */
export function treeRoute(bridge: Rect, child: Rect, row: number): Point[] {
  const busY = bottom(bridge) + TRUNK;
  const trunk: Point[] = [
    [cx(bridge), bottom(bridge)],
    [cx(bridge), busY],
  ];
  if (row <= 0) {
    return straighten([...trunk, [cx(child), busY], [cx(child), child.y]]);
  }
  const gutter = child.x - GAP / 2;
  return straighten([...trunk, [gutter, busY], [gutter, cy(child)], [child.x, cy(child)]]);
}

/** A branch at least this long holds a lane tag. */
const TAG_MIN = 4;

/**
 * Where a Bridge hallway's tag goes: the middle of the branch nearest its room (the last drop, or
 * the gutter run), so the tags of lanes sharing the trunk and bus never pile up. `points` run from
 * the Bridge to the room, as `treeRoute` draws them.
 */
export function branchTag(points: readonly Point[]): Point | undefined {
  for (let i = points.length - 1; i > 0; i--) {
    const p = points[i - 1];
    const q = points[i];
    if (p && q && routeLength([p, q]) >= TAG_MIN) return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  }
  return tagPoint(points);
}
