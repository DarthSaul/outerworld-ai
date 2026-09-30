import { describe, expect, it } from "vitest";
import { injectThemeInit, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme-init.js";

describe("theme init", () => {
  it("inlines the script as the first thing in <head>", () => {
    const html = injectThemeInit("<html><head><title>x</title></head></html>");
    expect(html.indexOf(THEME_INIT_SCRIPT)).toBeGreaterThan(-1);
    expect(html.indexOf(THEME_INIT_SCRIPT)).toBeLessThan(html.indexOf("<title>"));
  });

  it("applies a stored or ?theme= choice to <html data-theme>", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.removeAttribute("data-theme");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem(THEME_STORAGE_KEY);
  });
});
