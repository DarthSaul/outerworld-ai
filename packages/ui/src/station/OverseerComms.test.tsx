import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { STATION_MS } from "../tokens/tokens.js";
import { type CommsMessage, OverseerComms } from "./OverseerComms.js";

const chatter: CommsMessage = { key: "c0", speaker: "Overseer", text: "Quiet.", kind: "chatter" };
const approval: CommsMessage = {
  key: "consent:1",
  speaker: "Quill · Operations",
  text: "Quill wants to use write_file. Approve?",
  kind: "approval",
};

const typed = (container: HTMLElement) =>
  container.querySelector("p > span[aria-hidden]")?.textContent ?? "";

describe("OverseerComms", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("types the message one character per tick, reading the whole text to screen readers", () => {
    const { container } = render(<OverseerComms message={chatter} />);
    expect(typed(container)).toBe("");
    expect(screen.getByText("Quiet.", { selector: ".sr-only" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STATION_MS["type-tick"] * 3));
    expect(typed(container)).toBe("Qui");
    act(() => vi.advanceTimersByTime(STATION_MS["type-tick"] * 10));
    expect(typed(container)).toBe("Quiet.");
  });

  it("restarts typing when the message changes", () => {
    const { container, rerender } = render(<OverseerComms message={chatter} />);
    act(() => vi.advanceTimersByTime(STATION_MS["type-tick"] * 10));
    rerender(<OverseerComms message={{ ...chatter, key: "c1", text: "Next line." }} />);
    act(() => vi.advanceTimersByTime(STATION_MS["type-tick"] * 2));
    expect(typed(container)).toBe("Ne");
  });

  it("moves chatter on by itself after the hold, but never an approval", () => {
    const onNext = vi.fn();
    const { rerender } = render(<OverseerComms message={chatter} onNext={onNext} />);
    act(() => vi.advanceTimersByTime(STATION_MS["type-tick"] * 7));
    act(() => vi.advanceTimersByTime(STATION_MS["chatter-hold"]));
    expect(onNext).toHaveBeenCalledTimes(1);
    rerender(<OverseerComms message={approval} onNext={onNext} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("offers (A) approve and (B) deny for an approval, Next otherwise", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <OverseerComms message={approval} onApprove={onApprove} onDeny={onDeny} onNext={onNext} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect([onApprove.mock.calls.length, onDeny.mock.calls.length]).toEqual([1, 1]);
    rerender(<OverseerComms message={chatter} onNext={onNext} />);
    fireEvent.click(screen.getByRole("button", { name: "Next ▶" }));
    expect(onNext).toHaveBeenCalled();
  });

  it("sends an order on Enter and clears the line; ignores an empty one", () => {
    const onOrder = vi.fn();
    render(<OverseerComms message={chatter} onOrder={onOrder} />);
    const input = screen.getByRole("textbox", { name: "Give the Overseer an order…" });
    fireEvent.submit(input);
    expect(onOrder).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  Research note apps  " } });
    fireEvent.submit(input);
    expect(onOrder).toHaveBeenCalledWith("Research note apps");
    expect(input).toHaveValue("");
  });

  it("shows the Overseer's sprite in the portrait slot", () => {
    const { container } = render(<OverseerComms message={chatter} overseerLook={3} />);
    expect(screen.getByRole("img", { name: "Overseer portrait" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(0);
  });

  it("has no axe violations", async () => {
    vi.useRealTimers();
    const { container } = render(<OverseerComms message={approval} overseerLook={3} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
