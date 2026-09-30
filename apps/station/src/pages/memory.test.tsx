import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const withMemories = () => {
  const fake = fakeApi();
  fake.memories.push(
    {
      id: "m1",
      agentId: "quill",
      scope: "agent",
      text: "The Commander prefers bullet points.",
      status: "proposed",
      createdAt: "2026-09-29T12:00:00.000Z",
    },
    {
      id: "m2",
      agentId: "quill",
      scope: "station",
      text: "The station works in UTC.",
      status: "approved",
      createdAt: "2026-09-28T12:00:00.000Z",
      decidedAt: "2026-09-28T12:05:00.000Z",
    },
  );
  return fake;
};

describe("Memory screen", () => {
  it("shows the chosen crew member's proposals and stored beliefs", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/memory", withMemories());
    await user.click(await screen.findByRole("button", { name: "Quill" }));
    const proposals = await screen.findByRole("region", { name: term("memory.proposals") });
    expect(
      within(proposals).getByDisplayValue("The Commander prefers bullet points."),
    ).toBeInTheDocument();
    const beliefs = screen.getByRole("region", { name: term("memory.beliefs") });
    expect(within(beliefs).getByText("The station works in UTC.")).toBeInTheDocument();
    expect(within(beliefs).getByText(term("memory.scope.station"))).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("approves a proposal as written, or with the Commander's edit, and rejects one", async () => {
    const user = userEvent.setup();
    const fake = withMemories();
    fake.memories.push({
      id: "m3",
      agentId: "quill",
      scope: "agent",
      text: "Wrong",
      status: "proposed",
      createdAt: "2026-09-29T12:01:00.000Z",
    });
    const { calls } = renderApp("/memory?agent=quill", fake);
    const proposals = await screen.findByRole("region", { name: term("memory.proposals") });
    const [first, second] = within(proposals).getAllByRole("listitem");
    if (!first || !second) throw new Error("two proposals expected");
    const box = within(first).getByRole("textbox");
    await user.clear(box);
    await user.type(box, "Bullets, always.");
    await user.click(within(first).getByRole("button", { name: term("memory.approve") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/memories/m1/approve",
      body: { text: "Bullets, always." },
    });
    await user.click(within(second).getByRole("button", { name: term("memory.reject") }));
    expect(calls).toContainEqual({ method: "POST", path: "/memories/m3/reject" });
  });

  it("approves unchanged text without a body", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/memory?agent=quill", withMemories());
    const proposals = await screen.findByRole("region", { name: term("memory.proposals") });
    await user.click(within(proposals).getByRole("button", { name: term("memory.approve") }));
    expect(calls).toContainEqual({ method: "POST", path: "/memories/m1/approve" });
  });

  it("edits and forgets a stored belief", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/memory?agent=quill", withMemories());
    const beliefs = await screen.findByRole("region", { name: term("memory.beliefs") });
    await user.click(await within(beliefs).findByRole("button", { name: term("memory.edit") }));
    const box = within(beliefs).getByRole("textbox");
    await user.clear(box);
    await user.type(box, "UTC, always.");
    await user.click(within(beliefs).getByRole("button", { name: term("memory.save") }));
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/memories/m2",
      body: { text: "UTC, always." },
    });
    await user.click(await within(beliefs).findByRole("button", { name: term("memory.forget") }));
    expect(calls).toContainEqual({ method: "DELETE", path: "/memories/m2" });
  });

  it("says so when there is nothing to decide or remember, and refreshes on memory events", async () => {
    const fake = fakeApi();
    const { emit } = renderApp("/memory?agent=vesper", fake);
    expect(await screen.findByText(term("memory.none.proposals.title"))).toBeInTheDocument();
    expect(screen.getByText(term("memory.none.beliefs.title"))).toBeInTheDocument();
    fake.memories.push({
      id: "m9",
      agentId: "vesper",
      scope: "agent",
      text: "Reports go out at nine.",
      status: "proposed",
      createdAt: "2026-09-29T12:00:00.000Z",
    });
    emit({
      type: "memory.proposed",
      agentId: "vesper",
      payload: { memoryId: "m9", text: "Reports go out at nine.", scope: "agent" },
    });
    expect(await screen.findByDisplayValue("Reports go out at nine.")).toBeInTheDocument();
  });
});
