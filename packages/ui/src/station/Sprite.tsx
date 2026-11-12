import {
  ART_BOX,
  CHARACTERS,
  characterGrid,
  gridRuns,
  isArtCharacter,
  type PixelRun,
  SPRITE_H,
  SPRITE_W,
} from "@darthsaul/outerworld-ai-core";

export interface SpriteProps {
  /** Index into core's CHARACTERS. */
  readonly look: number;
  /**
   * Scale: 1 (20×26), 2, 3, 4 (80×104), 8 (160×208). 1.5 (30×39, the Overseer's comms portrait) is
   * whole device pixels on a 2× display; on a 1× display its pixels are slightly uneven.
   */
  readonly scale?: 1 | 1.5 | 2 | 3 | 4 | 8;
  /** Accessible name; without one the sprite is decorative. */
  readonly label?: string;
  readonly className?: string;
}

const cache = new Map<number, PixelRun[]>();

function runsFor(look: number): PixelRun[] {
  let runs = cache.get(look);
  if (!runs) {
    const character = CHARACTERS[look] ?? CHARACTERS[0];
    runs = character && !isArtCharacter(character) ? gridRuns(characterGrid(character)) : [];
    cache.set(look, runs);
  }
  return runs;
}

/**
 * One pixel character: a drawn one as SVG rects (ADR-0013), a painted one as its art (ADR-0017).
 * Drawn characters are SVG rects: crisp at integer scales, no canvas, and the
 * same grid the design exported. Colors are the character's own, from core.
 */
export function Sprite({ look, scale = 1, label, className = "" }: SpriteProps) {
  const character = CHARACTERS[look];
  if (character && isArtCharacter(character)) {
    // A painted character (ADR-0017): its art in a 32×32 box per scale step, still pixelated.
    return (
      <img
        src={character.art.src}
        width={ART_BOX * scale}
        height={ART_BOX * scale}
        alt={label ?? ""}
        {...(label ? {} : { "aria-hidden": true })}
        draggable={false}
        className={`st-pixelated shrink-0 ${className}`}
      />
    );
  }
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
