import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the station name, the source and as-of, and the map from the fixture", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Demo Station");
    expect(screen.getByText(/demo fixture/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-09-27T14:03:00Z/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Project Management" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Meridian/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run digest/i })).toBeInTheDocument();
  });

  it("shows the report panel with an empty state until something is selected", () => {
    render(<HomePage />);
    expect(within(screen.getByRole("complementary")).getByRole("status")).toBeInTheDocument();
  });
});
