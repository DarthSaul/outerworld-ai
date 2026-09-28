import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { OverseerCore } from "./OverseerCore.js";

describe("OverseerCore", () => {
  it("is a button named after the overseer, holding the hero rig at 2×", () => {
    render(
      <OverseerCore
        name="Ultron"
        roleNoun="Overseer"
        stateLabel="idle"
        state="reconciling"
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /Ultron/ });
    expect(btn).toHaveAttribute("data-state", "reconciling");
    expect(screen.getByRole("img", { name: "Ultron, reconciling" })).toHaveAttribute("width", "96");
    expect(btn).toHaveTextContent("Overseer");
  });

  it("selects the overseer", async () => {
    const onSelect = vi.fn();
    render(
      <OverseerCore
        name="M"
        roleNoun="Overseer"
        stateLabel="idle"
        state="idle"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "overseer", id: "overseer" });
  });

  it("shows the last outward post time when reported and the attention count when in attention", () => {
    const { rerender } = render(
      <OverseerCore
        name="M"
        roleNoun="Overseer"
        stateLabel="idle"
        state="reported"
        lastPostLabel="14:03"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/14:03/)).toBeInTheDocument();
    rerender(
      <OverseerCore
        name="M"
        roleNoun="Overseer"
        stateLabel="idle"
        state="attention"
        attentionCount={2}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/2 need attention/)).toBeInTheDocument();
  });

  it("marks selected", () => {
    render(
      <OverseerCore
        name="M"
        roleNoun="Overseer"
        stateLabel="idle"
        state="idle"
        selected
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <OverseerCore
        name="Ultron"
        roleNoun="Overseer"
        stateLabel="idle"
        state="attention"
        attentionCount={1}
        onSelect={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
