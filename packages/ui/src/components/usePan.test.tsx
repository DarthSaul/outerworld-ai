import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DRAG_THRESHOLD_PX, usePan } from "./usePan.js";

function Surface({
  onChildClick,
  onTap,
}: {
  readonly onChildClick: () => void;
  readonly onTap?: (target: EventTarget | null) => void;
}) {
  const pan = usePan(undefined, { onTap: (e) => onTap?.(e.target) });
  return (
    <div data-testid="surface" data-dragging={pan.dragging ? "true" : "false"} {...pan.handlers}>
      <output data-testid="offset">{`${pan.offset.x},${pan.offset.y}`}</output>
      <button type="button" onClick={onChildClick}>
        child
      </button>
    </div>
  );
}

const pointer = (
  type: string,
  el: Element,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) =>
  fireEvent(
    el,
    new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1,
      bubbles: true,
      ...extra,
    }),
  );

function mount() {
  const onChildClick = vi.fn();
  const onTap = vi.fn();
  render(<Surface onChildClick={onChildClick} onTap={onTap} />);
  const surface = screen.getByTestId("surface");
  surface.setPointerCapture = vi.fn();
  surface.releasePointerCapture = vi.fn();
  surface.hasPointerCapture = vi.fn(() => true);
  return { onChildClick, onTap, surface, offset: () => screen.getByTestId("offset").textContent };
}

describe("usePan", () => {
  it("does not pan under the drag threshold and leaves the click to its target", () => {
    const { surface, offset, onChildClick } = mount();
    pointer("pointerdown", surface, 10, 10);
    pointer("pointermove", surface, 10 + DRAG_THRESHOLD_PX - 1, 10);
    pointer("pointerup", surface, 10 + DRAG_THRESHOLD_PX - 1, 10, { buttons: 0 });
    expect(offset()).toBe("0,0");
    fireEvent.click(screen.getByRole("button", { name: "child" }));
    expect(onChildClick).toHaveBeenCalledTimes(1);
  });

  it("reports a tap with its target when the press never became a drag", () => {
    const { surface, onTap } = mount();
    pointer("pointerdown", surface, 10, 10);
    pointer("pointerup", surface, 11, 10, { buttons: 0 });
    expect(onTap).toHaveBeenCalledWith(surface);
    const child = screen.getByRole("button", { name: "child" });
    pointer("pointerdown", child, 10, 10);
    pointer("pointerup", child, 10, 10, { buttons: 0 });
    expect(onTap).toHaveBeenLastCalledWith(child);
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("pans past the threshold and suppresses exactly the click that ends the drag", () => {
    const { surface, offset, onChildClick, onTap } = mount();
    pointer("pointerdown", surface, 10, 10);
    pointer("pointermove", surface, 50, 30);
    expect(surface).toHaveAttribute("data-dragging", "true");
    expect(surface.setPointerCapture).toHaveBeenCalledWith(1);
    pointer("pointerup", surface, 50, 30, { buttons: 0 });
    expect(offset()).toBe("40,20");
    expect(surface).toHaveAttribute("data-dragging", "false");
    expect(onTap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "child" }));
    expect(onChildClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "child" }));
    expect(onChildClick).toHaveBeenCalledTimes(1);
  });

  it("continues from the previous offset on the next drag", () => {
    const { surface, offset } = mount();
    pointer("pointerdown", surface, 0, 0);
    pointer("pointermove", surface, 20, 0);
    pointer("pointerup", surface, 20, 0, { buttons: 0 });
    pointer("pointerdown", surface, 0, 0);
    pointer("pointermove", surface, 0, 20);
    pointer("pointerup", surface, 0, 20, { buttons: 0 });
    expect(offset()).toBe("20,20");
  });

  it("ignores buttons other than the primary one", () => {
    const { surface, offset } = mount();
    pointer("pointerdown", surface, 0, 0, { button: 2, buttons: 2 });
    pointer("pointermove", surface, 50, 50, { buttons: 2 });
    expect(offset()).toBe("0,0");
  });

  it("drops a stale press: a move with no button held never starts a drag", () => {
    const { surface, offset } = mount();
    pointer("pointerdown", surface, 0, 0);
    // The button was released outside the surface; the next hover move carries buttons: 0.
    pointer("pointermove", surface, 80, 80, { buttons: 0 });
    expect(offset()).toBe("0,0");
    expect(surface).toHaveAttribute("data-dragging", "false");
    pointer("pointermove", surface, 90, 90, { buttons: 0 });
    expect(offset()).toBe("0,0");
  });

  it("ends a drag on pointercancel and on lost capture", () => {
    const { surface } = mount();
    pointer("pointerdown", surface, 0, 0);
    pointer("pointermove", surface, 30, 0);
    pointer("pointercancel", surface, 30, 0);
    expect(surface).toHaveAttribute("data-dragging", "false");
    pointer("pointerdown", surface, 0, 0);
    pointer("pointermove", surface, 30, 0);
    pointer("lostpointercapture", surface, 30, 0);
    expect(surface).toHaveAttribute("data-dragging", "false");
  });
});
