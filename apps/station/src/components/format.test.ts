import { describe, expect, it } from "vitest";
import { formatUsd } from "./format.js";

describe("formatUsd", () => {
  it("shows cents, and four decimals below a cent", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});
