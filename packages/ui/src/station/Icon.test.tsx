import { ITEM_ICONS } from "@darthsaul/outerworld-ai-core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICON_EMOJI, ICONS, Icon } from "./Icon.js";

describe("Icon", () => {
  it("draws every icon in the core catalog as a hidden emoji in the emoji font", () => {
    for (const icon of ITEM_ICONS) {
      const { container, unmount } = render(<Icon name={icon} />);
      const glyph = container.querySelector(`[data-icon="${icon}"]`) as HTMLElement;
      expect(glyph, icon).toHaveAttribute("aria-hidden", "true");
      expect(glyph.textContent, icon).toBe(ICON_EMOJI[icon]);
      expect(glyph.textContent, icon).toMatch(/\p{Extended_Pictographic}/u);
      expect(glyph).toHaveClass("font-emoji");
      expect(container.querySelector("svg")).toBeNull();
      unmount();
    }
  });

  it("covers the catalog and the menu, Settings as the standard gear", () => {
    expect(ICONS).toEqual(expect.arrayContaining([...ITEM_ICONS, "gear", "bolt"]));
    expect(ICON_EMOJI.gear).toBe("⚙️");
    const gear = render(<Icon name="gear" size="lg" />).container.firstElementChild;
    expect(gear).toHaveClass("text-b22");
  });
});
