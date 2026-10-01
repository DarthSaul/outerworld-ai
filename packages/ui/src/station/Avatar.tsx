import { initials } from "@darthsaul/outerworld-ai-core";
import type { CSSProperties } from "react";
import { stVar } from "../tokens/tokens.js";

export interface AvatarProps {
  readonly name: string;
  /** Chip color: a var() reference (the room color, or white for the Overseer). */
  readonly color: string;
  /** 22, 30, 38 or 52px. */
  readonly size?: 22 | 30 | 38 | 52;
  /** Double ring in `color` (selected, or the Overseer's cyan ring). */
  readonly ring?: string;
  /** What shows through the ring's gap; defaults to the room surface. */
  readonly ringGap?: string;
  /** A 6px status lamp at the top-right corner. */
  readonly lamp?: { readonly color: string; readonly className?: string };
  readonly className?: string;
}

const SIZE = {
  22: "size-5.5 text-d7",
  30: "size-7.5 text-d8",
  38: "size-9.5 text-d9",
  52: "size-13 text-d12",
} as const;

/** A square chip with two-letter initials. Decorative: the name is always written beside it. */
export function Avatar({
  name,
  color,
  size = 22,
  ring,
  ringGap,
  lamp,
  className = "",
}: AvatarProps) {
  const style = {
    background: color,
    ...(ring ? { "--st-ring-color": ring } : {}),
    ...(ringGap ? { "--st-ring-gap": ringGap } : {}),
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center font-display text-ink ${SIZE[size]} ${ring ? "st-ring" : ""} ${className}`}
      style={style}
    >
      {initials(name)}
      {lamp ? (
        <span
          className={`-right-0.75 -top-0.75 absolute size-1.5 ${lamp.className ?? ""}`}
          style={{ background: lamp.color }}
        />
      ) : null}
    </span>
  );
}

/** The Overseer's chip: white, with the cyan double ring. */
export function overseerAvatarProps(): Pick<AvatarProps, "color" | "ring" | "ringGap"> {
  return { color: stVar("white"), ring: stVar("cyan"), ringGap: stVar("room") };
}
