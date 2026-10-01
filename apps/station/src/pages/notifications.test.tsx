import { type Notification, term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const at = "2026-10-01T09:00:00.000Z";
const feed: Notification[] = [
  {
    seq: 9,
    at,
    kind: "schedule_done",
    level: "info",
    agentId: "quill",
    sessionId: "s7",
    runId: "r7",
  },
  {
    seq: 6,
    at,
    kind: "run_failed",
    level: "alert",
    agentId: "quill",
    sessionId: "s5",
    runId: "r5",
    detail: "HTTP 500",
  },
  { seq: 3, at, kind: "memory", level: "action", agentId: "vesper", detail: "Likes bullets." },
  { seq: 2, at, kind: "budget_blocked", level: "alert", subject: "run", detail: "$5.10 of $5.00" },
];

const withFeed = (readSeq = 3) => {
  const fake = fakeApi();
  fake.notifications.push(...feed);
  fake.notificationState.readSeq = readSeq;
  return fake;
};

describe("Notifications feed", () => {
  it("says what happened in words, marks what is new, and links to where to look", async () => {
    const { container } = renderApp("/notifications", withFeed());
    const list = await screen.findByRole("list", { name: term("notifications.feed") });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.kind)).toEqual([
      "schedule_done",
      "run_failed",
      "memory",
      "budget_blocked",
    ]);
    expect(items[0]).toHaveTextContent("Quill finished a scheduled run.");
    expect(items[1]).toHaveTextContent("A run by Quill failed: HTTP 500");
    expect(items[2]).toHaveTextContent("Vesper wants to remember: Likes bullets.");
    expect(items[3]).toHaveTextContent("The run budget stopped a run: $5.10 of $5.00.");
    expect(items.map((li) => li.dataset.unread)).toEqual(["true", "true", "false", "false"]);
    expect(
      within(items[0] as HTMLElement).getByText(term("notifications.new")),
    ).toBeInTheDocument();
    const href = (i: number) =>
      within(items[i] as HTMLElement).getByRole("link", { name: term("notification.open") });
    expect(href(0)).toHaveAttribute("href", "/comms?agent=quill&open=s7");
    expect(href(2)).toHaveAttribute("href", "/memory?agent=vesper");
    expect(href(3)).toHaveAttribute("href", "/settings");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the unread count in the navigation", async () => {
    renderApp("/", withFeed());
    expect(
      await screen.findByRole("link", {
        name: `${term("notifications")} 2 ${term("notifications.unread")}`,
      }),
    ).toBeInTheDocument();
  });

  it("marks everything read up to the newest notification", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/notifications", withFeed());
    await user.click(await screen.findByRole("button", { name: term("notifications.markRead") }));
    expect(calls).toContainEqual({ method: "POST", path: "/notifications/read", body: { seq: 9 } });
    expect(await screen.findByRole("link", { name: term("notifications") })).toBeInTheDocument();
  });

  it("loads older notifications on request", async () => {
    const user = userEvent.setup();
    const fake = withFeed();
    fake.notificationState.pageSize = 2;
    const { calls } = renderApp("/notifications", fake);
    const list = await screen.findByRole("list", { name: term("notifications.feed") });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: term("notifications.older") }));
    expect(await within(list).findAllByRole("listitem")).toHaveLength(4);
    expect(calls.map((c) => c.path)).toContain("/notifications?before=6");
    expect(
      screen.queryByRole("button", { name: term("notifications.older") }),
    ).not.toBeInTheDocument();
  });

  it("says so when there is nothing, and refreshes when something notifiable happens", async () => {
    const fake = fakeApi();
    const { emit } = renderApp("/notifications", fake);
    expect(await screen.findByText(term("notifications.none.title"))).toBeInTheDocument();
    fake.notifications.push({ seq: 1, at, kind: "kill_switch", level: "alert" });
    emit({ type: "station.kill_switch", payload: { engaged: true } });
    expect(await screen.findByText(term("notification.kill_switch"))).toBeInTheDocument();
  });
});
