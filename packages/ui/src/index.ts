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
export { AgentCard, type AgentCardProps } from "./components/AgentCard.js";
export { DetailPanel, type DetailPanelProps } from "./components/DetailPanel.js";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState.js";
export { clockLabel, dateLabel, durationLabel } from "./components/format.js";
export { GrantChip, type GrantChipProps } from "./components/GrantChip.js";
export {
  HandoffLayer,
  type HandoffLayerItem,
  type HandoffLayerProps,
  type HandoffPathGeometry,
  type HandoffVisualState,
  Packet,
} from "./components/HandoffLayer.js";
export { OverseerCore, type OverseerCoreProps } from "./components/OverseerCore.js";
export { Pane, type PaneProps } from "./components/Pane.js";
export { StationMap, type StationMapProps, timeLabel } from "./components/StationMap.js";
export { StationView, type StationViewProps } from "./components/StationView.js";
export { isSelected, type Selection, type SelectionKind } from "./components/selection.js";
export {
  EMBLEM_UNITS,
  type EmblemMark,
  TeamEmblem,
  type TeamEmblemProps,
} from "./components/TeamEmblem.js";
export {
  TeamPanel,
  type TeamPanelAgent,
  type TeamPanelGrant,
  type TeamPanelProps,
} from "./components/TeamPanel.js";
export { Toast, type ToastProps, ToastRegion } from "./components/Toast.js";
export { useDesktop } from "./components/useDesktop.js";
export { DRAG_THRESHOLD_PX, type PanState, usePan } from "./components/usePan.js";
export { RunDigestButton, type RunDigestButtonProps } from "./timeline/RunDigestButton.js";
export { runDigestTimeline, type TimelineStep } from "./timeline/runDigestTimeline.js";
export { type Timeline, type UseTimelineOptions, useTimeline } from "./timeline/useTimeline.js";
export {
  GRANT_MODES,
  type GrantMode,
  glowToken,
  HEALTH_STATES,
  type HealthState,
  MOTION_MS,
  RUN_STATES,
  type RunState,
  THEMED_TOKENS,
  tokenVar,
} from "./tokens/tokens.js";
