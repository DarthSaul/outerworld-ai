import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { RESIZE_KEY_STEP, ResizeHandle } from "./ResizeHandle.js";

const setup = () => {
  const onResize = vi.fn();
  const onReset = vi.fn();
  const view = render(
    <ResizeHandle
      label="Resize the crew column"
      valueNow={16.67}
      valueMin={10}
      valueMax={16.67}
      onResize={onResize}
      onReset={onReset}
    />,
  );
  const handle = screen.getByRole("separator", { name: "Resize the crew column" });
  return { ...view, handle, onResize, onReset };
};

describe("ResizeHandle", () => {
  it("is a focusable vertical separator with its share of the row", async () => {
    const { handle, container } = setup();
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-valuenow", "17");
    expect(handle).toHaveAttribute("aria-valuemin", "10");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reports pointer movement while dragging, and nothing after release", () => {
    const { handle, onResize } = setup();
    fireEvent.pointerMove(handle, { clientX: 140 });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 130, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 200, pointerId: 1 });
    expect(onResize.mock.calls).toEqual([[30], [-10]]);
  });

  it("moves with the arrow keys and resets on Enter or double-click", () => {
    const { handle, onResize, onReset } = setup();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onResize.mock.calls).toEqual([[RESIZE_KEY_STEP], [-RESIZE_KEY_STEP]]);
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});
