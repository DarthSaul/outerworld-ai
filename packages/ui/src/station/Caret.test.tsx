import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaretButton } from "./Caret.js";

describe("CaretButton", () => {
  it("draws its caret pointing the given way, upright, and acts as a named button", () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <CaretButton direction="left" aria-label="Hide the crew column" onClick={onClick} />,
    );
    const button = screen.getByRole("button", { name: "Hide the crew column" });
    const svg = () => container.querySelector("svg");
    expect(svg()).toHaveAttribute("data-caret-direction", "left");
    expect(svg()).toHaveAttribute("viewBox", "0 0 3 5");
    expect(svg()?.getAttribute("class")).not.toMatch(/rotate/);
    expect(button.className).toMatch(/items-center/);
    expect(button.className).toMatch(/content-center/);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<CaretButton direction="down" aria-label="Hide the scanner" />);
    expect(svg()).toHaveAttribute("viewBox", "0 0 5 3");
  });
});
