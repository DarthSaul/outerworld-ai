#!/usr/bin/env node
// Headless browser verification (this repo's stand-in for the Chrome DevTools MCP).
// Builds nothing: run `pnpm build` first. Starts the daemon serving the built SPA on a fresh copy of
// fixtures/demo-station, then for every route × width × reduced-motion combination (the app is
// dark only, ADR-0013) captures a full-page screenshot into .outerworld/screenshots/,
// records console errors and page errors, runs axe (WCAG 2.x A/AA; critical and serious block,
// per CONSTRAINTS.md), and under reduced motion asserts that no animation runs at all (the
// station design stops blinking, packets and marching bars). Exit 1 on any failure.
//
// Before the screenshots, seed.mjs gives the station a little real history through the API and the
// fake model (a memory proposal, a finished chat, a scheduled run, a pending approval), D25.
// Usage: node scripts/browser/screenshot.mjs [--routes /dev,/] [--port 3300] [--keep]
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { seed } from "./seed.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const routes = arg(
  "routes",
  "/dev,/,/crew,/crew/vesper,/crew/quill,/comms,/comms?agent=vesper,/memory,/memory?agent=wren,/system/settings,/system/abilities/discover,/system/abilities/installed,/notifications",
).split(",");
const port = Number(arg("port", "3300"));
const outDir = join(process.cwd(), ".outerworld", "screenshots");
mkdirSync(outDir, { recursive: true });

// A fresh copy of the fixture per run, so the daemon's token, database, and events never leak
// between runs and the fixture itself is never written to.
const home = join(process.cwd(), ".outerworld", "verify-home");
rmSync(home, { recursive: true, force: true });
cpSync(join(process.cwd(), "fixtures", "demo-station"), home, { recursive: true });

// Spawn the daemon directly in its own process group so the whole tree dies with it.
const server = spawn(process.execPath, [join(process.cwd(), "apps", "daemon", "dist", "main.js")], {
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env: {
    ...process.env,
    OUTERWORLD_HOME: home,
    OUTERWORLD_PORT: String(port),
    OUTERWORLD_MODEL: "fake",
    // A throwaway station must not read the developer's keychain (sign-ins are per user, D25).
    OUTERWORLD_SECRETS: "memory",
  },
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

/** axe on the page as it is now; critical and serious violations fail the run. */
async function axeBlocking(page, name) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  for (const v of results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  )) {
    failures.push(
      `${name}: axe ${v.impact} ${v.id}: ${v.help} (e.g. ${v.nodes[0]?.target?.join(" ") ?? "?"})`,
    );
  }
}

/**
 * The Station's interactions in a real browser (ADR-0014): dragging pans the map and Recenter
 * fits it again; the status drawer opens as a dialog, passes axe, and closes on Escape.
 */
