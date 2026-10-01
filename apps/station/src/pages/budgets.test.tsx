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
    budgets: { perRunUsd: 5, perAgentDailyUsd: 25 },
  };
  fake.spend.stationUsd = 1.25;
  return fake;
};

describe("Settings → Budgets", () => {
  it("shows each cap, says plainly when there is none, and today's station spend", async () => {
    const { container } = renderApp("/settings", withBudgets());
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
    const { calls } = renderApp("/settings", withBudgets());
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
      body: { perRunUsd: 2.5, perAgentDailyUsd: null, stationDailyUsd: 40 },
    });
  });

  it("refuses a cap of zero or less before sending it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/settings", withBudgets());
    const section = await screen.findByRole("region", { name: term("budgets") });
    const perRun = within(section).getByLabelText(term("budgets.perRun"));
    await user.clear(perRun);
    await user.type(perRun, "0");
    await user.click(within(section).getByRole("button", { name: term("budgets.save") }));
    expect(calls.some((c) => c.path === "/budgets")).toBe(false);
  });
});
