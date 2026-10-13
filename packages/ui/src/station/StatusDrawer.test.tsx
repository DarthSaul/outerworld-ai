import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { stVar } from "../tokens/tokens.js";
import { StatusDrawer, StatusDrawerToggle } from "./StatusDrawer.js";

const radio = [
  {
    id: 1,
    at: "2026-10-01T10:00:05Z",
    who: "Quill",
    color: stVar("room-0"),
    text: "A run finished",
    to: "/comms",
  },
];

function Harness({ onOpenRadio = () => {} }: { readonly onOpenRadio?: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <StatusDrawerToggle
        open={open}
        onToggle={() => setOpen(!open)}
        controls="status"
        live={2}
        alerts={3}
      />
      <StatusDrawer
        id="status"
        open={open}
        onClose={() => setOpen(false)}
        live={2}
        alerts={3}
        radio={radio}
        onOpenRadio={onOpenRadio}
      />
    </>
  );
}

const toggle = () => screen.getByRole("button", { name: /Station status/ });

describe("StatusDrawer", () => {
  it("is hidden by default; its toggle names the counts and shows the alert count", () => {
    render(<Harness />);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAttribute("aria-controls", "status");
    expect(toggle()).toHaveAccessibleName("Station status: 2 tasks live, 3 alerts");
    expect(toggle().querySelector("[data-alert-count]")).toHaveTextContent("3");
    expect(toggle().querySelector("[data-live-dot]")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a dialog with tasks live, alerts, and the radio, and moves focus in", () => {
    render(<Harness />);
    fireEvent.click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Station status" });
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Tasks live").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Alerts").parentElement).toHaveClass("st-blink-border");
    expect(screen.getByRole("region", { name: "Radio chatter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the toggle", () => {
    render(<Harness />);
    toggle().focus();
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it("keeps Tab inside while open", () => {
    render(<Harness />);
    fireEvent.click(toggle());
    const close = screen.getByRole("button", { name: "Close" });
    const line = screen.getByRole("button", { name: /A run finished/ });
    line.focus();
    fireEvent.keyDown(line, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(line).toHaveFocus();
  });

  it("closes, then opens where a radio line points", () => {
    const onOpenRadio = vi.fn();
    render(<Harness onOpenRadio={onOpenRadio} />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: /A run finished/ }));
    expect(onOpenRadio).toHaveBeenCalledWith("/comms");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops the counts from the toggle when there is nothing to report", () => {
    render(
      <StatusDrawerToggle open={false} onToggle={() => {}} controls="s" live={0} alerts={0} />,
    );
    expect(toggle().querySelector("[data-alert-count]")).toBeNull();
    expect(toggle().querySelector("[data-live-dot]")).toBeNull();
  });

  it("has no axe violations, open or closed", async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(toggle());
    expect(await axe(container)).toHaveNoViolations();
  });
});
