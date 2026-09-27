import type { CSSProperties } from "react";
import type { RunState } from "../tokens/tokens.js";
import { symbolId } from "./sprite.js";

export type RigHead = "dome" | "wedge" | "crest";
export type RigTrace = "core" | "bar" | "chevron" | "split" | "frame" | "twin";
export type RigShoulder = "ball" | "pauldron";
export type RigAccessory = "antenna" | "thruster" | "plate" | "none" | "crest";

/** The persona-chosen part of the rig (core's `agent.persona.rig`). */
export interface RigChoice {
  readonly tintHue: number;
  readonly trimHue: number;
  readonly head: RigHead;
  readonly trace: RigTrace;
}

/** The config-derived part (core's `deriveRig`). */
export interface RigDerived {
  readonly shoulder: RigShoulder;
  readonly accessory: RigAccessory;
}

export const RIG_UNITS = { w: 24, h: 32 } as const;

export interface CharacterProps {
  /** Agent display name, used with the state for the accessible name. */
  readonly name: string;
  readonly rig: RigChoice;
  readonly derived: RigDerived;
  readonly state: RunState;
  /** Integer scale: 1 on cards, 2 in the panel, 4 in an editor. */
  readonly scale: 1 | 2 | 4;
  /** Per-figure blink offset so a team never blinks in unison. */
  readonly blinkDelayMs?: number;
  readonly className?: string;
}

const GLYPH: Partial<Record<RunState, "check" | "exclaim">> = { done: "check", failed: "exclaim" };

/**
 * One agent figure: five `<use>`s over the shared RigSprite, recolored through the two persona
 * hues, with everything else owned by tokens and run state. Motion lives in character.css.
 */
export function Character({
  name,
  rig,
  derived,
  state,
  scale,
  blinkDelayMs,
  className,
}: CharacterProps) {
  if (!Number.isInteger(scale)) throw new Error(`Character scale must be an integer, got ${scale}`);
  const glyph = GLYPH[state];
  const style = {
    "--ow-rig-tint-hue": rig.tintHue,
    "--ow-rig-trim-hue": rig.trimHue,
    "--ow-rig-glow": `var(--ow-rig-glow-${state})`,
    "--ow-rig-px": `${scale}px`,
    ...(blinkDelayMs !== undefined ? { "--ow-rig-blink-delay": `${blinkDelayMs}ms` } : {}),
  } as CSSProperties;

  return (
    <svg
      role="img"
      aria-label={`${name}, ${state}`}
      className={["ow-character", className].filter(Boolean).join(" ")}
      data-state={state}
      viewBox={`0 0 ${RIG_UNITS.w} ${RIG_UNITS.h}`}
      width={RIG_UNITS.w * scale}
      height={RIG_UNITS.h * scale}
      style={style}
    >
      <g data-part="figure">
        <g data-part="body">
          <use href={`#${symbolId(state === "working" ? "body-active" : "body-idle")}`} />
        </g>
        <g data-part="head">
          <use href={`#${symbolId(`head-${rig.head}`)}`} />
        </g>
        <use href={`#${symbolId(`shoulder-${derived.shoulder}`)}`} />
        <use href={`#${symbolId(`trace-${rig.trace}`)}`} />
        {glyph ? (
          <g data-part="glyph">
            <use href={`#${symbolId(`glyph-${glyph}`)}`} />
          </g>
        ) : derived.accessory !== "none" ? (
          <use href={`#${symbolId(`accessory-${derived.accessory}`)}`} />
        ) : null}
      </g>
    </svg>
  );
}
