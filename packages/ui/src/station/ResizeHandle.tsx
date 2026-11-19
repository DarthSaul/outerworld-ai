import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";

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
   * A resize begins: a drag starts, or an arrow key is pressed. The parent keeps the width it had
   * here, and `onResize` reports movement from it.
   */
  readonly onResizeStart?: () => void;
  /**
   * Called with how far the handle has moved since `onResizeStart`, in pixels: the pointer's
   * movement since the drag began, or ±RESIZE_KEY_STEP for an arrow key. Positive is rightwards.
   * Measuring from the start keeps the edge under the pointer, even after it was held at a limit.
   */
  readonly onResize: (dx: number) => void;
  /** Double-click or Enter: back to the default width. */
  readonly onReset?: () => void;
  readonly className?: string;
}

/**
 * A vertical splitter between two columns (ADR-0014): drag it, or focus it and use the arrow keys.
 * It is the gap between the columns: an `<hr>` whose 2px content box lights on hover, focus, and
 * drag. A drag listens on the window, so it ends on any release: over another element, outside
 * the window, when the window loses focus, or when a move arrives with the button already up.
 */
export function ResizeHandle({
  label,
  valueNow,
  valueMin,
  valueMax,
  onResizeStart,
  onResize,
  onReset,
  className = "",
}: ResizeHandleProps) {
  /** Ends the drag in progress, if any: takes its window listeners down. */
  const stop = useRef<(() => void) | null>(null);
  // The latest callbacks, so a drag that outlives a render calls the current ones.
  const latest = useRef({ onResize });
  latest.current = { onResize };

  // Unmounted mid-drag: drop the listeners with it.
  useEffect(() => () => stop.current?.(), []);

  const down = (e: PointerEvent<HTMLHRElement>) => {
    if (e.button !== 0 || stop.current) return;
    const id = e.pointerId;
    const startX = e.clientX;
    let last = 0;
    const handle = e.currentTarget;
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id) return;
      // A mouse whose button is already up missed its release (it happened outside the page).
      if (ev.pointerType === "mouse" && ev.buttons === 0) return end();
      const dx = ev.clientX - startX;
      if (dx === last) return;
      last = dx;
      latest.current.onResize(dx);
    };
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === id) end();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", end);
      handle.removeEventListener("lostpointercapture", end);
      handle.removeAttribute("data-dragging");
      stop.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", end);
    stop.current = end;
    handle.setAttribute("data-dragging", "");
    onResizeStart?.();
    try {
      handle.setPointerCapture(id);
      handle.addEventListener("lostpointercapture", end);
    } catch {
      // A synthetic pointer (tests) has nothing to capture; the window still hears it.
    }
    e.preventDefault();
  };
  const key = (e: KeyboardEvent<HTMLHRElement>) => {
    const step =
      e.key === "ArrowLeft" ? -RESIZE_KEY_STEP : e.key === "ArrowRight" ? RESIZE_KEY_STEP : 0;
    // Mid-drag the pointer owns the width: a key would move the start out from under it.
    if (stop.current && (step || e.key === "Enter")) {
      e.preventDefault();
      return;
    }
    if (step) {
      onResizeStart?.();
      onResize(step);
    } else if (e.key === "Enter" && onReset) onReset();
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
      onDoubleClick={onReset}
      onKeyDown={key}
      className={`m-0 h-auto w-3.5 shrink-0 cursor-col-resize touch-none select-none self-stretch border-0 bg-transparent bg-clip-content px-1.5 outline-none hover:bg-line focus-visible:bg-cyan data-dragging:bg-cyan ${className}`}
    />
  );
}
