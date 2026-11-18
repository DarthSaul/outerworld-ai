import { ITEM_ICONS } from "@darthsaul/outerworld-ai-core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PIXEL_ICONS, PixelIcon } from "./PixelIcon.js";

describe("PixelIcon", () => {
  it("draws every icon in the core catalog as hidden, current-color pixels", () => {
    for (const icon of ITEM_ICONS) {
      const { container, unmount } = render(<PixelIcon name={icon} />);
      const svg = container.querySelector("svg") as SVGElement;
      expect(svg, icon).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("data-icon", icon);
      const path = svg.querySelector("path");
      expect(path).toHaveAttribute("fill", "currentColor");
      expect(path?.getAttribute("d")?.length, icon).toBeGreaterThan(0);
      unmount();
    }
  });

  it("covers the catalog and the menu glyphs, each on its own square grid", () => {
    expect(PIXEL_ICONS).toEqual(expect.arrayContaining([...ITEM_ICONS, "gear", "sliders", "bolt"]));
    const gear = render(<PixelIcon name="gear" size="lg" />).container.querySelector("svg");
    expect(gear).toHaveAttribute("viewBox", "0 0 9 9");
    expect(gear).toHaveClass("size-5");
    const web = render(<PixelIcon name="web" />).container.querySelector("svg");
    expect(web).toHaveAttribute("viewBox", "0 0 8 8");
    expect(web).toHaveClass("size-4");
  });
});
