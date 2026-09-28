import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";

export interface PanState {
  readonly x: number;
  readonly y: number;
}

/** Pixels the pointer must travel before a press becomes a drag, so clicks still select. */
export const DRAG_THRESHOLD_PX = 4;

interface Press {
  x: number;
  y: number;
  ox: number;
  oy: number;
  moved: boolean;
  id: number;
}

/**
 * Drag-to-pan for a surface. Returns the offset and pointer handlers for the surface element.
 * A press that moves less than the threshold is a click and is left to the target; a drag
 * captures the pointer and suppresses the click that follows it. A press released outside
 * the surface is dropped on the next move with no button held, so it can never start a drag.
 */
export interface UsePanOptions {
  /** Called when a press ends without becoming a drag: a tap on the surface or on a child. */
  readonly onTap?: (e: ReactPointerEvent<HTMLElement>) => void;
}

export function usePan(initial: PanState = { x: 0, y: 0 }, options: UsePanOptions = {}) {
  const { onTap } = options;
  const [offset, setOffsetState] = useState<PanState>(initial);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(offset);
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);

  const setOffset = useCallback((next: PanState) => {
    offsetRef.current = next;
    setOffsetState(next);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offsetRef.current.x,
      oy: offsetRef.current.y,
      moved: false,
      id: e.pointerId,
    };
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (e.buttons === 0) {
        // The button was released outside the surface: a stale press, never a drag.
        press.current = null;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        p.moved = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      setOffset({ x: p.ox + dx, y: p.oy + dy });
    },
    [setOffset],
  );

  const end = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (p.moved) {
        suppressClick.current = true;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } else if (e.type === "pointerup") {
        onTap?.(e);
      }
      press.current = null;
      setDragging(false);
    },
    [onTap],
  );

  /** Swallows the one click that ends a drag so nothing under the pointer gets selected. */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return {
    offset,
    dragging,
    setOffset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onClickCapture,
    },
  };
}
