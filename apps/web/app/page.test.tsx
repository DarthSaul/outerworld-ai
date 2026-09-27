import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the scaffold heading and both badges", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Scaffold");
    expect(screen.getByText("notion")).toBeInTheDocument();
    expect(screen.getByText("ledger")).toBeInTheDocument();
  });
});
