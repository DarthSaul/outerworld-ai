import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Tag } from "./Tag.js";

describe("Tag", () => {
  it("pads the label on every side, in its tone, uppercase by default", async () => {
    const { container } = render(
      <Tag tone="amber" data-flag="full-power">
        Full power
      </Tag>,
    );
    const tag = screen.getByText("Full power");
    expect(tag).toHaveAttribute("data-flag", "full-power");
    expect(tag.className).toMatch(/\bpx-1\.5\b/);
    expect(tag.className).toMatch(/\bpy-0\.75\b/);
    expect(tag.className).toMatch(/\bborder-amber text-amber\b/);
    expect(tag.className).toMatch(/\buppercase\b/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("steps up a size, with more padding, at size md", () => {
    render(<Tag size="md">anthropic/claude-sonnet-5.5</Tag>);
    const tag = screen.getByText("anthropic/claude-sonnet-5.5");
    expect(tag.className).toMatch(/\bpx-2 py-1 text-d7\b/);
    expect(tag.className).not.toMatch(/\btext-d6\b/);
  });

  it("keeps a value's own case when caps is off", () => {
    render(<Tag caps={false}>anthropic/claude-sonnet-5.5</Tag>);
    const tag = screen.getByText("anthropic/claude-sonnet-5.5");
    expect(tag.className).not.toMatch(/\buppercase\b/);
    expect(tag.className).toMatch(/\bborder-line text-fg-mute\b/);
  });
});
