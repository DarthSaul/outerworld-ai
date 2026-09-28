import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { GrantChip } from "./GrantChip.js";

describe("GrantChip", () => {
  it("shows the capitalized tool name over the written-out mode", () => {
    render(<GrantChip mode="read" label="notion" />);
    const chip = screen.getByText("Notion").closest("[data-mode]");
    expect(chip).toHaveAttribute("data-mode", "read");
    expect(chip?.querySelector("[data-chip-name]")).toHaveTextContent("Notion");
    expect(chip?.querySelector("[data-chip-mode]")).toHaveTextContent("read");
    expect(chip).toHaveTextContent(/^Notion/);
  });

  it("leaves labels that already start with a capital or carry a count alone", () => {
    render(<GrantChip mode="write" label="Ledger ×3" />);
    expect(screen.getByText("Ledger ×3")).toBeInTheDocument();
  });

  it("is a static span by default and a button when it can be selected", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<GrantChip mode="write" label="ledger" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<GrantChip mode="write" label="ledger" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /ledger/i }));
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
