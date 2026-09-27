/**
 * Rig part geometry: grid-snapped rects on the 24×32 unit grid (16×16 for the emblem, 48×64 for
 * the overseer's hero rig). Roles map to CSS variables in sprite.tsx; no literal colors here.
 * Bodies, heads, and shoulders come from docs/design/rig/rig-parts-v0.svg; the rest is drawn to
 * design spec v0.2 §07 and §07b. Proportion study, not final art.
 */

export type RigRole =
  | "primary"
  | "secondary"
  | "frame"
  | "highlight"
  | "glow"
  | "visor"
  | "base"
  | "shade"
  | "mark";

/** [x, y, width, height, role] in grid units. */
export type Rect = readonly [number, number, number, number, RigRole];

export interface Part {
  readonly viewBox: readonly [number, number];
  readonly rects: readonly Rect[];
}

export const RIG_PARTS = {
  "body-idle": {
    viewBox: [24, 32],
    rects: [
      [11, 8, 2, 1, "frame"],
      [9, 9, 6, 1, "highlight"],
      [9, 10, 6, 8, "primary"],
      [9, 11, 1, 5, "secondary"],
      [14, 11, 1, 5, "secondary"],
      [10, 16, 4, 2, "secondary"],
      [9, 18, 6, 1, "frame"],
      [6, 12, 2, 4, "secondary"],
      [16, 12, 2, 4, "secondary"],
      [6, 16, 2, 1, "glow"],
      [16, 16, 2, 1, "glow"],
      [6, 17, 2, 5, "primary"],
      [16, 17, 2, 5, "primary"],
      [6, 22, 2, 2, "frame"],
      [16, 22, 2, 2, "frame"],
      [8, 19, 3, 5, "primary"],
      [13, 19, 3, 5, "primary"],
      [8, 24, 3, 1, "frame"],
      [13, 24, 3, 1, "frame"],
      [9, 24, 1, 1, "glow"],
      [14, 24, 1, 1, "glow"],
      [8, 25, 3, 5, "secondary"],
      [13, 25, 3, 5, "secondary"],
      [9, 26, 1, 3, "primary"],
      [14, 26, 1, 3, "primary"],
      [7, 30, 4, 2, "frame"],
      [13, 30, 4, 2, "frame"],
    ],
  },
  "body-active": {
    viewBox: [24, 32],
    rects: [
      [11, 8, 2, 1, "frame"],
      [9, 9, 6, 1, "highlight"],
      [9, 10, 6, 8, "primary"],
      [9, 11, 1, 5, "secondary"],
      [14, 11, 1, 5, "secondary"],
      [10, 16, 4, 2, "secondary"],
      [9, 18, 6, 1, "frame"],
      [5, 12, 2, 4, "secondary"],
      [5, 16, 2, 1, "glow"],
      [5, 17, 2, 4, "primary"],
      [5, 21, 2, 2, "frame"],
      [17, 10, 3, 2, "secondary"],
      [20, 10, 1, 2, "glow"],
      [21, 5, 2, 5, "primary"],
      [21, 3, 2, 2, "frame"],
      [7, 19, 3, 5, "primary"],
      [7, 24, 3, 1, "frame"],
      [8, 24, 1, 1, "glow"],
      [6, 25, 3, 5, "secondary"],
      [7, 26, 1, 3, "primary"],
      [5, 30, 4, 2, "frame"],
      [13, 19, 3, 5, "primary"],
      [13, 24, 3, 1, "frame"],
      [14, 24, 1, 1, "glow"],
      [14, 25, 3, 5, "secondary"],
      [15, 26, 1, 3, "primary"],
      [14, 30, 4, 2, "frame"],
    ],
  },
  "head-dome": {
    viewBox: [24, 32],
    rects: [
      [8, 1, 1, 2, "secondary"],
      [15, 1, 1, 2, "secondary"],
      [10, 1, 4, 1, "primary"],
      [9, 2, 6, 1, "primary"],
      [8, 3, 8, 4, "primary"],
      [8, 4, 8, 2, "visor"],
      [9, 4, 6, 2, "glow"],
      [9, 7, 6, 1, "secondary"],
    ],
  },
  "head-wedge": {
    viewBox: [24, 32],
    rects: [
      [9, 1, 6, 1, "frame"],
      [8, 2, 8, 5, "primary"],
      [8, 3, 8, 1, "visor"],
      [9, 3, 6, 1, "glow"],
      [8, 5, 1, 1, "frame"],
      [15, 5, 1, 1, "frame"],
      [10, 5, 4, 3, "secondary"],
    ],
  },
  "head-crest": {
    viewBox: [24, 32],
    rects: [
      [11, 0, 2, 2, "secondary"],
      [7, 3, 1, 3, "secondary"],
      [16, 3, 1, 3, "secondary"],
      [9, 2, 6, 1, "primary"],
      [8, 3, 8, 4, "primary"],
      [8, 4, 8, 2, "visor"],
      [9, 4, 2, 2, "glow"],
      [13, 4, 2, 2, "glow"],
      [9, 7, 6, 1, "secondary"],
    ],
  },
  "shoulder-ball": {
    viewBox: [24, 32],
    rects: [
      [6, 9, 3, 3, "secondary"],
      [15, 9, 3, 3, "secondary"],
      [7, 10, 1, 1, "glow"],
      [16, 10, 1, 1, "glow"],
    ],
  },
  "shoulder-pauldron": {
    viewBox: [24, 32],
    rects: [
      [5, 9, 4, 1, "highlight"],
      [5, 10, 4, 2, "primary"],
      [15, 9, 4, 1, "highlight"],
      [15, 10, 4, 2, "primary"],
      [6, 12, 2, 1, "frame"],
      [16, 12, 2, 1, "frame"],
    ],
  },
  "trace-core": {
    viewBox: [24, 32],
    rects: [
      [11, 12, 2, 1, "glow"],
      [10, 13, 4, 1, "glow"],
      [11, 14, 2, 1, "glow"],
    ],
  },
  "trace-bar": {
    viewBox: [24, 32],
    rects: [[10, 13, 4, 1, "glow"]],
  },
  "trace-chevron": {
    viewBox: [24, 32],
    rects: [
      [10, 12, 1, 1, "glow"],
      [11, 13, 2, 1, "glow"],
      [10, 14, 1, 1, "glow"],
    ],
  },
  "trace-split": {
    viewBox: [24, 32],
    rects: [
      [10, 12, 1, 3, "glow"],
      [13, 12, 1, 3, "glow"],
    ],
  },
  "trace-frame": {
    viewBox: [24, 32],
    rects: [
      [10, 12, 4, 1, "glow"],
      [10, 13, 1, 1, "glow"],
      [13, 13, 1, 1, "glow"],
      [10, 14, 4, 1, "glow"],
    ],
  },
  "trace-twin": {
    viewBox: [24, 32],
    rects: [
      [10, 13, 1, 1, "glow"],
      [13, 13, 1, 1, "glow"],
    ],
  },
  "accessory-antenna": {
    viewBox: [24, 32],
    rects: [
      [18, 2, 1, 5, "secondary"],
      [18, 1, 1, 1, "glow"],
    ],
  },
  "accessory-thruster": {
    viewBox: [24, 32],
    rects: [
      [4, 17, 1, 5, "secondary"],
      [19, 17, 1, 5, "secondary"],
      [4, 22, 1, 1, "glow"],
      [19, 22, 1, 1, "glow"],
    ],
  },
  "accessory-plate": {
    viewBox: [24, 32],
    rects: [
      [5, 13, 1, 4, "primary"],
      [18, 13, 1, 4, "primary"],
      [5, 17, 1, 1, "glow"],
      [18, 17, 1, 1, "glow"],
    ],
  },
  "accessory-crest": {
    viewBox: [24, 32],
    rects: [
      [6, 2, 1, 3, "secondary"],
      [17, 2, 1, 3, "secondary"],
      [6, 2, 1, 1, "glow"],
      [17, 2, 1, 1, "glow"],
    ],
  },
  "glyph-check": {
    viewBox: [24, 32],
    rects: [
      [18, 2, 1, 1, "glow"],
      [19, 3, 1, 1, "glow"],
      [20, 2, 1, 1, "glow"],
      [21, 1, 1, 1, "glow"],
      [22, 0, 1, 1, "glow"],
    ],
  },
  "glyph-exclaim": {
    viewBox: [24, 32],
    rects: [
      [20, 0, 1, 3, "glow"],
      [20, 4, 1, 1, "glow"],
    ],
  },
  "emblem-disc": {
    viewBox: [16, 16],
    rects: [
      [5, 0, 6, 1, "base"],
      [3, 1, 10, 1, "base"],
      [2, 2, 12, 1, "base"],
      [1, 3, 14, 1, "base"],
      [1, 4, 14, 1, "base"],
      [0, 5, 16, 1, "base"],
      [0, 6, 16, 1, "base"],
      [0, 7, 16, 1, "base"],
      [0, 8, 16, 1, "base"],
      [0, 9, 16, 1, "base"],
      [0, 10, 16, 1, "base"],
      [1, 11, 14, 1, "base"],
      [1, 12, 14, 1, "base"],
      [2, 13, 12, 1, "base"],
      [3, 14, 10, 1, "base"],
      [5, 15, 6, 1, "base"],
      [14, 9, 2, 1, "shade"],
      [12, 10, 4, 1, "shade"],
      [10, 11, 5, 1, "shade"],
      [8, 12, 7, 1, "shade"],
      [7, 13, 7, 1, "shade"],
      [6, 14, 7, 1, "shade"],
      [6, 15, 5, 1, "shade"],
      [6, 0, 4, 1, "glow"],
      [4, 1, 5, 1, "glow"],
      [2, 5, 9, 1, "glow"],
      [3, 8, 7, 1, "glow"],
      [9, 6, 3, 1, "glow"],
    ],
  },
  "mark-spire": {
    viewBox: [16, 16],
    rects: [
      [11, 3, 1, 4, "mark"],
      [10, 7, 3, 1, "mark"],
    ],
  },
  "mark-forge": {
    viewBox: [16, 16],
    rects: [
      [10, 4, 3, 2, "mark"],
      [11, 3, 1, 1, "mark"],
      [9, 6, 5, 1, "mark"],
    ],
  },
  "mark-dome": {
    viewBox: [16, 16],
    rects: [
      [10, 4, 3, 1, "mark"],
      [11, 3, 1, 1, "mark"],
      [9, 5, 5, 1, "mark"],
    ],
  },
  "mark-archive": {
    viewBox: [16, 16],
    rects: [
      [9, 3, 5, 1, "mark"],
      [9, 5, 5, 1, "mark"],
      [9, 7, 5, 1, "mark"],
    ],
  },
  "mark-beacon": {
    viewBox: [16, 16],
    rects: [
      [11, 2, 1, 3, "mark"],
      [10, 5, 3, 1, "mark"],
      [9, 4, 1, 1, "mark"],
      [13, 4, 1, 1, "mark"],
    ],
  },
  hero: {
    viewBox: [48, 64],
    rects: [
      [22, 0, 4, 2, "secondary"],
      [23, 0, 2, 1, "glow"],
      [19, 1, 3, 1, "secondary"],
      [26, 1, 3, 1, "secondary"],
      [18, 2, 12, 2, "primary"],
      [16, 4, 16, 8, "primary"],
      [16, 4, 16, 1, "highlight"],
      [17, 6, 14, 3, "visor"],
      [18, 6, 12, 3, "glow"],
      [19, 10, 2, 1, "frame"],
      [23, 10, 2, 1, "frame"],
      [27, 10, 2, 1, "frame"],
      [18, 12, 12, 2, "secondary"],
      [21, 14, 6, 2, "frame"],
      [6, 16, 10, 6, "primary"],
      [6, 16, 10, 1, "highlight"],
      [32, 16, 10, 6, "primary"],
      [32, 16, 10, 1, "highlight"],
      [10, 20, 2, 1, "glow"],
      [36, 20, 2, 1, "glow"],
      [16, 16, 16, 1, "highlight"],
      [16, 17, 16, 20, "primary"],
      [18, 19, 4, 6, "frame"],
      [26, 19, 4, 6, "frame"],
      [19, 20, 2, 1, "secondary"],
      [19, 22, 2, 1, "secondary"],
      [27, 20, 2, 1, "secondary"],
      [27, 22, 2, 1, "secondary"],
      [20, 26, 8, 1, "glow"],
      [20, 27, 1, 5, "glow"],
      [27, 27, 1, 5, "glow"],
      [20, 32, 8, 1, "glow"],
      [18, 34, 12, 3, "secondary"],
      [8, 22, 6, 10, "secondary"],
      [34, 22, 6, 10, "secondary"],
      [9, 31, 4, 1, "glow"],
      [35, 31, 4, 1, "glow"],
      [7, 32, 8, 10, "primary"],
      [33, 32, 8, 10, "primary"],
      [8, 42, 6, 3, "frame"],
      [34, 42, 6, 3, "frame"],
      [2, 18, 4, 14, "secondary"],
      [42, 18, 4, 14, "secondary"],
      [3, 32, 2, 2, "glow"],
      [43, 32, 2, 2, "glow"],
      [14, 37, 20, 5, "primary"],
      [14, 41, 20, 1, "frame"],
      [16, 42, 6, 8, "primary"],
      [26, 42, 6, 8, "primary"],
      [15, 50, 8, 3, "secondary"],
      [25, 50, 8, 3, "secondary"],
      [18, 51, 2, 1, "glow"],
      [28, 51, 2, 1, "glow"],
      [16, 53, 6, 7, "secondary"],
      [26, 53, 6, 7, "secondary"],
      [18, 54, 2, 5, "primary"],
      [28, 54, 2, 5, "primary"],
      [12, 60, 10, 4, "frame"],
      [26, 60, 10, 4, "frame"],
    ],
  },
} as const satisfies Record<string, Part>;

export type RigPartName = keyof typeof RIG_PARTS;
