import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GRANT_MODES,
  glowToken,
  HEALTH_STATES,
  RUN_STATES,
  THEMED_TOKENS,
  tokenVar,
} from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "tokens.css"), "utf8");

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

describe("token helpers", () => {
  it("builds a var() reference", () => {
    expect(tokenVar("ink-1")).toBe("var(--ow-ink-1)");
  });

  it("names the glow token for a state", () => {
    expect(glowToken("working")).toBe("--ow-rig-glow-working");
  });
});
