import { describe, expect, it } from "vitest";
import { formatAgo, formatUsd, formatWhen } from "./format.js";

describe("formatAgo", () => {
  const now = Date.parse("2026-10-01T12:00:00.000Z");
  it("counts minutes, hours, and days, then gives the date", () => {
    expect(formatAgo("2026-10-01T11:59:30.000Z", now)).toBe("just now");
    expect(formatAgo("2026-10-01T11:55:00.000Z", now)).toBe("5m ago");
    expect(formatAgo("2026-10-01T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatAgo("2026-09-29T12:00:00.000Z", now)).toBe("2d ago");
    expect(formatAgo("2026-09-01T12:00:00.000Z", now)).toMatch(/2026/);
  });

  it("says nothing for a date it cannot read, and never counts into the future", () => {
    expect(formatAgo("nope", now)).toBe("");
    expect(formatAgo("2026-10-01T12:30:00.000Z", now)).toBe("just now");
  });
});

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
