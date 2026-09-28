import { useEffect, useState } from "react";

/**
 * True when the viewport is at or above the desktop breakpoint token. Reads the token from CSS
 * so the one literal stays in theme.css. SSR and non-browser environments report `fallback`.
 */
export function useDesktop(fallback = true): boolean {
  const [desktop, setDesktop] = useState(fallback);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const px = getComputedStyle(document.documentElement)
      .getPropertyValue("--ow-breakpoint-mobile")
      .trim();
    if (!px) return;
    const mq = window.matchMedia(`(min-width: ${px})`);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}
