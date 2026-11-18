/** Each icon drawn on a 9 × 9 pixel grid: `X` is a lit pixel. */
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
} as const;

export type PixelIconName = keyof typeof ICONS;
export const PIXEL_ICONS = Object.keys(ICONS) as PixelIconName[];

/** One rect per run of lit pixels in a row. */
function runs(rows: readonly string[]): number[][] {
  const out: number[][] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "X") {
        x++;
        continue;
      }
      const start = x;
      while (row[x] === "X") x++;
      out.push([start, y, x - start]);
    }
  });
  return out;
}

const SIZES = { md: "size-3.5", lg: "size-5" } as const;

/** A small pixel glyph in the current text color. Decorative: the control around it is named. */
export function PixelIcon({
  name,
  size = "md",
  className = "",
}: {
  readonly name: PixelIconName;
  readonly size?: keyof typeof SIZES;
  readonly className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      data-icon={name}
      className={`block shrink-0 fill-current ${SIZES[size]} ${className}`}
    >
      {runs(ICONS[name]).map(([x, y, w]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} />
      ))}
    </svg>
  );
}
