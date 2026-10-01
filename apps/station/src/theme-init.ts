/** localStorage key for the viewer's theme choice (a per-viewer convenience, docs/PRIVACY.md). */
export const THEME_STORAGE_KEY = "outerworld.theme";

/**
 * Inline, render-blocking on purpose: applies the stored (or `?theme=`) choice before the first
 * paint so there is no flash. Keep it tiny. React-free so vite.config.ts can inline it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var t=(q==="light"||q==="dark")?q:localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){/* storage unavailable: leave the system theme */}})();`;

/** Puts the init script at the top of <head>, before any stylesheet or module script. */
export function injectThemeInit(html: string): string {
  return html.replace("<head>", `<head>\n    <script>${THEME_INIT_SCRIPT}</script>`);
}
