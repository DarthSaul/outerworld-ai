import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { stVar } from "../tokens/tokens.js";
import { type Tone, toneVar } from "./tone.js";

/**
 * Classes for a page or map-style tab: cyan outline, filled when active. Exported as a class
 * string so the app can put it on a router link.
 */
export function tabClass(active: boolean, size: "page" | "map" = "page"): string {
  const pad = size === "page" ? "px-2.25 py-1.75" : "px-1.75 py-1.25";
  return `inline-block cursor-pointer border-2 border-cyan font-display text-d7 uppercase no-underline ${pad} ${
    active ? "bg-cyan text-ink" : "bg-transparent text-cyan hover:bg-btn-hover"
  }`;
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> & {
  readonly children: ReactNode;
};

export interface OutlineButtonProps extends ButtonProps {
  /** Border and text color. `line` is the quiet secondary (DEMOLISH, ◀ ROOM). */
  readonly tone?: Tone | "line";
  /** Filled in its tone with ink text (CANCEL while drawing, SEND). */
  readonly filled?: boolean;
}

/** A transparent button with a 2px colored outline, in the display face. */
export function OutlineButton({
  tone = "cyan",
  filled = false,
  className = "",
  style,
  children,
  ...rest
}: OutlineButtonProps) {
  const color = tone === "line" ? stVar("line") : toneVar(tone);
  const text = tone === "line" ? stVar("panel-title") : color;
  const look = {
    borderColor: color,
    color: filled ? stVar("ink") : text,
    background: filled ? color : "transparent",
    ...style,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`cursor-pointer border-2 px-2.5 py-1.5 font-display text-d7 uppercase hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={look}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface ChoiceButtonProps extends ButtonProps {
  /** The circular glyph: A or B. */
  readonly glyph: "A" | "B";
  readonly tone: "green" | "red" | "amber";
  readonly size?: "d8" | "d9";
}

const HOVER = { green: "approve-hover", red: "deny-hover", amber: "random-hover" } as const;
const TEXT = { green: "green", red: "red-text", amber: "amber" } as const;

/** The design's (A) APPROVE / (B) DENY buttons: a filled circular glyph and a label. */
export function ChoiceButton({
  glyph,
  tone,
  size = "d9",
  className = "",
  children,
  ...rest
}: ChoiceButtonProps) {
  const style = {
    borderColor: toneVar(tone),
    color: stVar(TEXT[tone]),
    "--st-choice-hover": stVar(HOVER[tone]),
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`flex flex-1 cursor-pointer items-center gap-2 border-2 bg-well px-2 py-1.5 font-display uppercase hover:bg-(--st-choice-hover) disabled:cursor-not-allowed disabled:opacity-50 ${size === "d8" ? "text-d8" : "text-d9"} ${className}`}
      style={style}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="flex size-5.5 shrink-0 items-center justify-center rounded-round text-d9 text-ink"
        style={{ background: toneVar(tone) }}
      >
        {glyph}
      </span>
      {children}
    </button>
  );
}

/** A rotated-square diamond: the mark of a placed object (grant). */
export function Diamond({ color, size = 6 }: { readonly color: string; readonly size?: 6 | 7 }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rotate-45 ${size === 6 ? "size-1.5" : "size-1.75"}`}
      style={{ background: color }}
    />
  );
}
