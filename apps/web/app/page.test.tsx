import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomePage from "./page";

const original = process.env.OUTERWORLD_LEDGER_PATH;
afterEach(() => {
  if (original === undefined) delete process.env.OUTERWORLD_LEDGER_PATH;
  else process.env.OUTERWORLD_LEDGER_PATH = original;
});

describe("HomePage", () => {
  it("renders the station name, the source and as-of, the map, and the demo controls from the fixture", () => {
    delete process.env.OUTERWORLD_LEDGER_PATH;
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Demo Station");
    expect(screen.getByText(/demo fixture/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2026-09-27T14:03:00Z/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("group", { name: "Project Management" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ultron/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run digest/i })).toBeInTheDocument();
  });

  it("shows the report panel with an empty state until something is selected", () => {
    delete process.env.OUTERWORLD_LEDGER_PATH;
    render(<HomePage />);
    expect(within(screen.getByRole("complementary")).getByRole("status")).toBeInTheDocument();
  });

  it("never simulates on a real ledger: no Run digest control, the ledger path in the footer", () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-real-"));
    mkdirSync(join(dir, "ledger"));
    writeFileSync(
      join(dir, "station.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "mine",
        name: "My Station",
        teams: [
          {
            id: "a",
            name: "A",
            mission: "m",
            category: "build",
            emblem: { hue: 1, mark: "none" },
            scope: { repos: [] },
            schedule: { kind: "interval", everyMinutes: 60 },
          },
        ],
        agents: [],
        grants: [],
        handoffs: [],
        overseer: {
          persona: { name: "O", mandate: "m", tone: "t" },
          schedule: { kind: "interval", everyMinutes: 60 },
          outward: { kind: "discord-webhook" },
        },
      }),
    );
    process.env.OUTERWORLD_LEDGER_PATH = dir;
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("My Station");
    expect(screen.queryByRole("button", { name: /run digest/i })).toBeNull();
    expect(screen.queryByText(/demo fixture/i)).toBeNull();
    expect(screen.getByText(dir)).toBeInTheDocument();
  });
});
