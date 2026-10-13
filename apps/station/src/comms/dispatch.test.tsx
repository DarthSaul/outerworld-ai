import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { DispatchRecord } from "../queries.js";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

/** A lead session where Vesper dispatched to Quill, and Quill's worker session. */
const withDispatch = (status: DispatchRecord["status"] = "running") => {
  const fake = fakeApi();
  const lead = fake.seedSession("vesper", "Chat");
  const worker = fake.seedSession("quill", "From Vesper: Update the hub");
  worker.messages.push({ role: "user", text: "Task from Vesper, the Overseer:\nUpdate the hub" });
  worker.messageRuns = { 0: "wr" };
  worker.runs.push({
    id: "wr",
    trigger: "dispatch",
    sessionId: worker.session.id,
    agentId: "quill",
    state: status === "running" ? "running" : "completed",
    model: "m",
    createdAt: "2026-09-29T12:00:00.000Z",
    steps: 1,
  });
  lead.messages.push(
    { role: "user", text: "Update the hub" },
    {
      role: "assistant",
      text: "",
      toolCalls: [{ id: "c1", name: "dispatch", input: { to: "quill", task: "Update the hub" } }],
    },
    {
      role: "tool",
      toolCallId: "c1",
      name: "dispatch",
      output: { dispatchId: "d1", status: "started" },
    },
  );
  fake.dispatches.push({
    id: "d1",
    leadAgentId: "vesper",
    leadSessionId: lead.session.id,
    leadRunId: "lr",
    workerAgentId: "quill",
    workerSessionId: worker.session.id,
    workerRunId: "wr",
    task: "Update the hub",
    status,
    createdAt: "2026-09-29T12:00:00.000Z",
  });
  return { fake, lead, worker };
};

describe("dispatch in COMMS", () => {
  it("shows a dispatch card with who, what, and the live status", async () => {
    const { fake, lead } = withDispatch();
    renderApp(`/comms?agent=vesper&open=${lead.session.id}`, fake);
    const card = await screen.findByRole("listitem", {
      name: /Dispatched to Quill: Update the hub/,
    });
    expect(card).toHaveAttribute("data-dispatch-status", "running");
    expect(within(card).getByText(term("dispatchStatus.running"))).toBeInTheDocument();
  });

  it("expands into the worker's session live, where the Commander can steer it", async () => {
    const user = userEvent.setup();
    const { fake, lead } = withDispatch();
    const { calls } = renderApp(`/comms?agent=vesper&open=${lead.session.id}`, fake);
    const card = await screen.findByRole("listitem", { name: /Dispatched to Quill/ });
    await user.click(within(card).getByRole("button", { name: term("dispatch.watch") }));
    const worker = await within(card).findByRole("region", { name: /Quill · From Vesper/ });
    const task = within(worker)
      .getByText(/Task from Vesper/)
      .closest("[data-message]");
    expect(task).toHaveTextContent(term("overseer.role"));
    expect(task).not.toHaveTextContent(term("user"));
    expect(
      within(worker).queryByRole("button", { name: term("comms.close") }),
    ).not.toBeInTheDocument();
    await user.type(within(worker).getByRole("textbox"), "Focus on dates");
    await user.click(within(worker).getByRole("button", { name: term("comms.direct") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/runs/wr/steer",
      body: { text: "Focus on dates" },
    });
  });

  it("shows the worker's report as a labelled card when it lands", async () => {
    const { fake, lead } = withDispatch("completed");
    lead.messages.push({
      role: "report",
      dispatchId: "d1",
      from: "quill",
      status: "completed",
      text: "Hub updated.",
    });
    const { container } = renderApp(`/comms?agent=vesper&open=${lead.session.id}`, fake);
    const report = await screen.findByText("Hub updated.");
    const item = report.closest("[data-message]");
    expect(item).toHaveAttribute("data-message", "report");
    expect(item).toHaveTextContent(
      `${term("report.from")} Quill · ${term("dispatchStatus.completed")}`,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("dispatch on the Station", () => {
  it("lists the dispatched mission on the Bridge and runs packets down its hallway", async () => {
    const { fake } = withDispatch();
    fake.state.station = {
      ...fake.state.station,
      lanes: [{ id: "command-to-operations", from: "command", to: "operations" }],
    };
    const { container } = renderApp("/", fake);
    const scanner = await screen.findByRole("region", { name: term("scanner.title") });
    expect(await within(scanner).findByText("From Vesper: Update the hub")).toBeInTheDocument();
    expect(within(scanner).getByText(term("missionStatus.running"))).toBeInTheDocument();
    await expect
      .poll(() => container.querySelectorAll('[data-packet="command-to-operations"]').length)
      .toBe(1);
  });

  it("runs no packets once the dispatch is done", async () => {
    const { fake } = withDispatch("completed");
    fake.state.station = {
      ...fake.state.station,
      lanes: [{ id: "command-to-operations", from: "command", to: "operations" }],
    };
    const { container } = renderApp("/", fake);
    await screen.findByRole("region", { name: term("map.title") });
    expect(container.querySelectorAll("[data-packet]")).toHaveLength(0);
  });
});
