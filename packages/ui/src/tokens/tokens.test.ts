import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BLINK_STAGGER_MS,
  GRANT_MODES,
  glowToken,
  HEALTH_STATES,
  MOTION_MS,
  PACKET_SPEED,
  ROOM_COLOR_COUNT,
  RUN_STATES,
  roomColorVar,
  STATION_MS,
  stVar,
  THEMED_TOKENS,
  tokenVar,
  ZOOM,
} from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "tokens.css"), "utf8");
const stationCss = readFileSync(join(here, "station.css"), "utf8");

/** Splits tokens.css into its three theme blocks by the selectors the CLAUDE.md theme rule requires. */
function blocks(): { light: string; darkPreferred: string; darkForced: string } {
  // Match rule openers at line start so mentions inside the header comment are ignored.
  const at = (re: RegExp): number => css.search(re);
  const darkPreferredAt = at(/^@media \(prefers-color-scheme: dark\) \{/m);
  const darkForcedAt = at(/^:root\[data-theme="dark"\] \{/m);
  const reducedAt = at(/^@media \(prefers-reduced-motion: reduce\) \{/m);
  expect(darkPreferredAt).toBeGreaterThan(0);
  expect(darkForcedAt).toBeGreaterThan(darkPreferredAt);
  expect(reducedAt).toBeGreaterThan(darkForcedAt);
  return {
    light: css.slice(0, darkPreferredAt),
    darkPreferred: css.slice(darkPreferredAt, darkForcedAt),
    darkForced: css.slice(darkForcedAt, reducedAt),
  };
}

const declared = (block: string, name: string): boolean => new RegExp(`--ow-${name}:`).test(block);

describe("tokens.css contract", () => {
  const { light, darkPreferred, darkForced } = blocks();

  it("guards the preferred-scheme dark block so an explicit light theme wins", () => {
    expect(darkPreferred).toContain(':root:not([data-theme="light"])');
  });

  it.each(THEMED_TOKENS)("defines --ow-%s in light and both dark blocks", (name) => {
    expect(declared(light, name)).toBe(true);
    expect(declared(darkPreferred, name)).toBe(true);
    expect(declared(darkForced, name)).toBe(true);
  });

  it("defines the same set of overrides in both dark blocks", () => {
    const names = (block: string) =>
      [...block.matchAll(/--ow-([a-z0-9-]+):/g)].map((m) => m[1]).sort();
    expect(names(darkPreferred)).toEqual(names(darkForced));
  });

  it.each(RUN_STATES)("defines a run color and a glow for %s", (state) => {
    expect(declared(light, `run-${state}`)).toBe(true);
    expect(css).toContain(`${glowToken(state)}:`);
  });

  it.each(HEALTH_STATES)("defines a health color for %s", (state) => {
    expect(declared(light, `health-${state}`)).toBe(true);
  });

  it.each(GRANT_MODES)("defines a grant color and chip tokens for %s", (mode) => {
    expect(declared(light, `grant-${mode}`)).toBe(true);
    expect(declared(light, `chip-bg-${mode}`)).toBe(true);
    expect(declared(light, `chip-bg-${mode}-active`)).toBe(true);
  });

  it("uses no hex colors anywhere (oklch only)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("theme.css contract", () => {
  const theme = readFileSync(join(here, "theme.css"), "utf8");

  it("keeps the literal desktop breakpoint equal to the mobile breakpoint token", () => {
    const token = /--ow-breakpoint-mobile:\s*([^;]+);/.exec(css)?.[1]?.trim();
    const literal = /--breakpoint-desktop:\s*([^;]+);/.exec(theme)?.[1]?.trim();
    expect(token).toBeDefined();
    expect(literal).toBe(token);
  });

  it("maps every namespaced value to an --ow-* variable except the breakpoint", () => {
    const literals = [
      ...theme.matchAll(/^\s*--(color|text|radius|font|ease|spacing)-[a-z0-9-]+:\s*([^;]+);/gm),
    ]
      .map((m) => m[2] ?? "")
      .filter((v) => !v.startsWith("var(--ow-") && !v.startsWith("var(--st-") && v !== "initial");
    expect(literals).toEqual([]);
  });
});

describe("MOTION_MS parity", () => {
  it.each(Object.entries(MOTION_MS))("--ow-dur-%s equals %dms in tokens.css", (name, ms) => {
    const m = new RegExp(`--ow-dur-${name}:\\s*(\\d+)ms;`).exec(css);
    expect(m?.[1], name).toBeDefined();
    expect(Number(m?.[1])).toBe(ms);
  });
});

describe("ZOOM and blink parity", () => {
  const num = (name: string) => Number(new RegExp(`--ow-${name}:\\s*([\\d.]+)`).exec(css)?.[1]);
  it("mirrors the zoom range and step in tokens.css", () => {
    expect(num("zoom-min")).toBe(ZOOM.min);
    expect(num("zoom-max")).toBe(ZOOM.max);
    expect(num("zoom-step")).toBe(ZOOM.step);
  });
  it("mirrors the blink stagger in tokens.css", () => {
    expect(new RegExp(`--ow-rig-blink-stagger:\\s*${BLINK_STAGGER_MS}ms;`).test(css)).toBe(true);
    expect(css).toMatch(/--ow-rig-blink-opacity:\s*[\d.]+;/);
    expect(css).toMatch(/--ow-size-sheet-max-h:/);
  });
});

describe("token helpers", () => {
  it("builds a var() reference", () => {
    expect(tokenVar("ink-1")).toBe("var(--ow-ink-1)");
  });

  it("names the glow token for a state", () => {
    expect(glowToken("working")).toBe("--ow-rig-glow-working");
  });
});

describe("station.css contract (ADR-0013)", () => {
  const theme = readFileSync(join(here, "theme.css"), "utf8");
  const defined = new Set([...stationCss.matchAll(/--st-([a-z0-9-]+):/g)].map((m) => m[1]));

  it("is dark only: no light block and no theme switch", () => {
    expect(stationCss).toMatch(/color-scheme:\s*dark;/);
    expect(stationCss).not.toContain("prefers-color-scheme");
    expect(stationCss).not.toContain("data-theme");
  });

  it("uses no hex colors anywhere (oklch only)", () => {
    expect(stationCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("defines every --st-* variable the Tailwind theme maps", () => {
    const mapped = [...theme.matchAll(/var\(--st-([a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(mapped.length).toBeGreaterThan(0);
    expect(mapped.filter((name) => !defined.has(name))).toEqual([]);
  });

  it.each(Object.entries(STATION_MS))("--st-dur-%s equals %dms", (name, ms) => {
    const m = new RegExp(`--st-dur-${name}:\\s*(\\d+)ms;`).exec(stationCss);
    expect(m?.[1], name).toBeDefined();
    expect(Number(m?.[1])).toBe(ms);
  });

  it("mirrors the packet speed", () => {
    expect(Number(/--st-packet-speed:\s*([\d.]+)/.exec(stationCss)?.[1])).toBe(PACKET_SPEED);
  });

  it("defines exactly ROOM_COLOR_COUNT room colors", () => {
    const rooms = [...defined].filter((n) => /^room-\d+$/.test(n ?? ""));
    expect(rooms).toHaveLength(ROOM_COLOR_COUNT);
  });

  it.each(["schematic", "floorplan", "polygon"])("defines the %s map style", (style) => {
    expect(stationCss).toContain(`[data-map-style="${style}"]`);
  });

  it("stops blinking under reduced motion and while stopped", () => {
    expect(stationCss).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.st-blink/);
    expect(stationCss).toContain("[data-paused] .st-blink");
  });

  it("wraps room colors and builds var() references", () => {
    expect(roomColorVar(0)).toBe("var(--st-room-0)");
    expect(roomColorVar(ROOM_COLOR_COUNT + 1)).toBe("var(--st-room-1)");
    expect(stVar("cyan")).toBe("var(--st-cyan)");
  });
});