async function stationInteractions(page, width) {
  const transform = () => page.locator("[data-map-plane]").evaluate((el) => el.style.transform);
  const fitted = await transform();
  const box = await page.locator("[data-map-viewport]").boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 30, { steps: 6 });
    await page.mouse.up();
    if ((await transform()) === fitted)
      failures.push(`home-${width}: dragging did not pan the map`);
    await page.getByRole("button", { name: /Recenter/ }).click();
    if ((await transform()) !== fitted)
      failures.push(`home-${width}: Recenter did not fit the map again`);
  } else {
    failures.push(`home-${width}: no map viewport`);
  }
  // The splitter between the map and the side column: dragging it left widens the side column;
  // a double-click puts it back.
  if (width >= 720) {
    const splitter = page.getByRole("separator", { name: /Resize the map/ });
    const mapWidth = () =>
      page
        .getByRole("region", { name: /^Station map/ })
        .evaluate((el) => el.getBoundingClientRect().width);
    const before = await mapWidth();
    const box = await splitter.boundingBox();
    if (box) {
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 120, y, { steps: 6 });
      await page.mouse.up();
      const after = await mapWidth();
      if (!(after < before - 60)) {
        failures.push(`home-${width}: dragging the splitter did not resize the map`);
      }
      await page.screenshot({ path: join(outDir, `home-split-${width}.png`) });
      await splitter.dblclick();
      if (Math.abs((await mapWidth()) - before) > 2) {
        failures.push(`home-${width}: double-clicking the splitter did not reset it`);
      }
    } else {
      failures.push(`home-${width}: no splitter`);
    }
  }

  // Header, screen, and footer share their left and right edges (ADR-0018).
  const edges = (selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right)];
      });
  const [head, body, foot] = [
    await edges("header > div"),
    await edges("main > div"),
    await edges("footer > div"),
  ];
  if (head.join() !== body.join() || foot.join() !== body.join()) {
    failures.push(
      `home-${width}: edges differ: header ${head}, main ${body}, footer ${foot} (left,right)`,
    );
  }

  // The scanner starts folded to its strip; COMMS fills the column above it.
  const scannerRegion = page.getByRole("region", { name: "Scanner" });
  const heightOf = (locator) => locator.evaluate((el) => el.getBoundingClientRect().height);
  const commsRegion = page.getByRole("region", { name: "COMMS" });
  const foldedScanner = await heightOf(scannerRegion);
  if (width >= 720 && foldedScanner > 60) {
    failures.push(`home-${width}: the folded scanner is ${foldedScanner}px tall`);
  }
  await scannerRegion.getByRole("button", { name: "Show the scanner" }).click();
  if (width >= 720) {
    // Open, it takes at most half the column.
    const [scan, comms] = [await heightOf(scannerRegion), await heightOf(commsRegion)];
    if (scan > (scan + comms) / 2 + 16) {
      failures.push(`home-${width}: the open scanner is ${scan}px over comms' ${comms}px`);
    }
  }

  // The scanner's crew picker: opens, passes axe, picks from the keyboard, closes.
  const picker = page.getByRole("button", { name: /^Crew · \d+/ });
  await picker.click();
  await page.getByRole("listbox").waitFor();
  await page.screenshot({ path: join(outDir, `home-crew-picker-${width}.png`) });
  await axeBlocking(page, `home-crew-picker-${width}`);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  if (await page.getByRole("listbox").isVisible()) {
    failures.push(`home-${width}: choosing crew did not close the picker`);
  }
  if ((await picker.textContent())?.includes("Pick a crew member")) {
    failures.push(`home-${width}: the crew picker did not show the chosen crew member`);
  }
  if (width >= 720) {
    // The column ends where the map does.
    const bottom = (name) =>
      page
        .getByRole("region", { name })
        .evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    const [scan, map] = [await bottom("Scanner"), await bottom(/^Station map/)];
    if (scan !== map) {
      failures.push(`home-${width}: the scanner ends at ${scan}px, the map at ${map}px`);
    }
  }
  await scannerRegion.getByRole("button", { name: "Hide the scanner" }).click();

  // The message box wraps, grows to three lines, then scrolls without growing the panel.
  const order = commsRegion.getByRole("textbox", { name: /^Message / });
  const commsBefore = await heightOf(commsRegion);
  // Shift+Enter starts a new line rather than sending.
  await order.fill("First line");
  await order.press("Shift+Enter");
  await order.pressSequentially("Second");
  if (!(await order.inputValue()).includes("\n")) {
    failures.push(`home-${width}: Shift+Enter did not start a new line in the message`);
  }
  await order.fill("Draft the plan. ".repeat(40));
  await order.dispatchEvent("input");
  const field = await order.evaluate((el) => {
    const line = Number.parseFloat(getComputedStyle(el).lineHeight);
    return { lines: el.clientHeight / line, scrolls: el.scrollHeight > el.clientHeight };
  });
  if (Math.round(field.lines) !== 3 || !field.scrolls) {
    failures.push(`home-${width}: the message box shows ${field.lines.toFixed(1)} lines`);
  }
  if (width >= 720 && Math.round(await heightOf(commsRegion)) !== Math.round(commsBefore)) {
    failures.push(`home-${width}: a long message grew the comms panel`);
  }
  await page.screenshot({ path: join(outDir, `home-order-${width}.png`) });
  await order.fill("");

  // The crew column: the agent row's dropdown, then a session opened from the list into COMMS.
  const crewColumn = page.getByRole("region", { name: "Crew", exact: true });
  await commsRegion.getByRole("button", { name: /^Answering/ }).click();
  await commsRegion.getByRole("listbox").waitFor();
  await page.screenshot({ path: join(outDir, `home-agent-picker-${width}.png`) });
  await axeBlocking(page, `home-agent-picker-${width}`);
  await page.keyboard.press("Escape");
  const firstSession = crewColumn.locator("[data-session]").first();
  if (await firstSession.count()) {
    await firstSession.click();
    await commsRegion.locator("[data-transcript]").waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `home-chat-${width}.png`) });
    await axeBlocking(page, `home-chat-${width}`);
  } else {
    failures.push(`home-${width}: the crew column listed no sessions to open`);
  }
  await crewColumn.getByRole("button", { name: "Dispatched" }).click();
  await page.screenshot({ path: join(outDir, `home-dispatched-${width}.png`) });
  await crewColumn.getByRole("button", { name: "All" }).click();

  if (width >= 720) {
    const mapRegion = page.getByRole("region", { name: /^Station map/ });
    const mapBefore = await mapRegion.evaluate((el) => el.getBoundingClientRect().width);
    // Folding the crew column leaves a folder tab and gives the map its share.
    await crewColumn.getByRole("button", { name: "Hide the crew column" }).click();
    const tab = page.getByRole("button", { name: "Show the crew column" });
    await tab.waitFor();
    const mapFolded = await mapRegion.evaluate((el) => el.getBoundingClientRect().width);
    if (!(mapFolded > mapBefore + 100)) {
      failures.push(`home-${width}: folding the crew column did not widen the map`);
    }
    await page.screenshot({ path: join(outDir, `home-crew-folded-${width}.png`) });
    await axeBlocking(page, `home-crew-folded-${width}`);
    await tab.click();
    await crewColumn.waitFor();
    // Expand widens COMMS across the station; Collapse brings the columns back.
    await commsRegion.getByRole("button", { name: "Expand" }).click();
    if (await mapRegion.isVisible()) {
      failures.push(`home-${width}: expanding comms left the map showing`);
    }
    await page.screenshot({ path: join(outDir, `home-comms-expanded-${width}.png`) });
    await commsRegion.getByRole("button", { name: "Collapse" }).click();
    await mapRegion.waitFor();
  }
  await crewColumn.getByRole("button", { name: "New" }).click();

  await page.locator('[aria-controls="station-status"]').click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, `home-drawer-${width}.png`) });
  await axeBlocking(page, `home-drawer-${width}`);
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").isVisible()) {
    failures.push(`home-${width}: Escape did not close the status drawer`);
  }
  // The footer's System menu opens over the footer, routes, and closes with Escape.
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("button", { name: "System" }).click();
  const menu = footer.getByRole("menu");
  await menu.waitFor();
  await page.screenshot({ path: join(outDir, `home-system-menu-${width}.png`) });
  await axeBlocking(page, `home-system-menu-${width}`);
  await page.keyboard.press("Escape");
  if (await menu.isVisible()) failures.push(`home-${width}: Escape did not close the System menu`);
}

