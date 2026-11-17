import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Caret } from "./Caret.js";

export interface FolderTabProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type"> {
  /** The words on the tab, set top to bottom (display face, in capitals). */
  readonly children: ReactNode;
  /** The id of the region the tab shows; it is folded away while the tab is visible. */
  readonly controls: string;
}

/**
 * The handle of a folded column (ADR-0018): a narrow tab laid over the container's left edge, cut at its
 * free corners like a file folder's tab, its words running down it. Pressing it unfolds the
 * column, so it reports `aria-expanded="false"`. The focus ring is drawn inside, since the cut
 * corners clip anything outside the tab.
 */
export function FolderTab({ children, controls, className = "", ...rest }: FolderTabProps) {
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-controls={controls}
      data-folder-tab
      className={`st-folder-tab flex cursor-pointer content-center items-center justify-center gap-2.5 border-0 bg-panel-head px-1.5 py-3 font-display text-d8 text-panel-title uppercase tracking-st-1 hover:bg-btn-hover hover:text-fg-hi focus-visible:outline-2 focus-visible:outline-cyan focus-visible:-outline-offset-4 ${className}`}
      {...rest}
    >
      <Caret direction="right" size="lg" className="text-cyan" />
      {children}
    </button>
  );
}
