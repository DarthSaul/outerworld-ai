import type { CSSProperties, ReactNode } from "react";
import { stVar } from "../tokens/tokens.js";
import { type Tone, toneVar } from "./tone.js";

export interface StatBoxProps {
  readonly label: ReactNode;
  readonly value?: ReactNode;
  /** Color of the value. */
  readonly tone?: Tone | "hi";
  /** Blink the border red (ALERTS while above zero). */
  readonly alert?: boolean;
  readonly children?: ReactNode;
  /** `compact`: a tighter well with smaller words, for the footer. */
  readonly size?: "regular" | "compact";
  readonly className?: string;
}

/** A labelled value in a well: TASKS LIVE, ALERTS, TOKENS, UPTIME. */
export function StatBox({
  label,
  value,
  tone = "hi",
  alert,
  children,
  size = "regular",
  className = "",
}: StatBoxProps) {
  const compact = size === "compact";
  const style = {
    "--st-blink-a": stVar("line-soft"),
    "--st-blink-b": stVar("red"),
    color: tone === "hi" ? stVar("text-hi") : toneVar(tone),
  } as CSSProperties;
  return (
    <div
      className={`flex flex-col border-2 border-line-soft bg-well ${compact ? "justify-center gap-0.5 px-2 py-1" : "gap-1 px-2.5 py-1.5"} ${alert ? "st-blink-border" : ""} ${className}`}
      style={style}
    >
      <span className={`font-display text-fg-mute uppercase ${compact ? "text-d6" : "text-d7"}`}>
        {label}
      </span>
      {value === undefined ? null : (
        <span className={compact ? "text-b18 leading-none" : "text-b22"}>{value}</span>
      )}
      {children}
    </div>
  );
}
