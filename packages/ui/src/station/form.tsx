import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Form parts in the station's look (ADR-0014). One height for fields and buttons, so a row of
 * them lines up on its bottom edge.
 */

/** A labelled field: the label above, in the display face. Put the control inside. */
export const fieldClass = "flex min-w-0 flex-col gap-1 font-display text-d7 text-fg-mute uppercase";

/** A text input or select: well background, soft line, body face, the shared height. */
export const inputClass =
  "h-9 min-w-0 border-2 border-line-soft bg-well px-2 font-body text-b19 text-fg-hi normal-case focus-visible:border-cyan";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  readonly label: ReactNode;
  /** A short line under the label. */
  readonly hint?: ReactNode;
  readonly className?: string;
}

/**
 * A checkbox drawn as a pixel box with an ink check on cyan. The native input stays in the
 * page (visually hidden, still focusable and announced); the box is its picture.
 */
export function Checkbox({ label, hint, className = "", ...input }: CheckboxProps) {
  return (
    <label
      className={`inline-flex cursor-pointer items-start gap-2 text-b17 text-fg has-disabled:cursor-not-allowed has-disabled:opacity-60 ${className}`}
    >
      <input type="checkbox" className="st-check" {...input} />
      <span aria-hidden="true" className="st-check-box" />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint ? <span className="text-b15 text-fg-mute">{hint}</span> : null}
      </span>
    </label>
  );
}
