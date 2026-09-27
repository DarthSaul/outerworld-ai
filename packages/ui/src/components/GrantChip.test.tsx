import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { GrantChip } from "./GrantChip.js";

describe("GrantChip", () => {
  it("leads with the mode glyph and names the mode for assistive tech", () => {
    render(<GrantChip mode="read" label="notion" />);
    const chip = screen.getByText("notion").closest("[data-mode]");
    expect(chip).toHaveAttribute("data-mode", "read");
    expect(chip).toHaveTextContent(/^R/);
    expect(screen.getByText("read")).toHaveClass("sr-only");
  });

  it("is a static span by default and a button when it can be selected", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<GrantChip mode="write" label="ledger" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<GrantChip mode="write" label="ledger" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /ledger/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("exposes in-use, revoked, and selected as data attributes and aria-pressed", () => {
    render(<GrantChip mode="read" label="git" inUse revoked selected onSelect={() => {}} />);
    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("data-in-use", "true");
    expect(chip).toHaveAttribute("data-revoked", "true");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("has no axe violations in either form", async () => {
    const { container } = render(
      <>
        <GrantChip mode="read" label="notion" />
        <GrantChip mode="write" label="ledger" onSelect={() => {}} />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
