import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { injectThemeInit } from "./src/theme-init.js";

const home = (() => {
  const raw = process.env.OUTERWORLD_HOME;
  if (!raw) return join(homedir(), ".outerworld");
  return raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : resolve(raw);
})();
const daemonPort = process.env.OUTERWORLD_PORT ?? "4317";

/**
 * Development only: put the dev daemon's token into index.html, the way the daemon does for the
 * built SPA (ADR-0011). Read per request, so a token created after Vite started is picked up.
 */
function devToken(): Plugin {
  return {
    name: "outerworld-dev-token",
    apply: "serve",
    transformIndexHtml(html) {
      let token = "";
      try {
        token = readFileSync(join(home, "daemon.token"), "utf8").trim();
      } catch {
        // No daemon yet: the page shows how to start one.
      }
      return token
        ? html.replace("</head>", `<meta name="outerworld-token" content="${token}"></head>`)
        : html;
    },
  };
}

/** Dev and build: the theme init script, inlined so the first paint already has the theme. */
function themeInit(): Plugin {
  return { name: "outerworld-theme-init", transformIndexHtml: injectThemeInit };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), themeInit(), devToken()],
  server: {
    host: "localhost",
    port: 5173,
    // The daemon allows exactly this origin in development (OUTERWORLD_DEV_ORIGIN).
    strictPort: true,
    proxy: {
      "/api": { target: `http://127.0.0.1:${daemonPort}` },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
