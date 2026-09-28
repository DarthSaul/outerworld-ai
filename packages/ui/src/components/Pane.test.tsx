import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Pane } from "./Pane.js";

describe("Pane", () => {
  it("is a region named by its menu bar title, with optional menu items", () => {
    render(
      <Pane title="Map" menu={<span>as of 14:03</span>}>
        <p>body</p>
      </Pane>,
    );
    const region = screen.getByRole("region", { name: "Map" });
    expect(region).toHaveTextContent("body");
    expect(region.querySelector("header")).toHaveTextContent("as of 14:03");
  });

  it("marks the void variant so the map column carries the dark palette", () => {
    render(
      <Pane title="Map" void>
        <p>x</p>
      </Pane>,
    );
    expect(screen.getByRole("region", { name: "Map" })).toHaveAttribute("data-pane", "void");
    expect(screen.getByRole("region", { name: "Map" })).toHaveClass("ow-void");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Pane title="Report">
        <p>x</p>
      </Pane>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
