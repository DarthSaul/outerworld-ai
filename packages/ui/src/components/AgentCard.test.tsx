import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { AgentCard } from "./AgentCard.js";

const props = {
  id: "planner",
  name: "Planner",
  mandate: "Turn every project's ledger into one prioritized next-step list.",
  rig: { tintHue: 230, trimHue: 250, head: "dome", trace: "core" },
  derived: { shoulder: "ball", accessory: "antenna" },
} as const;

describe("AgentCard", () => {
  it("is a button named after the agent, showing name, mandate, and the rig at 1×", () => {
    render(<AgentCard {...props} state="idle" onSelect={() => {}} />);
    const card = screen.getByRole("button", { name: /Planner/ });
    expect(card).toHaveAttribute("data-state", "idle");
    expect(screen.getByText(props.mandate)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Planner, idle" })).toHaveAttribute("width", "24");
  });

  it("calls onSelect with the agent id", async () => {
    const onSelect = vi.fn();
    render(<AgentCard {...props} state="idle" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("planner");
  });

  it("shows the plain run word next to the figure", () => {
    render(<AgentCard {...props} state="working" onSelect={() => {}} />);
    expect(screen.getByText("working")).toBeInTheDocument();
  });

  it("shows a note in place of the run word when there is one", () => {
    render(
      <AgentCard {...props} state="working" note="waiting for your approval" onSelect={() => {}} />,
    );
    expect(screen.getByText("waiting for your approval")).toBeInTheDocument();
    expect(screen.queryByText("working")).not.toBeInTheDocument();
  });

  it("marks selected and dimmed", () => {
    render(<AgentCard {...props} state="done" selected dimmed onSelect={() => {}} />);
    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveAttribute("data-dimmed", "true");
  });

  it("has no axe violations", async () => {
    const { container } = render(<AgentCard {...props} state="failed" onSelect={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
