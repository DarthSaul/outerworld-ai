import { term, termWith } from "@darthsaul/outerworld-ai-core";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { StatBox } from "./StatBox.js";
import { RadioChatter, type RadioEntry } from "./StationChrome.js";

/** The toggle's icon: a pixel radio mast with its signal, drawn on a 9×9 grid. */
const MAST = [
  "X.......X",
  ".X.....X.",
  "X..XXX..X",
  "...XXX...",
  "....X....",
  "...X.X...",
  "...X.X...",
  "..X...X..",
  "..XXXXX..",
];
const MAST_CELLS = MAST.flatMap((row, y) =>
  [...row].flatMap((cell, x) => (cell === "X" ? [{ x, y }] : [])),
);

function MastIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 9 9"
      className="size-4.5"
      shapeRendering="crispEdges"
      fill="currentColor"
    >
      {MAST_CELLS.map(({ x, y }) => (
        <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" />
      ))}
    </svg>
  );
}

export interface StatusDrawerToggleProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The drawer's id, for aria-controls. */
  readonly controls: string;
  readonly live: number;
  readonly alerts: number;
}

/**
 * The header button that opens the status drawer. It keeps the two counts in sight: a green
 * dot while tasks are live, and the alert count in red.
 */
export function StatusDrawerToggle({
  open,
  onToggle,
  controls,
  live,
  alerts,
}: StatusDrawerToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={termWith("drawer.open", { live: String(live), alerts: String(alerts) })}
      title={term("drawer.title")}
      onClick={onToggle}
      className={`relative flex cursor-pointer items-center gap-1.5 border-2 px-2 font-display text-d7 uppercase ${open ? "border-cyan bg-active-bg text-cyan" : "border-line-soft bg-well text-fg-mute hover:text-fg-hi"}`}
    >
      <MastIcon />
      {live > 0 ? <span aria-hidden="true" className="size-2 bg-green" data-live-dot="" /> : null}
      {alerts > 0 ? (
        <span aria-hidden="true" className="bg-red px-1 text-on-red" data-alert-count="">
          {alerts > 99 ? "99+" : alerts}
        </span>
      ) : null}
    </button>
  );
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface StatusDrawerProps {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly live: number;
  readonly alerts: number;
  readonly radio: readonly RadioEntry[];
  /** Open where a radio line points (the drawer closes first). */
  readonly onOpenRadio?: (to: string) => void;
}

/**
 * The status drawer: TASKS LIVE, ALERTS, and the radio, in an overlay that slides in from the
 * right. A modal dialog while open: focus moves in, Tab stays inside, Escape or the scrim closes
 * it, and focus returns to what opened it.
 */
export function StatusDrawer({
  id,
  open,
  onClose,
  live,
  alerts,
  radio,
  onOpenRadio,
}: StatusDrawerProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => opener?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="st-drawer-layer" {...(open ? { "data-open": "" } : {})}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="st-drawer-scrim bg-scrim"
        onClick={onClose}
      />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(open ? {} : { inert: true, "aria-hidden": true })}
        onKeyDown={onKeyDown}
        className="st-drawer flex flex-col gap-3 border-line border-l-3 bg-bar p-3.5 shadow-panel"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id={titleId}
            className="m-0 font-display font-normal text-d10 text-title uppercase tracking-st-2"
          >
            {term("drawer.title")}
          </h2>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="cursor-pointer border-2 border-line-soft bg-well px-2 py-1 font-display text-d7 text-fg-mute uppercase hover:text-fg-hi"
          >
            {term("drawer.close")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatBox label={term("stat.live")} value={live} tone="green" />
          <StatBox label={term("stat.alerts")} value={alerts} tone="red" alert={alerts > 0} />
        </div>
        <RadioChatter
          entries={radio}
          fill
          {...(onOpenRadio
            ? {
                onOpen: (to: string) => {
                  onClose();
                  onOpenRadio(to);
                },
              }
            : {})}
        />
      </div>
    </div>
  );
}
