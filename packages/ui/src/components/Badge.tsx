import type { ReactNode } from "react";
import type { GrantMode } from "../tokens/tokens.js";

export interface BadgeProps {
  /** Which grant hue the badge carries. Color never carries mode alone: the R/W glyph leads. */
  readonly mode: GrantMode;
  readonly children: ReactNode;
}

const MODE_GLYPH: Record<GrantMode, string> = { read: "R", write: "W" };

/**
 * A grant chip. Scaffold-stage component that proves the token pipeline: every color, radius,
 * and size comes from a token utility or a `var(--ow-*)`.
 */
export function Badge({ mode, children }: BadgeProps) {
  return (
    <span
      data-mode={mode}
      className={`inline-flex items-center gap-(--ow-size-chip-gap) rounded-chip border font-mono text-mono text-ink-1 ${
        mode === "read"
          ? "border-chip-border-read bg-chip-read"
          : "border-chip-border-write bg-chip-write"
      }`}
      style={{
        height: "var(--ow-size-chip-h)",
        paddingInline: "var(--ow-size-chip-pad-x)",
      }}
    >
      <span aria-hidden="true">{MODE_GLYPH[mode]}</span>
      <span className="sr-only">{mode}</span>
      {children}
    </span>
  );
}
