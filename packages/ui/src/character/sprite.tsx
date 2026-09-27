import { RIG_PARTS, type RigPartName, type RigRole } from "./rig-parts.js";

/** Every symbol the rig, emblem, and overseer can reference. */
export const RIG_SYMBOLS = Object.keys(RIG_PARTS) as readonly RigPartName[];

const ROLE_VAR: Record<RigRole, string> = {
  primary: "var(--ow-rig-primary)",
  secondary: "var(--ow-rig-secondary)",
  frame: "var(--ow-rig-frame)",
  highlight: "var(--ow-rig-highlight)",
  glow: "var(--ow-rig-glow)",
  visor: "var(--ow-rig-visor)",
  base: "var(--ow-emblem-base)",
  shade: "var(--ow-emblem-shade)",
  mark: "var(--ow-emblem-mark)",
};

/** DOM id of a part's symbol, referenced by `<use href="#…">`. */
export function symbolId(name: RigPartName): string {
  return `ow-${name}`;
}

/**
 * One hidden sprite of every rig part. Render it once near the root of the app; every
 * Character, OverseerCharacter, and TeamEmblem references it by id. The fills are CSS
 * variables, so the same symbol recolors per figure and per theme.
 */
export function RigSprite() {
  return (
    <svg aria-hidden="true" style={{ display: "none" }} xmlns="http://www.w3.org/2000/svg">
      {RIG_SYMBOLS.map((name) => {
        const part = RIG_PARTS[name];
        return (
          <symbol
            id={symbolId(name)}
            key={name}
            viewBox={`0 0 ${part.viewBox[0]} ${part.viewBox[1]}`}
            shapeRendering="crispEdges"
          >
            {part.rects.map(([x, y, w, h, role]) => (
              <rect
                key={`${x},${y},${w},${h},${role}`}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={ROLE_VAR[role]}
              />
            ))}
          </symbol>
        );
      })}
    </svg>
  );
}
