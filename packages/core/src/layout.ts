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

const OVERSEER = { w: 192, h: 232 } as const; // holds the 96×128 hero rig plus two text lines (reconciliation A19)
/** Radial tiers: box size and ring radius by team count, chosen so no box leaves the square. */
const LIST_GAP = 24;

const round = (n: number) => Math.round(n * 1000) / 1000;

function boxAt(cx: number, cy: number, w: number, h: number): Box {
  return { x: round(cx - w / 2), y: round(cy - h / 2), w, h };
}

const GUTTER = 48; // design spec §04 map gutter, in layout units
const COLUMN_TIERS = [
  { maxTeams: 4, columns: 1, w: 360, h: 240 },
  { maxTeams: 10, columns: 2, w: 300, h: 220 },
  { maxTeams: 16, columns: 3, w: 240, h: 200 },
] as const;
const LIST_TIER = COLUMN_TIERS[2];

/**
 * Deterministic layout: the overseer sits at the right edge, vertically centered; teams stack
 * in one to three columns to its left (one column up to four teams, two up to ten, three up to
 * sixteen), in station order, top to bottom then left to right. Above sixteen teams the map
 * becomes a list with the overseer pinned at the top. Pure.
 */
export function layoutStation(station: Station): Layout {
  const n = station.teams.length;
  const teams: Record<string, TeamBox> = {};

  if (n > RINGS_MAX) {
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

  const tier = COLUMN_TIERS.find((t) => n <= t.maxTeams) ?? LIST_TIER;
  const overseer = boxAt(
    LAYOUT_SIZE - GUTTER - OVERSEER.w / 2,
    LAYOUT_SIZE / 2,
    OVERSEER.w,
    OVERSEER.h,
  );
  // Teams occupy the space left of the overseer, with a gutter on every side.
  const region = {
    left: GUTTER,
    right: overseer.x - GUTTER,
    top: GUTTER,
    bottom: LAYOUT_SIZE - GUTTER,
  };
  const perColumn = Math.ceil(n / tier.columns);
  const colPitch = (region.right - region.left) / tier.columns;
  station.teams.forEach((t, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    const inThisColumn = Math.min(perColumn, n - col * perColumn);
    const rowPitch = (region.bottom - region.top) / inThisColumn;
    const cx = region.left + colPitch * (col + 0.5);
    const cy = region.top + rowPitch * (row + 0.5);
    teams[t.id] = { ...boxAt(cx, cy, tier.w, tier.h), ring: 0 };
  });
  return { mode: n <= 4 ? "radial" : "rings", overseer, teams };
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

const PAIR_OFFSET = 6; // layout units, the spec's ±3px at 2 units/px
const CHEVRON_INSET = 0.85;
const BOW_RATIO = 0.22; // how far the arc leaves the chord, as a fraction of its length
const BOW_MAX = 180; // layout units; keeps long arcs inside the square

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
  // Bow perpendicular to the chord so the path arcs around the overseer core instead of through
  // it. Paired halves bow to opposite sides; a lone path bows away from the map center.
  const mid = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
  const c = centerOf(layout.overseer);
  const px = -dy / len;
  const py = dx / len;
  const towardCenter = (c.x - mid.x) * px + (c.y - mid.y) * py;
  const dir = side !== 0 ? canon * side : towardCenter > 0 ? -1 : 1;
  const bow = Math.min(len * BOW_RATIO, BOW_MAX) * dir;
  const cp = { x: mid.x + px * bow, y: mid.y + py * bow };
  const p1 = { x: p0.x + (cp.x - p0.x) * 0.6, y: p0.y + (cp.y - p0.y) * 0.6 };
  const p2 = { x: p3.x + (cp.x - p3.x) * 0.6, y: p3.y + (cp.y - p3.y) * 0.6 };

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

/**
 * The wire from a team to the overseer: a cubic from the team box's right edge into the
 * overseer box's left edge, with the chevron at the overseer end (it reads). Pure.
 */
export function overseerLinkGeometry(teamId: string, layout: Layout): HandoffGeometry {
  const team = layout.teams[teamId];
  if (!team) throw new Error(`team "${teamId}" is not in the layout`);
  const o = layout.overseer;
  const p0 = { x: team.x + team.w, y: team.y + team.h / 2 };
  const p3 = { x: o.x, y: o.y + o.h / 2 };
  const dx = p3.x - p0.x;
  const p1 = { x: p0.x + dx * 0.5, y: p0.y };
  const p2 = { x: p3.x - dx * 0.5, y: p3.y };
  const r = (n: number) => round(n);
  return {
    path: `M ${r(p0.x)} ${r(p0.y)} C ${r(p1.x)} ${r(p1.y)}, ${r(p2.x)} ${r(p2.y)}, ${r(p3.x)} ${r(p3.y)}`,
    midpoint: {
      x: r(cubicAt(p0.x, p1.x, p2.x, p3.x, 0.5)),
      y: r(cubicAt(p0.y, p1.y, p2.y, p3.y, 0.5)),
    },
    angle: (Math.atan2(p3.y - p0.y, p3.x - p0.x) * 180) / Math.PI,
    chevronAt: {
      x: r(cubicAt(p0.x, p1.x, p2.x, p3.x, 0.92)),
      y: r(cubicAt(p0.y, p1.y, p2.y, p3.y, 0.92)),
    },
    paired: false,
    side: 0,
  };
}
