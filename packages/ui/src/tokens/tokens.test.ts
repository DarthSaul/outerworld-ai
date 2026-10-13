import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PACKET_SPEED, ROOM_COLOR_COUNT, roomColorVar, STATION_MS, stVar } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const stationCss = readFileSync(join(here, "station.css"), "utf8");

describe("theme.css contract", () => {
  const theme = readFileSync(join(here, "theme.css"), "utf8");

  it("keeps the literal desktop breakpoint equal to the breakpoint token", () => {
    const token = /--st-breakpoint-desktop:\s*([^;]+);/.exec(stationCss)?.[1]?.trim();
    const literal = /--breakpoint-desktop:\s*([^;]+);/.exec(theme)?.[1]?.trim();
    expect(token).toBeDefined();
    expect(literal).toBe(token);
  });

  it("maps every namespaced value to an --st-* variable except the breakpoint", () => {
    const literals = [
      ...theme.matchAll(
        /^\s*--(color|text|radius|font|ease|spacing|shadow|tracking)-[a-z0-9-]+:\s*([^;]+);/gm,
      ),
    ]
      .map((m) => m[2] ?? "")
      .filter((v) => !v.startsWith("var(--st-") && v !== "initial");
    expect(literals).toEqual([]);
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
