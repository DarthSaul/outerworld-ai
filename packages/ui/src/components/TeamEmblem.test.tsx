import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { TeamEmblem } from "./TeamEmblem.js";

describe("TeamEmblem", () => {
  it("renders the disc and the mission mark from one hue", () => {
    render(<TeamEmblem name="Cartography" hue={230} mark="spire" scale={2} />);
    const img = screen.getByRole("img", { name: "Cartography" });
    const hrefs = Array.from(img.querySelectorAll("use")).map((u) => u.getAttribute("href"));
    expect(hrefs).toEqual(["#ow-emblem-disc", "#ow-mark-spire"]);
    expect(img.getAttribute("style")).toContain("--ow-emblem-hue: 230");
    expect(img).toHaveAttribute("viewBox", "0 0 16 16");
    expect(img).toHaveAttribute("width", "32");
  });

  it("omits the mark when it is none", () => {
    render(<TeamEmblem name="X" hue={10} mark="none" scale={2} />);
    expect(screen.getByRole("img").querySelectorAll("use")).toHaveLength(1);
  });

  it("renders at 1×, 2×, or 4× only", () => {
    expect(() => render(<TeamEmblem name="X" hue={10} mark="none" scale={3 as 2} />)).toThrow(
      /1, 2, or 4/,
    );
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <TeamEmblem name="Cartography" hue={230} mark="forge" scale={4} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
