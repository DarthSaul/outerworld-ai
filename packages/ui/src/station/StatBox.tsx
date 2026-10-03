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
  readonly className?: string;
}

/** A labelled value in a well: TASKS LIVE, ALERTS, TOKENS, UPTIME. */
export function StatBox({
  label,
  value,
  tone = "hi",
  alert,
  children,
  className = "",
}: StatBoxProps) {
  const style = {
    "--st-blink-a": stVar("line-soft"),
    "--st-blink-b": stVar("red"),
    color: tone === "hi" ? stVar("text-hi") : toneVar(tone),
  } as CSSProperties;
  return (
    <div
      className={`flex flex-col gap-1 border-2 border-line-soft bg-well px-2.5 py-1.5 ${alert ? "st-blink-border" : ""} ${className}`}
      style={style}
    >
      <span className="font-display text-d7 text-fg-mute uppercase">{label}</span>
      {value === undefined ? null : <span className="text-b22">{value}</span>}
      {children}
    </div>
  );
}
