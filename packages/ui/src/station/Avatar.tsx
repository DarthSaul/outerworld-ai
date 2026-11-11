import { initials } from "@darthsaul/outerworld-ai-core";
import type { CSSProperties } from "react";
import { stVar } from "../tokens/tokens.js";
import { Sprite } from "./Sprite.js";

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
  /**
   * The crew member's pixel character (core's look index). With it, the chip draws the character
   * at 1× in a frame of `color` instead of initials; use 30 or larger so the 26px sprite fits.
   */
  readonly look?: number;
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

/**
 * A square chip with two-letter initials, or the crew member's character when `look` is given.
 * Decorative: the name is always written beside it.
 */
export function Avatar({
  name,
  color,
  look,
  size = 22,
  ring,
  ringGap,
  lamp,
  className = "",
}: AvatarProps) {
  const style = {
    ...(look === undefined ? { background: color } : { borderColor: color }),
    ...(ring ? { "--st-ring-color": ring } : {}),
    ...(ringGap ? { "--st-ring-gap": ringGap } : {}),
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      data-look={look}
      className={`relative inline-flex shrink-0 justify-center font-display text-ink ${look === undefined ? "items-center" : "items-end border bg-well"} ${SIZE[size]} ${ring ? "st-ring" : ""} ${className}`}
      style={style}
    >
      {look === undefined ? initials(name) : <Sprite look={look} />}
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
