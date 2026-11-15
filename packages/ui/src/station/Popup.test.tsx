import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Popup } from "./Popup.js";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Expand
      </button>
      {open ? (
        <Popup
          title="Report"
          meta="just now"
          onClose={() => setOpen(false)}
          actions={<a href="/somewhere">Open</a>}
        >
          <p>Long text.</p>
        </Popup>
      ) : null}
    </>
  );
}

describe("Popup", () => {
  it("opens as a labelled modal dialog with focus on Close, and returns focus when closed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Expand" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Report" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(dialog).toHaveTextContent("just now");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("closes on Escape, keeps Tab inside, and scrolls a tall body", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Expand" }));
    const dialog = screen.getByRole("dialog", { name: "Report" });
    expect(dialog.querySelector("[data-popup-body]")?.className).toMatch(/overflow-y-auto/);
    await user.tab();
    expect(screen.getByRole("link", { name: "Open" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no axe violations", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Expand" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
