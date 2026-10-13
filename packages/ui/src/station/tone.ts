import type { CrewDisplayStatus, RunDisplayStatus } from "@darthsaul/outerworld-ai-core";
import { stVar } from "../tokens/tokens.js";

/** The design's accent tones, each a --st-* color token. */
export type Tone = "cyan" | "violet" | "amber" | "green" | "red" | "white" | "mute" | "done";

const TONE_TOKEN: Readonly<Record<Tone, string>> = {
  cyan: "cyan",
  violet: "violet",
  amber: "amber",
  green: "green",
  red: "red",
  white: "white",
  mute: "text-mute",
  done: "done",
};

export function toneVar(tone: Tone): string {
  return stVar(TONE_TOKEN[tone]);
}

/** Crew status colors (design: ACTIVE green, IDLE mute, BLOCKED red, HALTED amber). */
export const CREW_STATUS_TONE: Readonly<Record<CrewDisplayStatus, Tone>> = {
  active: "green",
  idle: "mute",
  blocked: "red",
  halted: "amber",
  failed: "red",
};

/** Mission status colors (design: RUNNING green, QUEUED cyan, BLOCKED red, HALTED amber, DONE). */
export const RUN_STATUS_TONE: Readonly<Record<RunDisplayStatus, Tone>> = {
  running: "green",
  queued: "cyan",
  blocked: "red",
  halted: "amber",
  failed: "red",
  done: "done",
};

/** The lamp blink for a crew status: active and blocked lamps blink, the rest hold steady. */
export function lampBlink(status: CrewDisplayStatus): string {
  if (status === "active") return "st-blink st-blink-active";
  if (status === "blocked") return "st-blink st-blink-blocked";
  return "";
}