try {
  await waitForServer();
  await seed({ port, home });
  const browser = await chromium.launch();
  for (const route of routes) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      for (const width of [375, 1280]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: "dark",
          reducedMotion,
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(`${m.text()} @ ${m.location()?.url ?? "?"}`);
        });
        page.on("response", (r) => {
          if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
        });
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(`http://localhost:${port}${route}`, {
          // Not "networkidle": the SPA keeps its SSE connection open for good.
          waitUntil: "load",
        });
        if (route === "/") {
          await page
            .waitForSelector('[data-connection="connected"]', { timeout: 5000 })
            .catch(() => {});
        }
        await page.waitForTimeout(300);
        const name = `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${reducedMotion === "reduce" ? "rm" : "motion"}-${width}.png`;
        await page.screenshot({ path: join(outDir, name), fullPage: true });

        const probe = await page.evaluate(() => {
          // The station design stops every animation under reduced motion (ADR-0013).
          const reduced = 0;
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
            bg: getComputedStyle(document.body).backgroundColor,
            // A document taller than the viewport must be scrollable: only the dashboard locks body overflow.
            tall: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
            canScroll: getComputedStyle(document.body).overflowY !== "hidden",
            // The served page must be connected to the daemon's live event stream.
            connection:
              document.querySelector("[data-connection]")?.getAttribute("data-connection") ?? null,
            hasHorizontalScroll:
              document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        });
        // axe once per route × width (motion preference does not change the tree).
        let axeBlocking = 0;
        if (reducedMotion === "no-preference") {
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          const blocking = results.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious",
          );
          axeBlocking = blocking.length;
          for (const v of blocking) {
            failures.push(
              `${name}: axe ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(" ") ?? "?"})`,
            );
          }
          const minor = results.violations.filter(
            (v) => v.impact !== "critical" && v.impact !== "serious",
          );
          if (minor.length)
            console.warn(
              `${name}: axe ${minor.map((v) => `${v.impact}:${v.id}`).join(", ")} (not blocking)`,
            );
        }
        if (route === "/" && reducedMotion === "no-preference") {
          await stationInteractions(page, width);
        }
        const line = {
          route,
          reducedMotion,
          width,
          ...probe,
          errors: errors.length,
          axe: axeBlocking,
        };
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
        if (probe.tall && !probe.canScroll)
          failures.push(
            `${name}: taller than the viewport but body overflow is hidden, so it cannot scroll`,
          );
        if (route === "/" && probe.connection !== "connected")
          failures.push(
            `${name}: event stream is "${probe.connection}", expected connected (token, Origin, or SSE broken)`,
          );
        await ctx.close();
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
    ({ route, reducedMotion, width, animations, longest, loops, errors, hasHorizontalScroll }) => ({
      route,
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
