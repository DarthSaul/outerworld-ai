import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { ConsentRecord } from "../queries.js";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const pending = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  id: "k1",
  runId: "r2",
  sessionId: "s1",
  agentId: "quill",
  toolCallId: "c1",
  tool: "write_file",
  input: { path: "notes/today.md", content: "# Today" },
  status: "pending",
  createdAt: "2026-09-29T12:00:00.000Z",
  ...over,
});

describe("consent in COMMS", () => {
  it("shows the request inline with the tool and its input, and approves it", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const app = renderApp("/comms?agent=quill", fake);
    await user.click(await screen.findByRole("button", { name: term("comms.new") }));
    const chat = await screen.findByRole("region", { name: /Quill · New session/ });
    fake.consents.push(pending());
    app.emit({
      type: "consent.requested",
      agentId: "quill",
      sessionId: "s1",
      runId: "r2",
      payload: { consentId: "k1", toolCallId: "c1", tool: "write_file", input: {} },
    });
    const card = await within(chat).findByRole("region", {
      name: /Approval needed: Quill wants to use write_file/,
    });
    expect(within(card).getByText(/notes\/today.md/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: term("consent.approve") }));
    expect(app.calls).toContainEqual({
      method: "POST",
      path: "/consents/k1",
      body: { decision: "approved" },
    });
  });
});

describe("Notifications", () => {
  it("says so when nothing needs approval", async () => {
    renderApp("/notifications");
    expect(await screen.findByText(term("consent.none.title"))).toBeInTheDocument();
  });

  it("lists every pending request from any crew member, and denies one", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.consents.push(pending(), pending({ id: "k2", agentId: "vesper", tool: "write_file" }));
    const { calls } = renderApp("/notifications", fake);
    const cards = await screen.findAllByRole("region", { name: /Approval needed/ });
    expect(cards.map((c) => c.getAttribute("aria-labelledby"))).toEqual([
      "consent-k1",
      "consent-k2",
    ]);
    expect(screen.getByRole("region", { name: /Vesper wants to use/ })).toBeInTheDocument();
    await user.click(
      within(cards[0] as HTMLElement).getByRole("button", { name: term("consent.deny") }),
    );
    expect(calls).toContainEqual({
      method: "POST",
      path: "/consents/k1",
      body: { decision: "denied" },
    });
  });

  it("has no axe violations with a request showing", async () => {
    const fake = fakeApi();
    fake.consents.push(pending());
    const { container } = renderApp("/notifications", fake);
    await screen.findByRole("region", { name: /Approval needed/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("kill switch and spend", () => {
  it("stops everything in one click, covers the map and stops blinking, and resumes", async () => {
    const user = userEvent.setup();
    const { calls, control, emit, container } = renderApp("/");
    await user.click(await screen.findByRole("button", { name: term("station.stop") }));
    expect(calls).toContainEqual({ method: "PUT", path: "/kill-switch", body: { engaged: true } });
    emit({ type: "station.kill_switch", payload: { engaged: true } });
    expect(await screen.findByText(term("station.stopped.title"))).toBeInTheDocument();
    expect(container.querySelector("[data-paused]")).not.toBeNull();
    expect(control.engaged).toBe(true);
    await user.click(screen.getByRole("button", { name: term("station.resume") }));
    emit({ type: "station.kill_switch", payload: { engaged: false } });
    await waitFor(() =>
      expect(screen.queryByText(term("station.stopped.title"))).not.toBeInTheDocument(),
    );
    expect(container.querySelector("[data-paused]")).toBeNull();
  });

  it("shows today's station spend in the footer and each crew member's on the Crew screen", async () => {
    const fake = fakeApi();
    fake.spend.stationUsd = 0.4312;
    fake.spend.agents = { vesper: 0.0042 };
    renderApp("/crew", fake);
    expect(await screen.findByText("Fuel · $0.43 today, no cap")).toBeInTheDocument();
    const command = await screen.findByRole("region", { name: "Command" });
    expect(within(command).getByText(`${term("spend.today")} $0.0042`)).toBeInTheDocument();
  });

  it("shows a session's spend, and says when some calls had no reported cost", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const app = renderApp("/comms?agent=vesper", fake);
    await user.click(await screen.findByRole("button", { name: term("comms.new") }));
    const chat = await screen.findByRole("region", { name: /Vesper · New session/ });
    await user.type(within(chat).getByRole("textbox"), "Hi");
    await user.click(within(chat).getByRole("button", { name: term("comms.send") }));
    fake.spend.sessions.s1 = {
      costUsd: 0.0123,
      inputTokens: 1,
      outputTokens: 1,
      calls: 2,
      unpriced: 1,
    };
    app.emit({
      type: "run.queued",
      agentId: "vesper",
      sessionId: "s1",
      runId: "r2",
      payload: { trigger: "user" },
    });
    expect(
      await within(chat).findByText(new RegExp(`${term("spend.session")} \\$0.01`)),
    ).toHaveTextContent(term("spend.unpriced"));
  });
});
