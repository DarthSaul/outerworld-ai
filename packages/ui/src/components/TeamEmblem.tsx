import type { EmblemMark as EmblemMarkSchema } from "@darthsaul/outerworld-ai-core";
import type { CSSProperties } from "react";
import { symbolId } from "../character/sprite.js";

/** Emblem marks, from core's schema. */
export type EmblemMark = (typeof EmblemMarkSchema.options)[number];

export const EMBLEM_UNITS = 16;

export interface TeamEmblemProps {
  /** Team name, for the accessible name. */
  readonly name: string;
  /** The team's identity hue; base, shade, and glow derive from it in tokens.css. */
  readonly hue: number;
  /** The mission mark on the horizon. */
  readonly mark: EmblemMark;
  /** 1 in lists and chips, 2 on the map, 4 in the panel header. */
  readonly scale: 1 | 2 | 4;
  readonly className?: string;
}

/**
 * The team's emblem: a 16×16 quantized disc, the only full circle in the system, with the
 * mission mark on its horizon. Identity is a hue, not a palette (design spec §07b).
 */
export function TeamEmblem({ name, hue, mark, scale, className }: TeamEmblemProps) {
  if (scale !== 1 && scale !== 2 && scale !== 4)
    throw new Error(`TeamEmblem scale must be 1, 2, or 4, got ${scale}`);
  const style = { "--ow-emblem-hue": hue } as CSSProperties;
  return (
    <svg
      role="img"
      aria-label={name}
      className={["ow-emblem", className].filter(Boolean).join(" ")}
      viewBox={`0 0 ${EMBLEM_UNITS} ${EMBLEM_UNITS}`}
      width={EMBLEM_UNITS * scale}
      height={EMBLEM_UNITS * scale}
      shapeRendering="crispEdges"
      style={style}
    >
      <use href={`#${symbolId("emblem-disc")}`} />
      {mark !== "none" ? <use href={`#${symbolId(`mark-${mark}`)}`} /> : null}
    </svg>
  );
}
