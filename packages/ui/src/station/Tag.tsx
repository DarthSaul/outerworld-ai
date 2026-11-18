import type { HTMLAttributes, ReactNode } from "react";

/** The tag's border and text color. */
const TONES = {
  white: "border-white text-white",
  amber: "border-amber text-amber",
  cyan: "border-cyan text-cyan",
  green: "border-green text-green",
  mute: "border-line text-fg-mute",
} as const;

export type TagTone = keyof typeof TONES;

/** Type size with padding to match: `sm` for word tags, `md` for a value that must read easily. */
const SIZES = {
  sm: "px-1.5 py-0.75 text-d6",
  md: "px-2 py-1 text-d7",
} as const;

export type TagSize = keyof typeof SIZES;

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: TagTone;
  /** `sm` (the default) or `md`: one type step larger, with more padding. */
  readonly size?: TagSize;
  /**
   * Uppercase, like every word tag (OVERSEER, FULL POWER). Off for a value shown as it is
   * written, such as a model id (`anthropic/claude-sonnet-5.5`).
   */
  readonly caps?: boolean;
  readonly children: ReactNode;
}

/**
 * A small outlined label in the pixel face: a role, a mode, a class, a state, or a value. Padded on
 * every side so the small type has room to read. Extra attributes (`data-*`, `title`) pass through.
 */
export function Tag({
  tone = "mute",
  size = "sm",
  caps = true,
  className = "",
  children,
  ...rest
}: TagProps) {
  return (
    <span
      {...rest}
      className={`inline-flex shrink-0 items-center border font-display leading-none ${SIZES[size]} ${caps ? "uppercase" : ""} ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
