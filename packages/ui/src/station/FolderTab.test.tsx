import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { FolderTab } from "./FolderTab.js";

describe("FolderTab", () => {
  it("is a button that unfolds the region it names", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <>
        <FolderTab controls="crew" aria-label="Show the crew column" onClick={onClick}>
          Crew
        </FolderTab>
        <div id="crew" hidden />
      </>,
    );
    const tab = screen.getByRole("button", { name: "Show the crew column" });
    expect(tab).toHaveAttribute("aria-expanded", "false");
    expect(tab).toHaveAttribute("aria-controls", "crew");
    expect(tab).toHaveClass("st-folder-tab");
    fireEvent.click(tab);
    expect(onClick).toHaveBeenCalledOnce();
    expect(await axe(container)).toHaveNoViolations();
  });
});
