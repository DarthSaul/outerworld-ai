import { useState } from "react";

/**
 * The display size (Settings › Appearance): how large the whole app draws, by setting the root
 * font size that every type token, spacing step and layout size is measured in (station.css,
 * `--st-u`). Kept per browser in localStorage, like the map style and the CRT overlay.
 */
export const DISPLAY_SIZES = ["auto", "compact", "standard", "large", "x-large"] as const;
export type DisplaySize = (typeof DISPLAY_SIZES)[number];

const KEY = "outerworld.display";

/** The stored size, or `auto` when none is stored or storage is blocked. */
export function readDisplay(): DisplaySize {
  try {
    const value = localStorage.getItem(KEY);
    return DISPLAY_SIZES.includes(value as DisplaySize) ? (value as DisplaySize) : "auto";
  } catch {
    return "auto";
  }
}

/** Puts the size on `<html data-display>`; `auto` removes it so the viewport decides. */
export function applyDisplay(size: DisplaySize, root: HTMLElement = document.documentElement) {
  if (size === "auto") root.removeAttribute("data-display");
  else root.setAttribute("data-display", size);
}

/** The display size and a setter that applies and stores it. */
export function useDisplay(): [DisplaySize, (size: DisplaySize) => void] {
  const [size, setSize] = useState(readDisplay);
  return [
    size,
    (next) => {
      setSize(next);
      applyDisplay(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Storage can be blocked (private windows); the size applies until the tab closes.
      }
    },
  ];
}
