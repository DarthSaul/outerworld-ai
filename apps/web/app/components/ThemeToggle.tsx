"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "outerworld.theme";

/** Reads the persisted choice; a ?theme= query wins so the screenshot script can force one. */
function initialTheme(): { theme: Theme; fromQuery: boolean } {
  try {
    const q = new URLSearchParams(window.location.search).get("theme");
    if (q === "light" || q === "dark") return { theme: q, fromQuery: true };
    const stored = window.localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return { theme: stored, fromQuery: false };
  } catch {
    // Storage can be unavailable (private mode, blocked). Fall through to system.
  }
  return { theme: "system", fromQuery: false };
}

/**
 * System / light / dark. Sets data-theme on <html>, which tokens.css keys the dark override on,
 * and remembers the choice in localStorage (per-viewer convenience only; see docs/PRIVACY.md).
 * The layout's inline script applies the stored value before first paint.
 */
export function ThemeToggle() {
  // null until the stored choice is read, so the init script's attribute is never undone on mount.
  const [theme, setTheme] = useState<Theme | null>(null);
  // A ?theme= query forces a look for one page load; it is applied but never persisted.
  const [persist, setPersist] = useState(true);

  useEffect(() => {
    const initial = initialTheme();
    setPersist(!initial.fromQuery);
    setTheme(initial.theme);
  }, []);

  useEffect(() => {
    if (theme === null) return;
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    if (!persist) return;
    try {
      if (theme === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, theme);
    } catch {
      // Storage unavailable: the attribute still applies for this page.
    }
  }, [theme, persist]);

  return (
    <fieldset className="flex flex-wrap items-center gap-(--ow-space-2) border-0 p-0">
      <legend className="sr-only">Theme</legend>
      {(["system", "light", "dark"] as const).map((t) => (
        <label
          key={t}
          className="flex h-(--ow-size-control-h-dense) cursor-pointer items-center gap-(--ow-space-1) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-2 has-checked:border-border-strong has-checked:text-ink-1"
        >
          <input
            type="radio"
            name="theme"
            value={t}
            checked={theme === t}
            onChange={() => {
              setPersist(true);
              setTheme(t);
            }}
            className="sr-only"
          />
          {t}
        </label>
      ))}
    </fieldset>
  );
}

/** Inline, render-blocking on purpose: applies the stored theme before the first paint. Keep tiny. */
export const THEME_INIT_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var t=(q==="light"||q==="dark")?q:localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){/* storage unavailable: leave the system theme */}})();`;
