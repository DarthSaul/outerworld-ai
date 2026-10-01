import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { formatWhen } from "../components/format.js";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const withBriefing = (enabled = true) => {
  const fake = fakeApi();
  const quill = fake.state.agents.get("quill");
  if (!quill) throw new Error("no quill");
  quill.config = {
    ...quill.config,
    schedules: [
      {
        id: "briefing",
        cron: "0 8 * * 1-5",
        timezone: "Europe/Stockholm",
        prompt: "Write the briefing.",
        catchUp: false,
        enabled,
      },
    ],
  };
  fake.scheduleHistory.set("quill/briefing", [
    {
      scheduledFor: "2026-09-30T06:00:00.000Z",
      at: "2026-09-30T06:00:01.000Z",
      outcome: "missed",
      reason: "down",
      manual: false,
    },
    {
      scheduledFor: "2026-09-29T06:00:00.000Z",
      at: "2026-09-29T06:00:01.000Z",
      outcome: "fired",
      manual: false,
      sessionId: "s-sched",
      runId: "r-sched",
      runState: "completed",
    },
  ]);
  return fake;
};

const card = async () => screen.findByRole("region", { name: "briefing" });

describe("Schedules on a crew member's page", () => {
  it("shows each schedule's timing, next run in its own zone, and what it did lately", async () => {
    const { container } = renderApp("/crew/quill", withBriefing());
    const c = await card();
    expect(within(c).getByText("0 8 * * 1-5")).toBeInTheDocument();
    expect(within(c).getByText(/At 8:00 AM, Monday through Friday/)).toBeInTheDocument();
    expect(within(c).getByText("Write the briefing.")).toBeInTheDocument();
    expect(
      within(c).getByText(
        `${term("schedule.next")}: ${formatWhen("2026-10-01T06:00:00.000Z", "Europe/Stockholm")} (Europe/Stockholm)`,
      ),
    ).toBeInTheDocument();
    const history = within(c)
      .getAllByRole("listitem")
      .map((li) => li.dataset.outcome);
    expect(history).toEqual(["missed", "fired"]);
    expect(within(c).getByText(new RegExp(term("schedule.missed.down")))).toBeInTheDocument();
    expect(within(c).getByRole("link", { name: term("schedule.session") })).toHaveAttribute(
      "href",
      "/comms?agent=quill&open=s-sched",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("turns a schedule on or off, runs it now, and removes it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/quill", withBriefing(false));
    const c = await card();
    expect(within(c).getByText(term("schedule.off"))).toBeInTheDocument();
    await user.click(within(c).getByRole("checkbox", { name: term("schedule.enabled") }));
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/agents/quill/schedules/briefing",
      body: { enabled: true },
    });
    await user.click(within(c).getByRole("button", { name: term("schedule.runNow") }));
    expect(calls).toContainEqual({ method: "POST", path: "/agents/quill/schedules/briefing/run" });
    await user.click(within(c).getByRole("button", { name: term("schedule.remove") }));
    expect(calls).toContainEqual({ method: "DELETE", path: "/agents/quill/schedules/briefing" });
  });

  it("adds a schedule; an empty time zone means this computer's", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/vesper");
    expect(await screen.findByText(term("schedule.none"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: term("schedule.add") }));
    const form = screen.getByRole("form", { name: term("schedule.add") });
    await user.type(within(form).getByLabelText(term("schedule.cron")), "0 9 * * *");
    await user.type(within(form).getByLabelText(term("schedule.prompt")), "Morning check-in.");
    await user.click(within(form).getByLabelText(term("schedule.catchUp")));
    await user.click(within(form).getByRole("button", { name: term("schedule.save") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/agents/vesper/schedules",
      body: { cron: "0 9 * * *", prompt: "Morning check-in.", catchUp: true },
    });
  });

  it("edits a schedule, clearing its zone back to this computer's", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/quill", withBriefing());
    const c = await card();
    await user.click(within(c).getByRole("button", { name: term("schedule.edit") }));
    const form = within(c).getByRole("form", { name: term("schedule.edit") });
    const zone = within(form).getByLabelText(term("schedule.timezone"));
    expect(zone).toHaveValue("Europe/Stockholm");
    await user.selectOptions(zone, "");
    await user.click(within(form).getByRole("button", { name: term("schedule.save") }));
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/agents/quill/schedules/briefing",
      body: {
        cron: "0 8 * * 1-5",
        prompt: "Write the briefing.",
        catchUp: false,
        timezone: null,
      },
    });
  });

  it("says what a cron means and when it runs next, as it is typed", async () => {
    const user = userEvent.setup();
    renderApp("/crew/vesper");
    await user.click(await screen.findByRole("button", { name: term("schedule.add") }));
    const form = screen.getByRole("form", { name: term("schedule.add") });
    const cron = within(form).getByLabelText(term("schedule.cron"));
    expect(within(form).getByText(term("schedule.cron.hint"))).toBeInTheDocument();
    await user.type(cron, "0 9 * * 1-5");
    expect(within(form).getByText("At 9:00 AM, Monday through Friday")).toBeInTheDocument();
    expect(
      within(form).getByText(new RegExp(`^${term("schedule.preview.next")}:`)),
    ).toHaveTextContent(/ · .* · /);
    await user.clear(cron);
    await user.type(cron, "61 * * * *");
    expect(within(form).getByText(new RegExp(term("schedule.preview.invalid")))).toHaveTextContent(
      /minute/i,
    );
  });

  it("picks a time zone from a grouped list; the first choice is this computer's", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/vesper");
    await user.click(await screen.findByRole("button", { name: term("schedule.add") }));
    const form = screen.getByRole("form", { name: term("schedule.add") });
    const zone = within(form).getByLabelText(term("schedule.timezone"));
    expect(await within(zone).findByRole("option", { selected: true })).toHaveTextContent(
      new RegExp(`^${term("schedule.timezone.machine")}: Stockholm \\(GMT\\+\\d\\)`),
    );
    expect(within(zone).getByRole("group", { name: "Asia" })).toBeInTheDocument();
    await user.selectOptions(zone, "Asia/Tokyo");
    await user.type(within(form).getByLabelText(term("schedule.cron")), "0 9 * * *");
    await user.type(within(form).getByLabelText(term("schedule.prompt")), "Tokyo morning.");
    await user.click(within(form).getByRole("button", { name: term("schedule.save") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/agents/vesper/schedules",
      body: { cron: "0 9 * * *", prompt: "Tokyo morning.", catchUp: false, timezone: "Asia/Tokyo" },
    });
  });

  it("shows why the daemon refused a cron", async () => {
    const user = userEvent.setup();
    renderApp("/crew/vesper");
    await user.click(await screen.findByRole("button", { name: term("schedule.add") }));
    const form = screen.getByRole("form", { name: term("schedule.add") });
    await user.type(within(form).getByLabelText(term("schedule.cron")), "61 * * * *");
    await user.type(within(form).getByLabelText(term("schedule.prompt")), "Never.");
    await user.click(within(form).getByRole("button", { name: term("schedule.save") }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/Invalid value for minute/);
  });

  it("refreshes when a schedule fires", async () => {
    const fake = withBriefing();
    const { emit, calls } = renderApp("/crew/quill", fake);
    await card();
    const before = calls.filter((c) => c.path === "/agents/quill/schedules").length;
    emit({
      type: "schedule.fired",
      agentId: "quill",
      payload: { scheduleId: "briefing", scheduledFor: "2026-10-01T06:00:00.000Z" },
    });
    await screen.findByRole("region", { name: "briefing" });
    await expect
      .poll(() => calls.filter((c) => c.path === "/agents/quill/schedules").length)
      .toBeGreaterThan(before);
  });
});
