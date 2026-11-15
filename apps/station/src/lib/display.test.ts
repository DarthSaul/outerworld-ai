import { afterEach, describe, expect, it } from "vitest";
import { applyDisplay, DISPLAY_SIZES, readDisplay } from "./display.js";

describe("display size", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-display");
  });

  it("offers auto, then four fixed sizes from small to large", () => {
    expect(DISPLAY_SIZES).toEqual(["auto", "compact", "standard", "large", "x-large"]);
  });

  it("reads the stored size, falling back to auto for nothing or a stray value", () => {
    expect(readDisplay()).toBe("auto");
    localStorage.setItem("outerworld.display", "large");
    expect(readDisplay()).toBe("large");
    localStorage.setItem("outerworld.display", "huge");
    expect(readDisplay()).toBe("auto");
  });

  it("sets data-display on the root, and auto removes it", () => {
    applyDisplay("compact");
    expect(document.documentElement.getAttribute("data-display")).toBe("compact");
    applyDisplay("auto");
    expect(document.documentElement.hasAttribute("data-display")).toBe(false);
  });
});
