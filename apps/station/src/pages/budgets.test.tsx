import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const withBudgets = () => {
  const fake = fakeApi();
  fake.state.station = {
    ...fake.state.station,
    budgets: { perRunUsd: 5, perAgentDailyUsd: 25, perTreeUsd: null },
  };
  fake.spend.stationUsd = 1.25;
  return fake;
};

describe("Settings → Budgets", () => {
  it("shows each cap, says plainly when there is none, and today's station spend", async () => {
    const { container } = renderApp("/system/settings/budgets", withBudgets());
    const section = await screen.findByRole("region", { name: term("budgets") });
    expect(within(section).getByLabelText(term("budgets.perRun"))).toHaveValue(5);
    expect(within(section).getByLabelText(term("budgets.perAgentDaily"))).toHaveValue(25);
    expect(within(section).getByLabelText(term("budgets.stationDaily"))).toHaveValue(null);
    expect(within(section).getByText(term("budgets.none"))).toBeInTheDocument();
    expect(await within(section).findByText(`${term("budgets.today")}: $1.25`)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("saves caps; an emptied field removes that cap", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/settings/budgets", withBudgets());
    const section = await screen.findByRole("region", { name: term("budgets") });
    const perRun = within(section).getByLabelText(term("budgets.perRun"));
    await user.clear(perRun);
    await user.type(perRun, "2.5");
    await user.clear(within(section).getByLabelText(term("budgets.perAgentDaily")));
    await user.type(within(section).getByLabelText(term("budgets.stationDaily")), "40");
    await user.click(within(section).getByRole("button", { name: term("budgets.save") }));
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/budgets",
      body: { perRunUsd: 2.5, perAgentDailyUsd: null, stationDailyUsd: 40, perTreeUsd: null },
    });
  });

  it("edits the per-request cap across every dispatch, empty meaning none (ADR-0024)", async () => {
    const user = userEvent.setup();
    const fake = withBudgets();
    fake.state.station = {
      ...fake.state.station,
      budgets: { ...fake.state.station.budgets, perTreeUsd: 15 },
    };
    const { calls } = renderApp("/system/settings/budgets", fake);
    const section = await screen.findByRole("region", { name: term("budgets") });
    const perTree = within(section).getByLabelText(term("budgets.perTree"));
    expect(perTree).toHaveValue(15);
    expect(within(section).getByText(term("budgets.perTree.hint"))).toBeInTheDocument();
    await user.clear(perTree);
    await user.click(within(section).getByRole("button", { name: term("budgets.save") }));
    expect(calls).toContainEqual(
      expect.objectContaining({
        path: "/budgets",
        body: expect.objectContaining({ perTreeUsd: null }),
      }),
    );
  });

  it("refuses a cap of zero or less before sending it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/settings/budgets", withBudgets());
    const section = await screen.findByRole("region", { name: term("budgets") });
    const perRun = within(section).getByLabelText(term("budgets.perRun"));
    await user.clear(perRun);
    await user.type(perRun, "0");
    await user.click(within(section).getByRole("button", { name: term("budgets.save") }));
    expect(calls.some((c) => c.path === "/budgets")).toBe(false);
  });
});

describe("Settings → Dispatch (ADR-0024)", () => {
  it("shows the station's depth, run cap and auto review, and saves changes", async () => {
    const user = userEvent.setup();
    const { calls, container } = renderApp("/system/settings/dispatch");
    const section = await screen.findByRole("region", { name: term("dispatch.policy") });
    const depth = within(section).getByLabelText(term("dispatch.maxDepth"));
    const runs = within(section).getByLabelText(term("dispatch.maxRunsPerTree"));
    const review = within(section).getByLabelText(term("dispatch.autoReview"));
    expect(depth).toHaveValue("1");
    expect(
      within(depth)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["0", "1", "2", "3"]);
    expect(runs).toHaveValue(12);
    expect(review).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();

    await user.selectOptions(depth, "3");
    await user.clear(runs);
    await user.type(runs, "20");
    await user.click(review);
    await user.click(within(section).getByRole("button", { name: term("dispatch.save") }));
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/dispatch",
      body: { maxDepth: 3, maxRunsPerTree: 20, autoReview: false },
    });
    expect(await within(section).findByRole("status")).toHaveTextContent(term("budgets.saved"));
  });

  it("refuses a run cap outside 1 to 50 before sending it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/settings/dispatch");
    const section = await screen.findByRole("region", { name: term("dispatch.policy") });
    const runs = within(section).getByLabelText(term("dispatch.maxRunsPerTree"));
    await user.clear(runs);
    await user.type(runs, "51");
    await user.click(within(section).getByRole("button", { name: term("dispatch.save") }));
    expect(calls.some((c) => c.path === "/dispatch")).toBe(false);
  });
});
