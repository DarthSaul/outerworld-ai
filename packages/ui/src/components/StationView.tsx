import { LAYOUT_SIZE, type Station, type StationState, term } from "@darthsaul/outerworld-ai-core";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ZOOM } from "../tokens/tokens.js";
import { DetailPanel } from "./DetailPanel.js";
import { Pane } from "./Pane.js";
import { StationMap } from "./StationMap.js";
import type { Selection } from "./selection.js";
import { useDesktop } from "./useDesktop.js";
import { usePan } from "./usePan.js";

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
   * sidebar the desktop grid is 1fr 3fr 2fr (sidebar, map, report); without one it is map + panel.
   */
  readonly sidebar?: ReactNode;
}

const clampZoom = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, z));

/**
 * The dashboard's main view: owns the selection (or mirrors a controlled one), lays out sidebar,
 * map, and report panel on desktop, stacks everything with the panel as a bottom sheet below the
 * breakpoint, fits the map's zoom to its column, and clears on Escape or a click on empty map.
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
  const clear = useCallback(() => setSelection(null), [setSelection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  // Fit the map to its column on first layout and center it; afterwards the user pans and zooms.
  const mapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  /** A tap on the pan surface itself (not on a team, agent, or path) clears the selection. */
  const onTap = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const t = e.target as HTMLElement;
      if (t === e.currentTarget || t.hasAttribute("data-map-pan-inner")) clear();
    },
    [clear],
  );
  const pan = usePan(undefined, { onTap });
  const { setOffset } = pan;
  const fitMap = useCallback(() => {
    const el = mapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w <= 0) return;
    const z = clampZoom(Math.min(w, h || w) / LAYOUT_SIZE);
    setZoom(z);
    setOffset({ x: (w - LAYOUT_SIZE * z) / 2, y: Math.max(0, (h - LAYOUT_SIZE * z) / 2) });
  }, [setOffset]);
  useLayoutEffect(() => {
    fitMap();
  }, [fitMap]);
  const zoomBy = useCallback(
    (delta: number) => setZoom((z) => clampZoom(Math.round((z + delta) * 100) / 100)),
    [],
  );
  const zoomIn = useCallback(() => zoomBy(ZOOM.step), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-ZOOM.step), [zoomBy]);

  const panel = (
    <DetailPanel
      station={station}
      state={state}
      selection={selection}
      onSelect={setSelection}
      bare
      {...(desktop ? {} : { onClose: clear, sheet: true })}
    />
  );
  const selectionLabel = selection ? `${selection.kind} · ${selection.id}` : "none";
  const sidebarPane = sidebar ? (
    <Pane title="Overview">
      <div className="flex min-w-0 flex-col gap-(--ow-space-4) p-(--ow-space-4)" data-sidebar>
        {sidebar}
      </div>
    </Pane>
  ) : null;

  return (
    <div
      className="ow-station-view flex min-h-0 flex-1 flex-col gap-(--ow-space-4)"
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
              ? "grid min-h-0 flex-1 grid-cols-[1fr_3fr_2fr] grid-rows-[minmax(0,1fr)] items-stretch gap-(--ow-space-4) overflow-hidden"
              : "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_var(--ow-size-panel-w)] grid-rows-[minmax(0,1fr)] items-stretch gap-(--ow-space-4) overflow-hidden"
          }
          data-columns={sidebar ? "3" : "2"}
        >
          {sidebarPane}
          <Pane
            title="Map"
            surface="void"
            menu={
              <>
                <span>
                  {term("proof.asOf")} {state.provenance.asOf}
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  aria-label="Zoom out"
                  className="px-(--ow-space-1)"
                  onClick={zoomOut}
                >
                  −
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  className="px-(--ow-space-1)"
                  onClick={zoomIn}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label="Fit map"
                  className="px-(--ow-space-1)"
                  onClick={fitMap}
                >
                  Fit
                </button>
              </>
            }
          >
            <div
              ref={mapRef}
              className="ow-map-pan h-full min-h-0 min-w-0 touch-none select-none"
              data-map-pan
              data-dragging={pan.dragging ? "true" : undefined}
              {...pan.handlers}
            >
              <div
                className="ow-map-pan-inner"
                data-map-pan-inner
                style={{ transform: `translate(${pan.offset.x}px, ${pan.offset.y}px)` }}
              >
                <StationMap
                  station={station}
                  state={state}
                  selection={selection}
                  onSelect={setSelection}
                  zoom={zoom}
                />
              </div>
            </div>
          </Pane>
          <Pane title={term("report.tab")} menu={<span>{selectionLabel}</span>}>
            {panel}
          </Pane>
        </div>
      ) : (
        <>
          {sidebarPane}
          <Pane title="Map" surface="void">
            <div className="p-(--ow-space-4)">
              <StationMap
                station={station}
                state={state}
                selection={selection}
                onSelect={setSelection}
                stacked
              />
            </div>
          </Pane>
          {selection ? (
            <div className="ow-sheet fixed inset-x-0 bottom-0 z-10 max-h-(--ow-size-sheet-max-h) overflow-y-auto">
              <Pane title={term("report.tab")}>{panel}</Pane>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
