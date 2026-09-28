import type { Station, StationState } from "@darthsaul/outerworld-ai-core";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DetailPanel } from "./DetailPanel.js";
import { StationMap } from "./StationMap.js";
import type { Selection } from "./selection.js";
import { useDesktop } from "./useDesktop.js";

export interface StationViewProps {
  readonly station: Station;
  readonly state: StationState;
  /** Controlled selection; omit to let the view own it. */
  readonly selection?: Selection | null;
  readonly onSelectionChange?: (selection: Selection | null) => void;
  /** Force the layout (tests, gallery). Otherwise follows the desktop breakpoint. */
  readonly desktop?: boolean;
  /** Extra controls rendered above the map when there is no sidebar. */
  readonly toolbar?: ReactNode;
  /**
   * Left column on desktop: settings and everything that is not the map or the report. With a
   * sidebar the desktop grid is 1fr 3fr 1fr (sidebar, map, report); without one it is map + panel.
   */
  readonly sidebar?: ReactNode;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const MAP_UNITS = 1000;

/**
 * The dashboard's main view: owns the selection (or mirrors a controlled one), lays out sidebar,
 * map, and report panel on desktop, stacks everything with the panel as a bottom sheet below the
 * breakpoint, fits the map's zoom to its column, and clears on Escape.
 */
export function StationView({
  station,
  state,
  selection: controlled,
  onSelectionChange,
  desktop: forced,
  toolbar,
  sidebar,
}: StationViewProps) {
  const detected = useDesktop(true);
  const desktop = forced ?? detected;
  const [own, setOwn] = useState<Selection | null>(null);
  const selection = controlled !== undefined ? controlled : own;
  const setSelection = useCallback(
    (s: Selection | null) => {
      if (controlled === undefined) setOwn(s);
      onSelectionChange?.(s);
    },
    [controlled, onSelectionChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelection]);

  // Fit the map to its column: one unit per pixel at 1, clamped to the design's zoom range.
  const mapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fitZoom = () => {
      const w = el.clientWidth;
      if (w > 0) setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, w / MAP_UNITS)));
    };
    fitZoom();
    const ro = new ResizeObserver(fitZoom);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const panel = (
    <DetailPanel
      station={station}
      state={state}
      selection={selection}
      onSelect={setSelection}
      {...(desktop ? {} : { onClose: () => setSelection(null), sheet: true })}
    />
  );
  const sidebarBlock = sidebar ? (
    <div className="flex min-w-0 flex-col gap-(--ow-space-4)" data-sidebar>
      {sidebar}
    </div>
  ) : null;

  return (
    <div
      className="ow-station-view flex flex-col gap-(--ow-space-4)"
      data-station-view
      data-layout={desktop ? "split" : "stacked"}
    >
      {toolbar && !sidebar ? (
        <div className="flex flex-wrap items-center gap-(--ow-space-3)">{toolbar}</div>
      ) : null}
      {desktop ? (
        <div
          className={
            sidebar
              ? "grid grid-cols-[1fr_3fr_1fr] items-start gap-(--ow-space-6)"
              : "grid grid-cols-[minmax(0,1fr)_var(--ow-size-panel-w)] items-start gap-(--ow-space-6)"
          }
          data-columns={sidebar ? "3" : "2"}
        >
          {sidebarBlock}
          <div ref={mapRef} className="min-w-0 overflow-x-auto">
            <StationMap
              station={station}
              state={state}
              selection={selection}
              onSelect={setSelection}
              zoom={zoom}
            />
          </div>
          {panel}
        </div>
      ) : (
        <>
          {sidebarBlock}
          <StationMap
            station={station}
            state={state}
            selection={selection}
            onSelect={setSelection}
            stacked
          />
          {selection ? (
            <div className="ow-sheet fixed inset-x-0 bottom-0 z-10 max-h-[80vh] overflow-y-auto">
              {panel}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
