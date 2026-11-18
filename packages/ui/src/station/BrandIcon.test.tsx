import { ABILITY_BRANDS } from "@darthsaul/outerworld-ai-core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandIcon } from "./BrandIcon.js";

describe("BrandIcon", () => {
  it("draws every brand in the core catalog as a hidden, current-color logo", () => {
    for (const brand of ABILITY_BRANDS) {
      const { container, unmount } = render(<BrandIcon brand={brand} />);
      const svg = container.querySelector("svg") as SVGElement;
      expect(svg, brand).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("data-brand", brand);
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      const path = svg.querySelector("path");
      expect(path).toHaveAttribute("fill", "currentColor");
      expect(path?.getAttribute("d")?.length, brand).toBeGreaterThan(0);
      unmount();
    }
  });
});
