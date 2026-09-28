import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

export interface PanState {
  readonly x: number;
  readonly y: number;
}

/** Pixels the pointer must travel before a press becomes a drag, so clicks still select. */
export const DRAG_THRESHOLD_PX = 4;

/**
 * Drag-to-pan for a surface. Returns the offset and pointer handlers for the surface element.
 * A press that moves less than the threshold is a click and is left to the target; a drag
 * captures the pointer and suppresses the click that would follow it.
 */
export function usePan(initial: PanState = { x: 0, y: 0 }) {
  const [offset, setOffset] = useState<PanState>(initial);
  const [dragging, setDragging] = useState(false);
  const press = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
    id: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      press.current = {
        x: e.clientX,
        y: e.clientY,
        ox: offset.x,
        oy: offset.y,
        moved: false,
        id: e.pointerId,
      };
    },
    [offset],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      p.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setOffset({ x: p.ox + dx, y: p.oy + dy });
  }, []);

  const end = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (p.moved && e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    press.current = null;
    setDragging(false);
  }, []);

  /** Swallows the click that ends a drag so nothing under the pointer gets selected. */
  const onClickCapture = useCallback(
    (e: ReactPointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
      if (dragging) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [dragging],
  );

  return {
    offset,
    dragging,
    setOffset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onClickCapture,
    },
  };
}
