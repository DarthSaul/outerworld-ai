import { describe, expect, it } from "vitest";
import { formatUsd, formatWhen } from "./format.js";

describe("formatUsd", () => {
  it("shows cents, and four decimals below a cent", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("formatWhen", () => {
  it("shows the same instant in the zone it is asked for", () => {
    const iso = "2026-10-01T06:00:00.000Z";
    expect(formatWhen(iso, "Europe/Stockholm")).toMatch(/8:00/);
    expect(formatWhen(iso, "UTC")).toMatch(/6:00/);
  });
});
