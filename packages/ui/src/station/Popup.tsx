import { term } from "@darthsaul/outerworld-ai-core";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface PopupProps {
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Buttons or links beside Close, at the foot of the popup. */
  readonly actions?: ReactNode;
  /** A line under the title (when, who). */
  readonly meta?: ReactNode;
}

/**
 * A small modal popup over a scrim (render it only while open). Focus moves to Close, Tab stays
 * inside, Escape or the scrim closes it, and focus returns to what opened it. The body scrolls
 * when its content is taller than the popup.
 */
export function Popup({ title, onClose, children, actions, meta }: PopupProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => opener?.focus();
  }, []);

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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 cursor-pointer border-0 bg-scrim p-0"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="relative flex max-h-[75dvh] w-full max-w-xl flex-col border-2 border-line bg-panel shadow-panel"
      >
        <div className="flex flex-col gap-1 border-line border-b-2 bg-panel-head px-3 py-2">
          <h2
            id={titleId}
            className="m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
          >
            {title}
          </h2>
          {meta ? <div className="text-b15 text-fg-mute">{meta}</div> : null}
        </div>
        <div data-popup-body className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3">
          {children}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-line-faint border-t-2 px-3 py-2">
          {actions}
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="cursor-pointer border-2 border-line-soft bg-well px-2.5 py-1.5 font-display text-d7 text-fg-mute uppercase hover:text-fg-hi"
          >
            {term("popup.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
