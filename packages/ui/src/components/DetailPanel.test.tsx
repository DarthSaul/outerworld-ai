import { term } from "@darthsaul/outerworld-ai-core";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { loadFixture } from "../test/fixture.js";
import { DetailPanel } from "./DetailPanel.js";

const { station, state } = loadFixture();
const byTerm = (key: Parameters<typeof term>[0]) => new RegExp(term(key), "i");

describe("DetailPanel", () => {
  it("is a complementary region that shows an empty state with no selection", () => {
    render(<DetailPanel station={station} state={state} selection={null} onSelect={() => {}} />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/select/i);
  });

  describe("team", () => {
    const sel = { kind: "team", id: "project-management" } as const;

    it("shows eyebrow with counts, title, meta, and the proof line", () => {
      render(<DetailPanel station={station} state={state} selection={sel} onSelect={() => {}} />);
      const panel = screen.getByRole("complementary");
      expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(
        "Project Management",
      );
      expect(panel.querySelector("[data-eyebrow]")).toHaveTextContent(
        new RegExp(`2 ${term("grants")}`, "i"),
      );
      expect(panel.querySelector("[data-eyebrow]")).toHaveTextContent(
        new RegExp(`2 ${term("handoffs")}`, "i"),
      );
      const proof = panel.querySelector("[data-proof-line]");
      expect(proof).toHaveTextContent("2026-09-27T14:03:00Z");
      expect(proof).toHaveTextContent("ledger/project-management.md");
      expect(proof).toHaveTextContent("a41f9c");
    });

    it("shows the last run with window, outcome, and grants used", () => {
      render(<DetailPanel station={station} state={state} selection={sel} onSelect={() => {}} />);
      const last = screen.getByRole("region", { name: byTerm("report.lastRun") });
      expect(last).toHaveTextContent("working");
      expect(last).toHaveTextContent("14:00:04");
      expect(last).toHaveTextContent("Notion ×3");
      expect(last.querySelector('[data-mode="read"]')).not.toBeNull();
    });

    it("renders the ledger sections with a changed marker", () => {
      render(<DetailPanel station={station} state={state} selection={sel} onSelect={() => {}} />);
      const ledger = screen.getByRole("region", { name: byTerm("report.ledger") });
      expect(ledger).toHaveTextContent("cut v0.4 release notes");
      expect(ledger).toHaveTextContent("1RM calc test results");
      expect(ledger.querySelector("[data-changed]")).toHaveAttribute("data-changed", "false");
    });

    it("lists the last runs newest first with state and duration", () => {
      render(<DetailPanel station={station} state={state} selection={sel} onSelect={() => {}} />);
      const runs = screen.getByRole("region", { name: byTerm("report.runs") });
      const items = within(runs).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent("27 Sep 14:00");
      expect(items[0]).toHaveTextContent("working");
      expect(items[1]).toHaveTextContent("1m 52s");
      expect(items[1]).toHaveTextContent("done");
    });

    it("lists handoffs and agents, and clicking one changes the selection", async () => {
      const onSelect = vi.fn();
      render(<DetailPanel station={station} state={state} selection={sel} onSelect={onSelect} />);
      const handoffs = screen.getByRole("region", { name: byTerm("report.handoffs") });
      expect(within(handoffs).getAllByRole("button")).toHaveLength(2);
      const agents = screen.getByRole("region", { name: byTerm("report.agents") });
      await userEvent.click(within(agents).getByRole("button", { name: /Scribe/ }));
      expect(onSelect).toHaveBeenCalledWith({ kind: "agent", id: "scribe" });
    });

    it("shows a degraded banner for a team whose last run is older than a day", () => {
      render(
        <DetailPanel
          station={station}
          state={state}
          selection={{ kind: "team", id: "strength-app" }}
          onSelect={() => {}}
        />,
      );
      expect(screen.getByRole("alert")).toHaveTextContent(/older than/i);
      expect(screen.getByText(/stalled/)).toBeInTheDocument();
    });
  });

  it("agent: shows persona, allowlist, state note, and the team link", async () => {
    const onSelect = vi.fn();
    render(
      <DetailPanel
        station={station}
        state={state}
        selection={{ kind: "agent", id: "builder" }}
        onSelect={onSelect}
      />,
    );
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("Builder");
    expect(panel).toHaveTextContent("Cut the weekly build");
    expect(panel).toHaveTextContent("tests red, build not cut");
    expect(within(panel).getByRole("img", { name: "Builder, failed" })).toHaveAttribute(
      "width",
      "48",
    );
    expect(within(panel).getAllByText(/commits|notion|ledger/i).length).toBeGreaterThanOrEqual(3);
    await userEvent.click(within(panel).getByRole("button", { name: /Strength App/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "team", id: "strength-app" });
  });

  it("grant: shows mode, tool, kind, and which agents hold it", () => {
    render(
      <DetailPanel
        station={station}
        state={state}
        selection={{ kind: "grant", id: "pm-notion-read" }}
        onSelect={() => {}}
      />,
    );
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("notion");
    expect(panel).toHaveTextContent(/read/);
    expect(panel).toHaveTextContent(/connector/);
    expect(within(panel).getByRole("button", { name: /Planner/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Scribe/ })).toBeInTheDocument();
  });

  it("handoff: shows direction, carrying, the note, and both teams", () => {
    render(
      <DetailPanel
        station={station}
        state={state}
        selection={{ kind: "handoff", id: "strength-app-to-project-management" }}
        onSelect={() => {}}
      />,
    );
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Strength App → Project Management",
    );
    expect(panel).toHaveTextContent(/carrying/);
    expect(panel).toHaveTextContent("Project Management reads the build ledger");
  });

  it("overseer: shows the digest, attention list, and last outward post", () => {
    render(
      <DetailPanel
        station={station}
        state={state}
        selection={{ kind: "overseer", id: "overseer" }}
        onSelect={() => {}}
      />,
    );
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("Meridian");
    expect(panel).toHaveTextContent("Meridian reconciled 2");
    expect(panel).toHaveTextContent("last run failed and no run since");
    expect(panel).toHaveTextContent("2026-09-27T14:03:00Z");
  });

  it("has a close control when onClose is given", async () => {
    const onClose = vi.fn();
    render(
      <DetailPanel
        station={station}
        state={state}
        selection={{ kind: "overseer", id: "overseer" }}
        onSelect={() => {}}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    { kind: "team", id: "project-management" },
    { kind: "agent", id: "planner" },
    { kind: "grant", id: "sa-git-read" },
    { kind: "handoff", id: "project-management-to-strength-app" },
    { kind: "overseer", id: "overseer" },
  ] as const)("has no axe violations for $kind", async (sel) => {
    const { container } = render(
      <DetailPanel station={station} state={state} selection={sel} onSelect={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
