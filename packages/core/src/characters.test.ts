import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_COUNT,
  CHARACTERS,
  characterGrid,
  gridRuns,
  lookFor,
  OUTLINE,
  SPRITE_H,
  SPRITE_W,
  shade,
} from "./characters.js";

const here = dirname(fileURLToPath(import.meta.url));
const spriteDir = join(here, "../../../docs/design/station-dashboard/sprites");
const index = JSON.parse(readFileSync(join(spriteDir, "characters.json"), "utf8")) as {
  characters: { index: number; id: string; name: string; role: string; file1x: string }[];
};

/** Decodes an 8-bit RGBA, non-interlaced PNG (what the design export is) to hex-or-null cells. */
function decodePng(buf: Buffer): (string | null)[][] {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect([buf[24], buf[25], buf[28]]).toEqual([8, 6, 0]);
  const idat: Buffer[] = [];
  let at = 8;
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0;
      const a = i >= 4 ? (px[y * stride + i - 4] ?? 0) : 0;
      const b = y > 0 ? (px[(y - 1) * stride + i] ?? 0) : 0;
      const c = y > 0 && i >= 4 ? (px[(y - 1) * stride + i - 4] ?? 0) : 0;
      let v = x;
      if (filter === 1) v = x + a;
      if (filter === 2) v = x + b;
      if (filter === 3) v = x + ((a + b) >> 1);
      if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + i] = v & 255;
    }
  }
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const o = y * stride + x * 4;
      if ((px[o + 3] ?? 0) === 0) return null;
      return `#${[px[o], px[o + 1], px[o + 2]].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
    }),
  );
}

describe("characters", () => {
  it("has the 24 characters of the design, in export order", () => {
    expect(CHARACTER_COUNT).toBe(24);
    expect(CHARACTERS.map((c) => c.id)).toEqual(index.characters.map((c) => c.id));
    expect(CHARACTERS.map((c) => [c.name, c.role])).toEqual(
      index.characters.map((c) => [c.name, c.role]),
    );
  });

  it.each(CHARACTERS.map((c, i) => [c.id, i] as const))(
    "draws %s pixel for pixel as the exported 1x PNG",
    (_id, i) => {
      const file = index.characters[i]?.file1x ?? "";
      const png = decodePng(readFileSync(join(spriteDir, "..", file)));
      const character = CHARACTERS[i];
      if (!character) throw new Error(`no character ${i}`);
      expect(characterGrid(character)).toEqual(png);
    },
  );

  it("draws on a 20×26 grid with an outline around the silhouette", () => {
    const [first] = CHARACTERS;
    if (!first) throw new Error("no characters");
    const grid = characterGrid(first);
    expect(grid).toHaveLength(SPRITE_H);
    for (const row of grid) expect(row).toHaveLength(SPRITE_W);
    expect(grid.flat()).toContain(OUTLINE);
  });

  it("shades and clamps hex colors", () => {
    expect(shade("#808080", 0.5)).toBe("#404040");
    expect(shade("#f0f0f0", 2)).toBe("#ffffff");
  });

  it("collapses a grid into horizontal runs that cover every filled cell once", () => {
    for (const character of CHARACTERS) {
      const grid = characterGrid(character);
      const runs = gridRuns(grid);
      const covered = runs.reduce((n, r) => n + r.w, 0);
      expect(covered).toBe(grid.flat().filter(Boolean).length);
      for (const r of runs) {
        for (let x = r.x; x < r.x + r.w; x++) expect(grid[r.y]?.[x]).toBe(r.color);
      }
    }
  });
});

describe("lookFor", () => {
  it("uses a valid stored look", () => {
    expect(lookFor("wren", 5)).toBe(5);
  });

  it.each([undefined, -1, 24, 2.5])("falls back to a stable look from the id for %s", (look) => {
    const fallback = lookFor("wren", look);
    expect(fallback).toBe(lookFor("wren", undefined));
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(fallback).toBeLessThan(CHARACTER_COUNT);
  });

  it("spreads different ids over different looks", () => {
    const looks = new Set(
      ["vesper", "quill", "wren", "atlas", "nova"].map((id) => lookFor(id, undefined)),
    );
    expect(looks.size).toBeGreaterThan(1);
  });
});
