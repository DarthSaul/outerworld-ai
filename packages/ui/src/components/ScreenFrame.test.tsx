import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { ScreenFrame } from "./ScreenFrame.js";

describe("ScreenFrame", () => {
  it("renders its children inside the screen and keeps the chin decorative", () => {
    render(
      <ScreenFrame label="Outerworld">
        <main>content</main>
      </ScreenFrame>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("content");
    expect(screen.getByRole("main").closest(".ow-screen")).not.toBeNull();
    expect(document.querySelector(".ow-frame-chin")).toHaveAttribute("aria-hidden", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ScreenFrame label="Outerworld">
        <main>
          <h1>Title</h1>
        </main>
      </ScreenFrame>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
