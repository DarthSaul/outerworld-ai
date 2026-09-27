import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Badge } from "./Badge.js";

describe("Badge", () => {
  it("renders the tool name with the mode glyph and an accessible mode label", () => {
    render(<Badge mode="read">notion</Badge>);
    const chip = screen.getByText("notion").closest("span[data-mode]");
    expect(chip).toHaveAttribute("data-mode", "read");
    expect(chip).toHaveTextContent("R");
    expect(screen.getByText("read")).toHaveClass("sr-only");
  });

  it("switches chip tokens by mode", () => {
    const { rerender } = render(<Badge mode="read">x</Badge>);
    expect(screen.getByText("x").closest("span[data-mode]")).toHaveClass("bg-chip-read");
    rerender(<Badge mode="write">x</Badge>);
    expect(screen.getByText("x").closest("span[data-mode]")).toHaveClass("bg-chip-write");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Badge mode="write">docs</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
