import {
  CHARACTERS,
  characterGrid,
  gridRuns,
  type PixelRun,
  SPRITE_H,
  SPRITE_W,
} from "@darthsaul/outerworld-ai-core";

export interface SpriteProps {
  /** Index into core's CHARACTERS. */
  readonly look: number;
  /** Integer scale: 1 (20×26), 3 (the comms portrait), 4 (80×104), 8 (160×208). */
  readonly scale?: 1 | 2 | 3 | 4 | 8;
  /** Accessible name; without one the sprite is decorative. */
  readonly label?: string;
  readonly className?: string;
}

const cache = new Map<number, PixelRun[]>();

function runsFor(look: number): PixelRun[] {
  let runs = cache.get(look);
  if (!runs) {
    const character = CHARACTERS[look] ?? CHARACTERS[0];
    runs = character ? gridRuns(characterGrid(character)) : [];
    cache.set(look, runs);
  }
  return runs;
}

/**
 * One pixel character drawn as SVG rects (ADR-0013): crisp at integer scales, no canvas, and the
 * same grid the design exported. Colors are the character's own, from core.
 */
export function Sprite({ look, scale = 1, label, className = "" }: SpriteProps) {
  return (
    <svg
      viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
      width={SPRITE_W * scale}
      height={SPRITE_H * scale}
      shapeRendering="crispEdges"
      className={`st-pixelated shrink-0 ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <title>{label ?? ""}</title>
      {runsFor(look).map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </svg>
  );
}
