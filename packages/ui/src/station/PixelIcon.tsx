import type { ItemIconName } from "@darthsaul/outerworld-ai-core";

/**
 * Every pixel icon, one row per string: `X` is a lit pixel. The grid is square and as wide as its
 * rows: the menu glyphs are 9 × 9, the capability icons (core's `ItemIconName`) 8 × 8.
 */
const ICONS = {
  /** The System menu: a gear. */
  gear: [
    "....X....",
    ".X.XXX.X.",
    "..XXXXX..",
    ".XXX.XXX.",
    "XXX...XXX",
    ".XXX.XXX.",
    "..XXXXX..",
    ".X.XXX.X.",
    "....X....",
  ],
  /** Settings: three sliders. */
  sliders: [
    "..X......",
    "XXXXXXXXX",
    "..X......",
    "......X..",
    "XXXXXXXXX",
    "......X..",
    "....X....",
    "XXXXXXXXX",
    "....X....",
  ],
  /** Abilities: a bolt. */
  bolt: [
    "....XXX..",
    "...XXX...",
    "..XXX....",
    ".XXXXXXX.",
    "....XXX..",
    "...XXX...",
    "..XX.....",
    ".XX......",
    ".X.......",
  ],
  /** Dispatch to crew: an arrow. */
  dispatch: [
    "........",
    "....X...",
    "....XX..",
    "XXXXXXX.",
    "XXXXXXX.",
    "....XX..",
    "....X...",
    "........",
  ],
  /** Read sessions: a speech bubble. */
  session: [
    "XXXXXXXX",
    "X......X",
    "X.XXXX.X",
    "X......X",
    "X.XXX..X",
    "X......X",
    "XXXX.XXX",
    "...XX...",
  ],
  /** Web & Browser: a globe. */
  web: [
    "..XXXX..",
    ".X.XX.X.",
    "X..XX..X",
    "XXXXXXXX",
    "X..XX..X",
    "X..XX..X",
    ".X.XX.X.",
    "..XXXX..",
  ],
  /** The Files prop: a folder. */
  files: [
    "XXX.....",
    "X..XXXX.",
    "X......X",
    "X......X",
    "X......X",
    "X......X",
    "XXXXXXXX",
    "........",
  ],
  /** Read files: a page with lines. */
  "file-read": [
    "XXXXX...",
    "X...XX..",
    "X.....X.",
    "X.XXX.X.",
    "X.....X.",
    "X.XXX.X.",
    "X.....X.",
    "XXXXXXX.",
  ],
  /** Skills: an open book. */
  skill: [
    "........",
    "XXX..XXX",
    "X.XXXX.X",
    "X.X..X.X",
    "X.X..X.X",
    "X.XXXX.X",
    "XXX..XXX",
    "........",
  ],
  /** List files: a bulleted list. */
  "file-list": [
    "........",
    "X.XXXXXX",
    "........",
    "X.XXXXXX",
    "........",
    "X.XXXXXX",
    "........",
    "X.XXXXXX",
  ],
  /** Write files: a pencil. */
  "file-write": [
    ".....XX.",
    "....XXXX",
    "...XXXX.",
    "..XXXX..",
    ".XXXX...",
    "XXXX....",
    "XX......",
    "X.......",
  ],
  /** Memory: a face. */
  memory: [
    "..XXXX..",
    ".X....X.",
    "X.X..X.X",
    "X......X",
    "X.XXXX.X",
    ".X....X.",
    "..XXXX..",
    "...XX...",
  ],
  /** A connector: a plug. */
  connector: [
    "X......X",
    "XX....XX",
    ".XX..XX.",
    "..XXXX..",
    "...XX...",
    "...XX...",
    "..XXXX..",
    "..XXXX..",
  ],
  /** A tool with no entry of its own: a wrench. */
  tool: [
    "......XX",
    ".....XX.",
    "....XX..",
    "...XX...",
    "..XX....",
    ".XXX....",
    "XXXX....",
    ".XX.....",
  ],
} as const satisfies Record<"gear" | "sliders" | "bolt" | ItemIconName, readonly string[]>;

export type PixelIconName = keyof typeof ICONS;
export const PIXEL_ICONS = Object.keys(ICONS) as PixelIconName[];

/** One unit-high rectangle per run of lit pixels in a row, as a single path. */
const pixelPath = (rows: readonly string[]) =>
  rows
    .flatMap((row, y) =>
      [...row.matchAll(/X+/g)].map(
        (run) => `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`,
      ),
    )
    .join("");

const SIZES = { sm: "size-3.5", md: "size-4", lg: "size-5" } as const;

export interface PixelIconProps {
  readonly name: PixelIconName;
  readonly size?: keyof typeof SIZES;
  readonly className?: string;
}

/**
 * A small pixel glyph in the current text color: the menu's icons and every capability icon from
 * core's catalog (`toolDisplay`, `propDisplay`, `connectorDisplay`). Decorative: the control or
 * text beside it carries the name.
 */
export function PixelIcon({ name, size = "md", className = "" }: PixelIconProps) {
  const rows = ICONS[name];
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${rows.length} ${rows.length}`}
      shapeRendering="crispEdges"
      data-icon={name}
      className={`block shrink-0 ${SIZES[size]} ${className}`}
    >
      <path d={pixelPath(rows)} fill="currentColor" />
    </svg>
  );
}
