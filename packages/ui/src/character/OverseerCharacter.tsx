import type { OverseerState } from "@darthsaul/outerworld-ai-core";
import type { CSSProperties } from "react";
import { symbolId } from "./sprite.js";

export type { OverseerState };

export const HERO_UNITS = { w: 48, h: 64 } as const;

/** Overseer states borrow the run glow: reconciling is working, reported is done, attention is failed. */
const GLOW: Record<OverseerState, "idle" | "working" | "done" | "failed"> = {
  idle: "idle",
  reconciling: "working",
  reported: "done",
  attention: "failed",
};

export interface OverseerCharacterProps {
  readonly name: string;
  readonly state: OverseerState;
  /** 2 in the map core, 4 in its report panel. Never 1. */
  readonly scale: 2 | 4;
  readonly className?: string;
}

/**
 * The overseer's own 48×64 hero rig (design spec §07). Achromatic: the rig color roles are bound
 * to the overseer tokens, so no hue can tint it. Same state contract as Character.
 */
export function OverseerCharacter({ name, state, scale, className }: OverseerCharacterProps) {
  if (scale !== 2 && scale !== 4)
    throw new Error(`OverseerCharacter scale must be 2 or 4, got ${scale}`);
  const style = {
    "--ow-rig-primary": "var(--ow-overseer-primary)",
    "--ow-rig-secondary": "var(--ow-overseer-secondary)",
    "--ow-rig-frame": "var(--ow-overseer-frame)",
    "--ow-rig-glow": `var(--ow-rig-glow-${GLOW[state]})`,
    "--ow-rig-px": `${scale}px`,
  } as CSSProperties;
  return (
    <svg
      role="img"
      aria-label={`${name}, ${state}`}
      className={["ow-character", "ow-character--overseer", className].filter(Boolean).join(" ")}
      data-state={state}
      data-glow={GLOW[state]}
      viewBox={`0 0 ${HERO_UNITS.w} ${HERO_UNITS.h}`}
      width={HERO_UNITS.w * scale}
      height={HERO_UNITS.h * scale}
      style={style}
    >
      <g data-part="figure">
        <use href={`#${symbolId("hero")}`} />
      </g>
    </svg>
  );
}
