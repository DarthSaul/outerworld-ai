import { type ReactNode, useId } from "react";

export interface PanelProps {
  /** The title strip's words (display face, set in capitals). */
  readonly title: ReactNode;
  /** Right side of the strip: mute meta text, or controls. */
  readonly meta?: ReactNode;
  readonly children?: ReactNode;
  /** Extra classes on the section, e.g. `flex-1` to fill a column. */
  readonly className?: string;
  /** Tighter strip padding, for a strip that holds buttons (the station map). */
  readonly dense?: boolean;
}

/**
 * The design's panel: a 2px line border, a hard 4px shadow, and a title strip. A labelled region,
 * so screen readers can jump between panels.
 */
export function Panel({ title, meta, children, className = "", dense = false }: PanelProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col border-2 border-line bg-panel shadow-panel ${className}`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-line border-b-2 bg-panel-head px-2.5 font-display text-d9 text-panel-title uppercase tracking-st-1 ${dense ? "py-1.5" : "py-2"}`}
      >
        <h2 id={id} className="m-0 font-normal text-inherit">
          {title}
        </h2>
        {meta === undefined ? null : typeof meta === "string" ? (
          <span className="text-d7 text-fg-mute">{meta}</span>
        ) : (
          meta
        )}
      </div>
      {children}
    </section>
  );
}

/** A small section label inside a panel body (`CREW`, `TASK LOG`, …). */
export function PanelLabel({ children }: { readonly children: ReactNode }) {
  return (
    <h3 className="m-0 font-display font-normal text-d7 text-fg-mute uppercase">{children}</h3>
  );
}
