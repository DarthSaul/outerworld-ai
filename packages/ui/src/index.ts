/**
 * @darthsaul/outerworld-ai-ui
 *
 * The station dashboard's React components and design tokens (ADR-0013). Knows core, never the
 * runtime. Import "@darthsaul/outerworld-ai-ui/styles.css" once in the app after tailwindcss.
 */
export { EmptyState, type EmptyStateProps } from "./components/EmptyState.js";
// Station dashboard primitives (ADR-0013)
export { Avatar, type AvatarProps, overseerAvatarProps } from "./station/Avatar.js";
export {
  ChoiceButton,
  type ChoiceButtonProps,
  Diamond,
  OutlineButton,
  type OutlineButtonProps,
  tabClass,
} from "./station/buttons.js";
export { CrewRoster, type CrewRosterProps } from "./station/CrewRoster.js";
export {
  CrewSelect,
  type CrewSelectAgent,
  type CrewSelectProps,
} from "./station/CrewSelect.js";
export {
  DashboardMap,
  type DashboardMapProps,
  type DashboardSelection,
  grantName,
  MAP_STYLES,
  type MapStyle,
  roomColor,
} from "./station/DashboardMap.js";
export {
  type CommsMessage,
  OverseerComms,
  type OverseerCommsProps,
  useTypewriter,
} from "./station/OverseerComms.js";
export { Panel, PanelLabel, type PanelProps } from "./station/Panel.js";
export { Scanner, type ScannerProps } from "./station/Scanner.js";
export { SegmentBar, type SegmentBarProps } from "./station/SegmentBar.js";
export { Sprite, type SpriteProps } from "./station/Sprite.js";
export { StatBox, type StatBoxProps } from "./station/StatBox.js";
export {
  CrtToggle,
  formatTokens,
  formatUptime,
  RadioChatter,
  type RadioEntry,
  StationHeader,
  type StationHeaderProps,
  StationVitals,
  type StationVitalsProps,
  StopButton,
  useUptime,
} from "./station/StationChrome.js";
export {
  CREW_STATUS_TONE,
  lampBlink,
  RUN_STATUS_TONE,
  type Tone,
  toneVar,
} from "./station/tone.js";
export { useAnimationClock, useReducedMotion } from "./station/useClock.js";
export {
  PACKET_SPEED,
  ROOM_COLOR_COUNT,
  roomColorVar,
  STATION_MS,
  stVar,
  type TokenName,
} from "./tokens/tokens.js";
