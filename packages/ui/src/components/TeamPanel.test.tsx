import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { TeamPanel, type TeamPanelProps } from "./TeamPanel.js";

const rig = { tintHue: 230, trimHue: 250, head: "dome", trace: "core" } as const;
const derived = { shoulder: "ball", accessory: "none" } as const;

const props = (): TeamPanelProps => ({
  id: "project-management",
  name: "Project Management",
  mission: "Keep every project's next step written down",
  emblem: { hue: 230, mark: "dome" },
  health: "ok",
  healthLabel: "healthy",
  run: "working",
  lastRunLabel: "14:02",
  grants: [
    { id: "pm-notion-read", mode: "read", label: "notion" },
    { id: "pm-ledger-write", mode: "write", label: "ledger" },
  ],
  agents: [
    { id: "planner", name: "Planner", mandate: "Prioritize.", rig, derived, state: "working" },
    { id: "scribe", name: "Scribe", mandate: "Sync.", rig, derived, state: "idle" },
  ],
  onSelect: vi.fn(),
});

describe("TeamPanel", () => {
  it("shows emblem, name, mission, and the health square in the header", () => {
    render(<TeamPanel {...props()} />);
    const header = screen.getByRole("button", { name: /Project Management/ });
    expect(within(header).getByRole("img", { name: "Project Management" })).toHaveAttribute(
      "width",
      "32",
    );
    expect(header).toHaveTextContent("Keep every project's next step written down");
    expect(within(header).getByText("healthy")).toBeInTheDocument();
    expect(header.querySelector("[data-health]")).toHaveAttribute("data-health", "ok");
  });

  it("selects the team from the header and agents or grants from their controls", async () => {
    const p = props();
    render(<TeamPanel {...p} />);
    await userEvent.click(screen.getByRole("button", { name: /Project Management/ }));
    expect(p.onSelect).toHaveBeenLastCalledWith({ kind: "team", id: "project-management" });
    await userEvent.click(screen.getByRole("button", { name: /Scribe/ }));
    expect(p.onSelect).toHaveBeenLastCalledWith({ kind: "agent", id: "scribe" });
    await userEvent.click(screen.getByRole("button", { name: /notion/i }));
    expect(p.onSelect).toHaveBeenLastCalledWith({ kind: "grant", id: "pm-notion-read" });
  });

  it("marks the selected child and dims the panel when asked", () => {
    render(<TeamPanel {...props()} selection={{ kind: "agent", id: "scribe" }} dimmed />);
    expect(screen.getByRole("button", { name: /Scribe/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Planner/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("group")).toHaveAttribute("data-dimmed", "true");
  });

  it("marks the panel itself selected when the team is the selection", () => {
    render(<TeamPanel {...props()} selection={{ kind: "team", id: "project-management" }} />);
    expect(screen.getByRole("button", { name: /Project Management/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("collapses to the header row only", () => {
    render(<TeamPanel {...props()} collapsed />);
    expect(screen.queryByRole("button", { name: /Scribe/ })).toBeNull();
    expect(screen.queryByText("Notion")).toBeNull();
    expect(screen.getByRole("button", { name: /Project Management/ })).toBeInTheDocument();
  });

  it("exposes health and run state as data attributes on the group", () => {
    render(<TeamPanel {...props()} health="stalled" run="failed" />);
    const group = screen.getByRole("group");
    expect(group).toHaveAttribute("data-health", "stalled");
    expect(group).toHaveAttribute("data-run", "failed");
  });

  it("has no axe violations", async () => {
    const { container } = render(<TeamPanel {...props()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
