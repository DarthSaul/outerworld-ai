import type { CSSProperties } from "react";

export interface SegmentBarProps {
  /** Fill color: a var() reference. */
  readonly color: string;
  /** 0–100. Absent means no proven amount: the bar fills and marches while `active`. */
  readonly percent?: number;
  readonly active?: boolean;
  /** `sm` 6px track (roster), `md` 8px (mission cards), `lg` 12px with a 2px border (fuel). */
  readonly size?: "sm" | "md" | "lg";
  /** Accessible name; the bar is a meter when it has a percent, decoration otherwise. */
  readonly label?: string;
  /** A solid fill instead of segments (the roster's design). */
  readonly solid?: boolean;
}

const TRACK = {
  sm: "h-1.5 border border-line-soft",
  md: "h-2 border border-line-faint",
  lg: "h-3 border-2 border-line-strong",
} as const;

/** A segmented bar on a dark track: fuel, mission progress. */
export function SegmentBar({
  color,
  percent,
  active = false,
  size = "md",
  label,
  solid = false,
}: SegmentBarProps) {
  const proven = percent !== undefined;
  const width = proven ? Math.max(0, Math.min(100, percent)) : 100;
  const fill = solid
    ? ""
    : `st-segments ${size === "lg" ? "" : "st-segments-fine"} ${!proven && active ? "st-segments-march" : ""}`;
  const style = {
    width: `${width}%`,
    "--st-seg-color": color,
    ...(solid ? { background: color } : {}),
  } as CSSProperties;
  return (
    <div
      className={`bg-track ${TRACK[size]}`}
      {...(proven && label
        ? {
            role: "meter",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": Math.round(width),
          }
        : { "aria-hidden": true })}
    >
      <div className={`h-full ${fill}`} style={style} />
    </div>
  );
}
