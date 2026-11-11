import { type KeyboardEvent, type PointerEvent, useRef } from "react";

/** How far one arrow-key press moves a handle, in pixels. */
export const RESIZE_KEY_STEP = 24;

export interface ResizeHandleProps {
  /** Accessible name, e.g. "Resize the crew column". */
  readonly label: string;
  /** The controlled pane's share of the row, in percent, for assistive tech. */
  readonly valueNow: number;
  readonly valueMin: number;
  readonly valueMax: number;
  /**
   * Called with the pointer's horizontal movement in pixels since the last call (drag), or
   * ±RESIZE_KEY_STEP for an arrow key. Positive is rightwards.
   */
  readonly onResize: (dx: number) => void;
  /** Double-click or Enter: back to the default width. */
  readonly onReset?: () => void;
  readonly className?: string;
}

/**
 * A vertical splitter between two columns (ADR-0014): drag it, or focus it and use the arrow keys.
 * It is the gap between the columns: an `<hr>` whose 2px content box lights on hover, focus, and
 * drag.
 */
export function ResizeHandle({
  label,
  valueNow,
  valueMin,
  valueMax,
  onResize,
  onReset,
  className = "",
}: ResizeHandleProps) {
  const last = useRef<number | null>(null);

  const down = (e: PointerEvent<HTMLHRElement>) => {
    if (e.button !== 0) return;
    last.current = e.clientX;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer (tests) has nothing to capture; moves still arrive.
    }
    e.preventDefault();
  };
  const move = (e: PointerEvent<HTMLHRElement>) => {
    if (last.current === null) return;
    const dx = e.clientX - last.current;
    if (dx === 0) return;
    last.current = e.clientX;
    onResize(dx);
  };
  const up = () => {
    last.current = null;
  };
  const key = (e: KeyboardEvent<HTMLHRElement>) => {
    if (e.key === "ArrowLeft") onResize(-RESIZE_KEY_STEP);
    else if (e.key === "ArrowRight") onResize(RESIZE_KEY_STEP);
    else if (e.key === "Enter" && onReset) onReset();
    else return;
    e.preventDefault();
  };

  return (
    <hr
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={Math.round(valueMin)}
      aria-valuemax={Math.round(valueMax)}
      tabIndex={0}
      data-resize-handle=""
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
      className={`m-0 h-auto w-3.5 shrink-0 cursor-col-resize touch-none select-none self-stretch border-0 bg-transparent bg-clip-content px-1.5 outline-none hover:bg-line focus-visible:bg-cyan active:bg-cyan ${className}`}
    />
  );
}
