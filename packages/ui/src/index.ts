/**
 * @darthsaul/outerworld-ai-ui
 *
 * React components and design tokens. Knows nothing about Routines or GitHub.
 * Import "@darthsaul/outerworld-ai-ui/styles.css" once in the app after tailwindcss, and render
 * <RigSprite /> once near the root so every figure can reference its parts.
 */

export {
  Character,
  type CharacterProps,
  RIG_UNITS,
  type RigAccessory,
  type RigChoice,
  type RigDerived,
  type RigHead,
  type RigShoulder,
  type RigTrace,
} from "./character/Character.js";
export {
  HERO_UNITS,
  OverseerCharacter,
  type OverseerCharacterProps,
  type OverseerState,
} from "./character/OverseerCharacter.js";
export { RIG_PARTS, type RigPartName } from "./character/rig-parts.js";
export { RIG_SYMBOLS, RigSprite, symbolId } from "./character/sprite.js";
export { Badge, type BadgeProps } from "./components/Badge.js";
export {
  EMBLEM_UNITS,
  type EmblemMark,
  TeamEmblem,
  type TeamEmblemProps,
} from "./components/TeamEmblem.js";
export {
  GRANT_MODES,
  type GrantMode,
  glowToken,
  HEALTH_STATES,
  type HealthState,
  RUN_STATES,
  type RunState,
  THEMED_TOKENS,
  tokenVar,
} from "./tokens/tokens.js";
