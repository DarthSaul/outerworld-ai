import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { PanelTabs } from "./PanelTabs.js";

function Harness() {
  const [active, setActive] = useState("one");
  const [count, setCount] = useState(0);
  return (
    <PanelTabs
      label="Comms"
      active={active}
      onChange={setActive}
      tabs={[
        { id: "one", label: "Overseer comms", content: <p>Overseer here</p> },
        {
          id: "two",
          label: "Crew comms",
          content: (
            <button type="button" onClick={() => setCount(count + 1)}>
              Pressed {count}
            </button>
          ),
        },
      ]}
    />
  );
}

describe("PanelTabs", () => {
  it("names the region by the active tab and marks it selected", async () => {
    const { container } = render(<Harness />);
    expect(screen.getByRole("region", { name: "Overseer comms" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1]);
    expect(tabs[0]?.className).toMatch(/bg-cyan/);
    expect(tabs[1]?.className).not.toMatch(/bg-cyan /);
    expect(screen.getByRole("tabpanel", { name: "Overseer comms" })).toHaveTextContent(
      "Overseer here",
    );
    expect(screen.getByRole("tablist", { name: "Comms" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("switches on click and keeps the other tab's state while hidden", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Crew comms" }));
    expect(screen.getByRole("region", { name: "Crew comms" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pressed 0" }));
    fireEvent.click(screen.getByRole("tab", { name: "Overseer comms" }));
    expect(screen.queryByRole("button", { name: /Pressed/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Crew comms" }));
    expect(screen.getByRole("button", { name: "Pressed 1" })).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys, Home and End, wrapping around", () => {
    render(<Harness />);
    const [one, two] = screen.getAllByRole("tab") as [HTMLElement, HTMLElement];
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(two).toHaveFocus();
    expect(two).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(two, { key: "ArrowRight" });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: "ArrowLeft" });
    expect(two).toHaveFocus();
    fireEvent.keyDown(two, { key: "Home" });
    expect(one).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(one, { key: "End" });
    expect(two).toHaveAttribute("aria-selected", "true");
  });
});
