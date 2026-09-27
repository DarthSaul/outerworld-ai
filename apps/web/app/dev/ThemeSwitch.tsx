"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

/**
 * Gallery-only theme switch. Sets data-theme on <html>, which tokens.css keys the dark override on.
 * Reads ?theme= so the screenshot script can force a theme without clicking.
 */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("theme");
    if (fromQuery === "light" || fromQuery === "dark") setTheme(fromQuery);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <fieldset className="flex items-center gap-(--ow-space-2) border-0 p-0">
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
            onChange={() => setTheme(t)}
            className="sr-only"
          />
          {t}
        </label>
      ))}
    </fieldset>
  );
}
