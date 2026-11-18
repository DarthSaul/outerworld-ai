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

  it("reports movement from where the drag began, and nothing after release", () => {
    const { handle, onResize } = setup();
    fireEvent.pointerMove(handle, { clientX: 140 });
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 130, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 200, pointerId: 1 });
    expect(onResize.mock.calls).toEqual([[30], [20]]);
  });

  it("ends a drag released anywhere: off the handle, on blur, or a move with the button up", () => {
    const onResizeStart = vi.fn();
    const onResize = vi.fn();
    render(
      <>
        <ResizeHandle
          label="Resize"
          valueNow={25}
          valueMin={10}
          valueMax={40}
          onResizeStart={onResizeStart}
          onResize={onResize}
        />
        <p>elsewhere</p>
      </>,
    );
    const handle = screen.getByRole("separator", { name: "Resize" });
    const elsewhere = screen.getByText("elsewhere");
    // Released over another element: the window hears it.
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    expect(onResizeStart).toHaveBeenCalledTimes(1);
    expect(handle).toHaveAttribute("data-dragging");
    fireEvent.pointerMove(elsewhere, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(elsewhere, { pointerId: 1 });
    expect(handle).not.toHaveAttribute("data-dragging");
    fireEvent.pointerMove(elsewhere, { clientX: 400, pointerId: 1 });
    expect(onResize.mock.calls).toEqual([[50]]);
    // The window loses focus mid-drag.
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.blur(window);
    fireEvent.pointerMove(elsewhere, { clientX: 300, pointerId: 1 });
    // A mouse move with no button held: the release happened where the page could not hear it.
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(elsewhere, {
      clientX: 300,
      pointerId: 1,
      pointerType: "mouse",
      buttons: 0,
    });
    fireEvent.pointerMove(elsewhere, { clientX: 320, pointerId: 1 });
    expect(onResize.mock.calls).toEqual([[50]]);
    expect(handle).not.toHaveAttribute("data-dragging");
  });

  it("stops listening when unmounted mid-drag", () => {
    const { handle, onResize, unmount } = setup();
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    unmount();
    fireEvent.pointerMove(window, { clientX: 300, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("follows only the pointer that started the drag", () => {
    const { handle, onResize } = setup();
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 300, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 320, pointerId: 2 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 110, pointerId: 1 });
    expect(onResize.mock.calls).toEqual([[10]]);
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
