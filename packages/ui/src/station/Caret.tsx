import type { ButtonHTMLAttributes } from "react";

export type CaretDirection = "up" | "down" | "left" | "right";

/** Each direction drawn on its own pixel grid, so nothing is rotated and the box fits the shape. */
const SHAPES: Record<
  CaretDirection,
  { readonly box: string; readonly rects: readonly number[][] }
> = {
  down: {
    box: "0 0 5 3",
    rects: [
      [0, 0, 5, 1],
      [1, 1, 3, 1],
      [2, 2, 1, 1],
    ],
  },
  up: {
    box: "0 0 5 3",
    rects: [
      [2, 0, 1, 1],
      [1, 1, 3, 1],
      [0, 2, 5, 1],
    ],
  },
  right: {
    box: "0 0 3 5",
    rects: [
      [0, 0, 1, 5],
      [1, 1, 1, 3],
      [2, 2, 1, 1],
    ],
  },
  left: {
    box: "0 0 3 5",
    rects: [
      [2, 0, 1, 5],
      [1, 1, 1, 3],
      [0, 2, 1, 1],
    ],
  },
};

/** Width × height per size, for a caret lying flat (up / down); standing ones swap them. */
const SIZES = {
  md: { flat: "h-1.25 w-2", standing: "h-2 w-1.25" },
  lg: { flat: "h-2.25 w-3.75", standing: "h-3.75 w-2.25" },
} as const;

/** A pixel triangle in the current text color. Decorative: the control around it is named. */
export function Caret({
  direction,
  size = "md",
  className = "",
}: {
  readonly direction: CaretDirection;
  readonly size?: keyof typeof SIZES;
  readonly className?: string;
}) {
  const { box, rects } = SHAPES[direction];
  const flat = direction === "up" || direction === "down";
  return (
    <svg
      aria-hidden="true"
      viewBox={box}
      shapeRendering="crispEdges"
      data-caret-direction={direction}
      className={`block shrink-0 fill-current ${SIZES[size][flat ? "flat" : "standing"]} ${className}`}
    >
      {rects.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  );
}

export interface CaretButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  readonly direction: CaretDirection;
}

/**
 * A panel strip's fold control (the scanner's, the crew column's): a square button with the caret
 * centered in it. The caller names it (`aria-label`) and says what it folds (`aria-expanded`).
 */
export function CaretButton({ direction, className = "", ...rest }: CaretButtonProps) {
  return (
    <button
      type="button"
      data-caret
      className={`inline-flex size-5 shrink-0 cursor-pointer content-center items-center justify-center border-2 border-transparent bg-transparent p-0 text-cyan leading-none hover:border-line-soft hover:text-fg-hi focus-visible:border-cyan ${className}`}
      {...rest}
    >
      <Caret direction={direction} />
    </button>
  );
}
