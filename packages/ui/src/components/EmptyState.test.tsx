import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { EmptyState } from "./EmptyState.js";

describe("EmptyState", () => {
  it("is a status region with a title and one sentence of consequence", () => {
    render(
      <EmptyState
        title="No handoffs"
        body="Teams can't read each other's ledgers until a handoff is opened."
      />,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("No handoffs");
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("No handoffs");
  });

  it("renders an optional single action", () => {
    render(<EmptyState title="t" body="b" action={<button type="button">Open handoff</button>} />);
    expect(screen.getByRole("button", { name: "Open handoff" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <EmptyState title="No runs yet" body="The first run hasn't happened." />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
