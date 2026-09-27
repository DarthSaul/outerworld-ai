#!/usr/bin/env node
// Headless browser verification (this repo's stand-in for the Chrome DevTools MCP).
// Builds nothing: run `pnpm build` first. Serves apps/web, then for every route × theme × width ×
// reduced-motion combination captures a full-page screenshot into .outerworld/screenshots/,
// records console errors and page errors, and under reduced motion asserts that no running
// animation is longer than the reduced-motion token. Exit 1 on any failure.
//
// Usage: node scripts/browser/screenshot.mjs [--routes /dev,/] [--port 3300] [--keep]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const routes = arg("routes", "/dev,/").split(",");
const port = Number(arg("port", "3300"));
const outDir = join(process.cwd(), ".outerworld", "screenshots");
mkdirSync(outDir, { recursive: true });

// Spawn next directly in its own process group so the whole tree dies with it: killing a pnpm
// wrapper leaves the real server running and the next run then hits a stale instance.
const webDir = join(process.cwd(), "apps", "web");
const server = spawn(join(webDir, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
  cwd: webDir,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
let serverLog = "";
server.stdout.on("data", (d) => {
  serverLog += d;
});
server.stderr.on("data", (d) => {
  serverLog += d;
});

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  let lastError = "no response yet";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/`);
      if (r.ok) return;
      lastError = `HTTP ${r.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not start on ${port} (${lastError})\n${serverLog}`);
}

const failures = [];
const report = [];

try {
  await waitForServer();
  const browser = await chromium.launch();
  for (const route of routes) {
    for (const theme of ["light", "dark"]) {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        for (const width of [375, 1280]) {
          const ctx = await browser.newContext({
            viewport: { width, height: 900 },
            colorScheme: theme,
            reducedMotion,
          });
          const page = await ctx.newPage();
          // Force the theme on every page, so the check does not depend on a page's own switch.
          await page.addInitScript((t) => {
            const apply = () => document.documentElement?.setAttribute("data-theme", t);
            if (document.documentElement) apply();
            else document.addEventListener("readystatechange", apply, { once: true });
          }, theme);
          const errors = [];
          page.on("console", (m) => {
            if (m.type() === "error") errors.push(`${m.text()} @ ${m.location()?.url ?? "?"}`);
          });
          page.on("response", (r) => {
            if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
          });
          page.on("pageerror", (e) => errors.push(String(e)));
          const sep = route.includes("?") ? "&" : "?";
          await page.goto(`http://localhost:${port}${route}${sep}theme=${theme}`, {
            waitUntil: "networkidle",
          });
          await page.waitForTimeout(300);
          const name = `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${theme}-${reducedMotion === "reduce" ? "rm" : "motion"}-${width}.png`;
          await page.screenshot({ path: join(outDir, name), fullPage: true });

          const probe = await page.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            const raw = root.getPropertyValue("--ow-dur-reduced").trim();
            const reduced = raw.endsWith("ms")
              ? Number.parseFloat(raw)
              : Number.parseFloat(raw) * 1000 || 0;
            const anims = document.getAnimations().map((a) => {
              const t = a.effect?.getComputedTiming?.() ?? {};
              return {
                duration: Number(t.duration) || 0,
                iterations: t.iterations,
                name: a.animationName ?? a.id ?? "",
              };
            });
            return {
              reduced,
              animations: anims.length,
              longest: Math.max(0, ...anims.map((a) => a.duration)),
              loops: anims.filter((a) => a.iterations === Number.POSITIVE_INFINITY).length,
              theme: document.documentElement.getAttribute("data-theme"),
              bg: getComputedStyle(document.body).backgroundColor,
              hasHorizontalScroll:
                document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
          });
          const line = { route, theme, reducedMotion, width, ...probe, errors: errors.length };
          report.push(line);
          if (errors.length) failures.push(`${name}: console errors: ${errors.join(" | ")}`);
          if (reducedMotion === "reduce" && probe.longest > probe.reduced) {
            failures.push(
              `${name}: reduced motion but an animation runs ${probe.longest}ms (> ${probe.reduced}ms)`,
            );
          }
          if (reducedMotion === "reduce" && probe.loops > 0) {
            failures.push(`${name}: reduced motion but ${probe.loops} animation(s) loop`);
          }
          if (probe.hasHorizontalScroll)
            failures.push(`${name}: horizontal page scroll at ${width}px`);
          if (probe.theme !== theme)
            failures.push(`${name}: data-theme is ${probe.theme}, expected ${theme}`);
          await ctx.close();
        }
      }
    }
  }
  await browser.close();
} finally {
  if (!process.argv.includes("--keep") && server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

writeFileSync(join(outDir, "report.json"), `${JSON.stringify({ report, failures }, null, 2)}\n`);
console.table(
  report.map(
    ({
      route,
      theme,
      reducedMotion,
      width,
      animations,
      longest,
      loops,
      errors,
      hasHorizontalScroll,
    }) => ({
      route,
      theme,
      reducedMotion,
      width,
      animations,
      longest,
      loops,
      errors,
      hscroll: hasHorizontalScroll,
    }),
  ),
);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  if (/error/i.test(serverLog)) console.error(`\nserver log:\n${serverLog.slice(-3000)}`);
  process.exit(1);
}
console.log(`\nclean. screenshots in ${outDir}`);
