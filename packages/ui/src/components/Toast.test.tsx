import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { Toast, ToastRegion } from "./Toast.js";

describe("Toast", () => {
  it("region is polite live text; a toast has a message and a dismiss control", async () => {
    const onDismiss = vi.fn();
    render(
      <ToastRegion>
        <Toast id="t1" message="Digest posted" onDismiss={onDismiss} />
      </ToastRegion>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Digest posted")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith("t1");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <ToastRegion>
        <Toast id="t" message="Run finished" onDismiss={() => {}} />
      </ToastRegion>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
