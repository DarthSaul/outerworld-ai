import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Where the map's plane sits in its viewport: an offset in CSS pixels and a scale. */
export interface MapView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** The viewport's and the plane's unscaled sizes, in CSS pixels. */
export interface MapBounds {
  readonly vw: number;
  readonly vh: number;
  readonly cw: number;
  readonly ch: number;
}

export const MAX_MAP_SCALE = 2;
export const ZOOM_STEP = 1.25;
/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD = 4;
/** A focused room or chip pulled into view keeps this much room from the edge. */
const FOCUS_MARGIN = 12;

const IDENTITY: MapView = { x: 0, y: 0, scale: 1 };
const measured = (b: MapBounds) => b.vw > 0 && b.vh > 0 && b.cw > 0 && b.ch > 0;

/** Every room in view: the plane scaled down to fit (never up), centered. */
export function fitView(b: MapBounds): MapView {
  if (!measured(b)) return IDENTITY;
  const scale = Math.min(1, b.vw / b.cw, b.vh / b.ch);
  return { scale, x: (b.vw - b.cw * scale) / 2, y: (b.vh - b.ch * scale) / 2 };
}

/** Keeps part of the plane under the viewport's center, so it can't be dragged away and lost. */
export function clampView(v: MapView, b: MapBounds): MapView {
  if (!measured(b)) return v;
  const w = b.cw * v.scale;
  const h = b.ch * v.scale;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  return {
    scale: v.scale,
    x: clamp(v.x, b.vw / 2 - w, b.vw / 2),
    y: clamp(v.y, b.vh / 2 - h, b.vh / 2),
  };
}

/** Zooms by `factor` about the viewport's center, between the fitted scale and the maximum. */
export function zoomView(v: MapView, factor: number, b: MapBounds): MapView {
  if (!measured(b)) return v;
  const min = Math.min(1, fitView(b).scale);
  const scale = Math.min(MAX_MAP_SCALE, Math.max(min, v.scale * factor));
  const cx = b.vw / 2;
  const cy = b.vh / 2;
  const k = scale / v.scale;
  return clampView({ scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, b);
}

interface Drag {
  readonly id: number;
  readonly px: number;
  readonly py: number;
  readonly from: MapView;
  moved: boolean;
}

/**
 * Pan and zoom for the station map. The plane starts fitted (every room in view) and follows the
 * viewport's size until the Commander moves it; `recenter` fits it again. A press that moves is a
 * drag and swallows the click that follows, so dragging across a room doesn't select it.
 */
export function useMapView(
  viewport: RefObject<HTMLDivElement | null>,
  plane: RefObject<HTMLDivElement | null>,
) {
  const [view, setView] = useState<MapView>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const fitted = useRef(true);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);

  const bounds = useCallback((): MapBounds => {
    const v = viewport.current;
    const p = plane.current;
    return {
      vw: v?.clientWidth ?? 0,
      vh: v?.clientHeight ?? 0,
      cw: p?.offsetWidth ?? 0,
      ch: p?.offsetHeight ?? 0,
    };
  }, [viewport, plane]);

  const recenter = useCallback(() => {
    fitted.current = true;
    setView(fitView(bounds()));
  }, [bounds]);

  const zoom = useCallback(
    (factor: number) => {
      fitted.current = false;
      setView((v) => zoomView(v, factor, bounds()));
    },
    [bounds],
  );

  useLayoutEffect(() => {
    recenter();
    const el = viewport.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (fitted.current) setView(fitView(bounds()));
      else setView((v) => clampView(v, bounds()));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [recenter, bounds, viewport]);

  const moveBy = (dx: number, dy: number) => {
    fitted.current = false;
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, bounds()));
  };

  const end = (e: PointerEvent<HTMLElement>, completed: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (completed && d.moved) {
      swallowClick.current = true;
      // A browser that sends no click after a captured drag must not eat the next real one.
      setTimeout(() => {
        swallowClick.current = false;
      }, 0);
    }
  };

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, from: view, moved: false };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        d.moved = true;
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety: the drag still works while the pointer stays over the map.
        }
      }
      fitted.current = false;
      setView(clampView({ ...d.from, x: d.from.x + dx, y: d.from.y + dy }, bounds()));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e, true),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e, false),
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
    /** Tabbing to a room or chip outside the viewport pans it into view. */
    onFocusCapture: (e: FocusEvent<HTMLElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      const t = (e.target as HTMLElement).getBoundingClientRect();
      const dx =
        t.left < box.left
          ? box.left - t.left + FOCUS_MARGIN
          : t.right > box.right
            ? box.right - t.right - FOCUS_MARGIN
            : 0;
      const dy =
        t.top < box.top
          ? box.top - t.top + FOCUS_MARGIN
          : t.bottom > box.bottom
            ? box.bottom - t.bottom - FOCUS_MARGIN
            : 0;
      if (dx || dy) moveBy(dx, dy);
    },
    /** The plane moves by transform only; undo the scroll a browser makes to show focus. */
    onScroll: (e: UIEvent<HTMLElement>) => {
      e.currentTarget.scrollLeft = 0;
      e.currentTarget.scrollTop = 0;
    },
  };

  return { view, dragging, recenter, zoom, handlers };
}
