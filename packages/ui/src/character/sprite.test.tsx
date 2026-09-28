import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RIG_SYMBOLS, RigSprite, symbolId } from "./sprite.js";

/** Rendered per test: the shared cleanup unmounts after each one. */
const mount = () => render(<RigSprite />).container;

describe("RigSprite", () => {
  it("renders one hidden, decorative svg", () => {
    const svg = mount().querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.getAttribute("style") ?? "").toMatch(/display:\s*none/);
  });

  it.each(RIG_SYMBOLS)("defines the %s symbol", (name) => {
    const symbol = mount().querySelector(`symbol#${symbolId(name)}`);
    expect(symbol).not.toBeNull();
    expect(symbol?.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(symbol?.getAttribute("shape-rendering")).toBe("crispEdges");
  });

  it("uses only grid-snapped rects whose fills are token variables", () => {
    const rects = Array.from(mount().querySelectorAll("rect"));
    expect(rects.length).toBeGreaterThan(100);
    for (const r of rects) {
      for (const attr of ["x", "y", "width", "height"]) {
        expect(Number.isInteger(Number(r.getAttribute(attr))), `${attr} of ${r.outerHTML}`).toBe(
          true,
        );
      }
      expect(r.getAttribute("fill"), r.outerHTML).toMatch(/^var\(--ow-(rig|emblem)-[a-z-]+\)$/);
      expect(r.getAttribute("rx")).toBeNull();
      expect(r.getAttribute("stroke")).toBeNull();
    }
  });

  it("keeps every rect inside its symbol's viewBox", () => {
    for (const symbol of Array.from(mount().querySelectorAll("symbol"))) {
      const [, , w, h] = (symbol.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
      for (const r of Array.from(symbol.querySelectorAll("rect"))) {
        const x = Number(r.getAttribute("x"));
        const y = Number(r.getAttribute("y"));
        expect(
          x + Number(r.getAttribute("width")),
          `${symbol.id} ${r.outerHTML}`,
        ).toBeLessThanOrEqual(w ?? 0);
        expect(
          y + Number(r.getAttribute("height")),
          `${symbol.id} ${r.outerHTML}`,
        ).toBeLessThanOrEqual(h ?? 0);
      }
    }
  });

  it("has no duplicate rect in any part (rects are keyed by geometry)", () => {
    for (const symbol of Array.from(mount().querySelectorAll("symbol"))) {
      const keys = Array.from(symbol.querySelectorAll("rect")).map(
        (r) =>
          `${r.getAttribute("x")},${r.getAttribute("y")},${r.getAttribute("width")},${r.getAttribute("height")},${r.getAttribute("fill")}`,
      );
      expect(new Set(keys).size, symbol.id).toBe(keys.length);
    }
  });

  it("covers the full part vocabulary the schema allows", () => {
    const names = new Set<string>(RIG_SYMBOLS);
    for (const head of ["dome", "wedge", "crest"]) expect(names.has(`head-${head}`)).toBe(true);
    for (const trace of ["core", "bar", "chevron", "split", "frame", "twin"])
      expect(names.has(`trace-${trace}`)).toBe(true);
    for (const acc of ["antenna", "thruster", "plate", "crest"])
      expect(names.has(`accessory-${acc}`)).toBe(true);
    for (const mark of ["spire", "forge", "dome", "archive", "beacon"])
      expect(names.has(`mark-${mark}`)).toBe(true);
    for (const n of [
      "body-idle",
      "body-active",
      "shoulder-ball",
      "shoulder-pauldron",
      "glyph-check",
      "glyph-exclaim",
      "emblem-disc",
      "hero",
    ]) {
      expect(names.has(n), n).toBe(true);
    }
  });
});
