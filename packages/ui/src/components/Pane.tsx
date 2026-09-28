import type { ReactNode } from "react";

export interface PaneProps {
  /** Menu bar title; also the region's accessible name. */
  readonly title: string;
  /** Optional items on the right of the menu bar. */
  readonly menu?: ReactNode;
  readonly children: ReactNode;
  /** "void" is the map column: black in both themes, dark palette inside. */
  readonly surface?: "default" | "void";
  readonly className?: string;
}

/** A bordered column with a simple menu bar on top. The dashboard is three of these. */
export function Pane({ title, menu, children, surface = "default", className }: PaneProps) {
  const isVoid = surface === "void";
  return (
    <section
      aria-label={title}
      className={[
        "ow-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-border-subtle",
        isVoid ? "ow-void bg-surface-void" : "bg-surface-panel",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-pane={surface}
    >
      <header className="flex h-(--ow-size-control-h) shrink-0 items-center justify-between gap-(--ow-space-3) border-b border-border-subtle bg-surface-raised px-(--ow-space-3)">
        <span className="font-mono text-eyebrow uppercase text-ink-2">{title}</span>
        {menu ? (
          <div className="flex items-center gap-(--ow-space-2) font-mono text-mono text-ink-3">
            {menu}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}
