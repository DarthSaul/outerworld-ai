/**
 * Station map layout for the dashboard (ADR-0013 #8, #18). Pure geometry in percent of the map
 * viewport: x and y are the top-left corner, w and h the size. The Bridge (the Overseer's room)
 * sits in the middle where the design puts it; the other rooms take slots around it in station
 * order, and their color index, sector, and position all follow from that order, so the schema
 * needs no layout fields. Hallways are orthogonal polylines between doors on the rooms' sides.
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
}

export const BRIDGE_RECT: Rect = { x: 38, y: 36, w: 24, h: 28 };
export const BRIDGE_SECTOR = "HQ";

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** The design's three rooms: top left, top right, bottom center. */
const TOP_LEFT = r(4, 8, 28, 36);
const TOP_RIGHT = r(68, 8, 28, 36);
const BOTTOM = r(28, 68, 44, 29);

/** Slots by how many rooms surround the Bridge. Past eight rooms, `gridSlots` takes over. */
const SLOTS: Readonly<Record<number, readonly Rect[]>> = {
  0: [],
  1: [r(4, 30, 28, 40)],
  2: [r(4, 30, 28, 40), r(68, 30, 28, 40)],
  3: [TOP_LEFT, TOP_RIGHT, BOTTOM],
  4: [TOP_LEFT, TOP_RIGHT, r(4, 68, 30, 29), r(66, 68, 30, 29)],
  5: [r(4, 4, 28, 28), r(68, 4, 28, 28), r(4, 68, 28, 28), r(68, 68, 28, 28), r(36, 4, 28, 26)],
  6: [
    r(4, 4, 28, 28),
    r(68, 4, 28, 28),
    r(4, 68, 28, 28),
    r(68, 68, 28, 28),
    r(36, 4, 28, 26),
    r(36, 70, 28, 26),
  ],
  7: [
    r(4, 4, 28, 28),
    r(68, 4, 28, 28),
    r(4, 68, 28, 28),
    r(68, 68, 28, 28),
    r(36, 4, 28, 26),
    r(36, 70, 28, 26),
    r(4, 36, 28, 28),
  ],
  8: [
    r(4, 4, 28, 28),
    r(68, 4, 28, 28),
    r(4, 68, 28, 28),
    r(68, 68, 28, 28),
    r(36, 4, 28, 26),
    r(36, 70, 28, 26),
    r(4, 36, 28, 28),
    r(68, 36, 28, 28),
  ],
};

/** A grid around the middle cell for crowded stations; the Bridge keeps its own place. */
function gridSlots(count: number): Rect[] {
  const cols = Math.ceil(Math.sqrt(count + 1));
  const rows = Math.ceil((count + 1) / cols);
  const gap = 2;
  const w = (100 - gap * (cols + 1)) / cols;
  const h = (100 - gap * (rows + 1)) / rows;
  const middle = Math.floor((rows * cols) / 2);
  const slots: Rect[] = [];
  for (let i = 0; i < rows * cols && slots.length < count; i++) {
    if (i === middle) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push(r(gap + col * (w + gap), gap + row * (h + gap), w, h));
  }
  return slots;
}

/** Sector label for the n-th room: A-1 … Z-1, then A-2 … */
export function sectorFor(index: number): string {
  return `${String.fromCharCode(65 + (index % 26))}-${Math.floor(index / 26) + 1}`;
}

/**
 * Places rooms on the map. `roomIds` is station order; `bridgeId` (the Overseer's room, when
 * there is one) goes in the middle. Color index and sector count only the non-Bridge rooms.
 */
export function placeRooms(roomIds: readonly string[], bridgeId?: string): RoomPlacement[] {
  const others = roomIds.filter((id) => id !== bridgeId);
  const crowded = others.length > 8;
  const slots = crowded ? gridSlots(others.length) : (SLOTS[others.length] ?? []);
  const placed: RoomPlacement[] = others.map((id, i) => ({
    id,
    rect: slots[i] ?? BRIDGE_RECT,
    colorIndex: i,
    sector: sectorFor(i),
    bridge: false,
  }));
  if (bridgeId && roomIds.includes(bridgeId)) {
    const rect = crowded ? bridgeInGrid(others.length) : BRIDGE_RECT;
    placed.unshift({ id: bridgeId, rect, colorIndex: 0, sector: BRIDGE_SECTOR, bridge: true });
  }
  return placed;
}

function bridgeInGrid(count: number): Rect {
  const cols = Math.ceil(Math.sqrt(count + 1));
  const rows = Math.ceil((count + 1) / cols);
  const gap = 2;
  const w = (100 - gap * (cols + 1)) / cols;
  const h = (100 - gap * (rows + 1)) / rows;
  const middle = Math.floor((rows * cols) / 2);
  return r(gap + (middle % cols) * (w + gap), gap + Math.floor(middle / cols) * (h + gap), w, h);
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
