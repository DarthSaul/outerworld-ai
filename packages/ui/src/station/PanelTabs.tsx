import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { tabClass } from "./buttons.js";

export interface PanelTab {
  readonly id: string;
  /** The tab's words (display face, set in capitals). */
  readonly label: string;
  readonly content: ReactNode;
}

export interface PanelTabsProps {
  /** What the tabs switch between, for the tab list's name. */
  readonly label: string;
  readonly tabs: readonly PanelTab[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  /** Right side of the strip, as on a `Panel`. */
  readonly meta?: ReactNode;
  readonly className?: string;
}

/**
 * A `Panel` whose title strip is a row of tabs (ADR-0014): the active tab is filled, the others
 * outlined. The region is named by the active tab. ← → Home End move between tabs and show them;
 * every tab's content stays mounted, hidden when not shown, so switching back keeps its place.
 */
export function PanelTabs({ label, tabs, active, onChange, meta, className = "" }: PanelTabsProps) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabId = (tab: string) => `${id}-tab-${tab}`;
  const panelId = (tab: string) => `${id}-panel-${tab}`;
  const shown = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : undefined;
    const tab = next === undefined ? undefined : tabs[next];
    if (!tab || next === undefined) return;
    e.preventDefault();
    onChange(tab.id);
    refs.current[next]?.focus();
  };

  return (
    <section
      aria-labelledby={shown ? tabId(shown) : undefined}
      className={`flex min-w-0 flex-col border-2 border-line bg-panel shadow-panel ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-line border-b-2 bg-panel-head px-2.5 py-1.5">
        <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
          {tabs.map((tab, i) => {
            const selected = tab.id === shown;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={tabId(tab.id)}
                aria-selected={selected}
                aria-controls={panelId(tab.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={tabClass(selected, "map")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {meta}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== shown}
          className="min-h-0 flex-1 flex-col overflow-hidden [&:not([hidden])]:flex"
        >
          {tab.content}
        </div>
      ))}
    </section>
  );
}
