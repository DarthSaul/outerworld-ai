import type { ReactNode } from "react";

/** A polite live region for toasts. Render once; put Toasts inside. */
export function ToastRegion({ children }: { readonly children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex flex-col items-center gap-(--ow-space-2) p-(--ow-space-4)"
    >
      {children}
    </div>
  );
}

export interface ToastProps {
  readonly id: string;
  readonly message: string;
  readonly onDismiss: (id: string) => void;
}

/** Plain words only; toasts are never themed (design spec §09). */
export function Toast({ id, message, onDismiss }: ToastProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-(--ow-space-3) rounded-control border border-border-strong bg-surface-raised px-(--ow-space-3) py-(--ow-space-2) text-label text-ink-1">
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(id)}
        className="font-mono text-mono text-ink-3"
      >
        ×
      </button>
    </div>
  );
}
