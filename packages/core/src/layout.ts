import type { Handoff, Station } from "./schema/station.js";

/** The abstract square everything is laid out in. The ui scales it to pixels. */
export const LAYOUT_SIZE = 1000;
export const RADIAL_MAX = 8;
export const RINGS_MAX = 16;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface TeamBox extends Box {
  readonly ring: 0 | 1;
}
export interface Layout {
  readonly mode: "radial" | "rings" | "list";
  readonly overseer: Box;
  readonly teams: Readonly<Record<string, TeamBox>>;
}

const OVERSEER = { w: 144, h: 160 } as const; // design spec §04, in layout units
const TEAM = { w: 280, h: 200 } as const;
const RING_RADIUS = [340, 470] as const;
const LIST_GAP = 24;

const round = (n: number) => Math.round(n * 1000) / 1000;

function boxAt(cx: number, cy: number, w: number, h: number): Box {
  return { x: round(cx - w / 2), y: round(cy - h / 2), w, h };
}

/** Pairs each item with a center on a ring, first at 12 o'clock, clockwise. */
function onRing<T>(
  items: readonly T[],
  radius: number,
  offset = 0,
): Array<[T, { x: number; y: number }]> {
  const c = LAYOUT_SIZE / 2;
  return items.map((item, i) => {
    const angle = -Math.PI / 2 + offset + (2 * Math.PI * i) / items.length;
    return [item, { x: c + radius * Math.cos(angle), y: c + radius * Math.sin(angle) }];
  });
}

/**
 * Deterministic layout: the overseer at the center; teams radial for up to 8, on two rings for
 * 9-16, in a list beyond (design spec §04). Team order is station order. Pure.
 */
export function layoutStation(station: Station): Layout {
  const n = station.teams.length;
  const overseer = boxAt(LAYOUT_SIZE / 2, LAYOUT_SIZE / 2, OVERSEER.w, OVERSEER.h);
  const teams: Record<string, TeamBox> = {};

  if (n <= RADIAL_MAX) {
    const w = TEAM.w;
    const h = TEAM.h;
    const scale = 0.8; // inner-ring scale keeps the 8-team case inside the square
    for (const [t, p] of onRing(station.teams, RING_RADIUS[0])) {
      teams[t.id] = { ...boxAt(p.x, p.y, w * scale, h * scale), ring: 0 };
    }
    return { mode: "radial", overseer, teams };
  }

  if (n <= RINGS_MAX) {
    const inner = Math.ceil(n / 2);
    const outer = n - inner;
    const w = TEAM.w * 0.6;
    const h = TEAM.h * 0.6;
    for (const [t, p] of onRing(station.teams.slice(0, inner), RING_RADIUS[0] * 0.8)) {
      teams[t.id] = { ...boxAt(p.x, p.y, w, h), ring: 0 };
    }
    for (const [t, p] of onRing(
      station.teams.slice(inner),
      RING_RADIUS[1] * 0.92,
      Math.PI / outer,
    )) {
      teams[t.id] = { ...boxAt(p.x, p.y, w, h), ring: 1 };
    }
    return { mode: "rings", overseer, teams };
  }

  // List: overseer pinned at top center, teams stacked below it, two columns.
  const cols = 2;
  const w = (LAYOUT_SIZE - LIST_GAP * (cols + 1)) / cols;
  const h = 120;
  const top = OVERSEER.h + LIST_GAP * 2;
  const overseerTop = boxAt(LAYOUT_SIZE / 2, OVERSEER.h / 2 + LIST_GAP, OVERSEER.w, OVERSEER.h);
  station.teams.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    teams[t.id] = {
      x: round(LIST_GAP + col * (w + LIST_GAP)),
      y: round(top + row * (h + LIST_GAP)),
      w: round(w),
      h,
      ring: 0,
    };
  });
  return { mode: "list", overseer: overseerTop, teams };
}

export interface HandoffGeometry {
  /** SVG path data: one cubic from the writer's center toward the reader's center. */
  readonly path: string;
  readonly midpoint: { readonly x: number; readonly y: number };
  /** Degrees, from writer to reader, screen coordinates (y down). */
  readonly angle: number;
  /** Where the chevron pair sits: just before the reading end. */
  readonly chevronAt: { readonly x: number; readonly y: number };
  readonly paired: boolean;
  /** -1 | 1 when paired (each half offset to its side), 0 otherwise. */
  readonly side: -1 | 0 | 1;
}

const PAIR_OFFSET = 6; // layout units; ui multiplies by nothing, the spec's ±3px at 2 units/px
const CHEVRON_INSET = 0.85;

const centerOf = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * Geometry for one handoff. A→B and B→A form a pair: each half is offset to its own side so both
 * are hit-testable (design spec §05). Throws only for a team missing from the layout, which is a
 * programming error since the Station validated the handoff.
 */
export function handoffGeometry(
  handoff: Handoff,
  layout: Layout,
  all: readonly Handoff[],
): HandoffGeometry {
  const from = layout.teams[handoff.from];
  const to = layout.teams[handoff.to];
  if (!from) throw new Error(`handoff ${handoff.id}: team "${handoff.from}" is not in the layout`);
  if (!to) throw new Error(`handoff ${handoff.id}: team "${handoff.to}" is not in the layout`);

  const a = centerOf(from);
  const b = centerOf(to);
  const paired = all.some((h) => h.from === handoff.to && h.to === handoff.from);
  // The lexically smaller writer id takes the +1 side so both halves agree without coordination.
  const side: -1 | 0 | 1 = paired ? (handoff.from < handoff.to ? 1 : -1) : 0;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // The normal is taken along the canonical direction (smaller id → larger id) so the two halves
  // of a pair are pushed to opposite sides instead of both following their own heading.
  const canon = handoff.from < handoff.to ? 1 : -1;
  const nx = (-dy / len) * canon * PAIR_OFFSET * side;
  const ny = (dx / len) * canon * PAIR_OFFSET * side;

  const p0 = { x: a.x + nx, y: a.y + ny };
  const p3 = { x: b.x + nx, y: b.y + ny };
  // Control points bow the path gently toward the map center so it clears the overseer core.
  const c = centerOf(layout.overseer);
  const mid = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
  const bow = 0.15;
  const cp = { x: mid.x + (c.x - mid.x) * bow, y: mid.y + (c.y - mid.y) * bow };
  const p1 = { x: p0.x + (cp.x - p0.x) * 0.5, y: p0.y + (cp.y - p0.y) * 0.5 };
  const p2 = { x: p3.x + (cp.x - p3.x) * 0.5, y: p3.y + (cp.y - p3.y) * 0.5 };

  const r = (n: number) => round(n);
  const path = `M ${r(p0.x)} ${r(p0.y)} C ${r(p1.x)} ${r(p1.y)}, ${r(p2.x)} ${r(p2.y)}, ${r(p3.x)} ${r(p3.y)}`;
  const chevronAt = {
    x: r(p0.x + (p3.x - p0.x) * CHEVRON_INSET),
    y: r(p0.y + (p3.y - p0.y) * CHEVRON_INSET),
  };
  const midpoint = {
    x: r(cubicAt(p0.x, p1.x, p2.x, p3.x, 0.5)),
    y: r(cubicAt(p0.y, p1.y, p2.y, p3.y, 0.5)),
  };
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { path, midpoint, angle, chevronAt, paired, side };
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
