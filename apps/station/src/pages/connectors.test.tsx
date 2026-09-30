import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const withNotion = (status: "connected" | "disconnected" = "connected") => {
  const fake = fakeApi();
  fake.connectors.push({
    id: "notion",
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    status,
    tools:
      status === "connected"
        ? [
            { name: "notion-search", class: "read", description: "Search" },
            { name: "notion-update-page", class: "write", description: "Update" },
          ]
        : [],
    grantedTo: ["quill"],
  });
  return fake;
};

describe("Connectors screen", () => {
  it("offers to add Notion when the station has no connectors", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/connectors");
    await user.click(await screen.findByRole("button", { name: term("connector.addNotion") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/connectors",
      body: { preset: "notion" },
    });
  });

  it("shows a connected Notion's status, tools with their class, and who is granted it", async () => {
    renderApp("/connectors", withNotion());
    const card = await screen.findByRole("region", { name: "Notion" });
    expect(within(card).getByRole("status", { name: "Notion status" })).toHaveTextContent(
      term("connectorStatus.connected"),
    );
    const tools = within(card)
      .getAllByRole("listitem")
      .map((li) => `${li.dataset.tool}:${li.dataset.class}`);
    expect(tools).toEqual(["notion-search:read", "notion-update-page:write"]);
    expect(within(card).getByText(`${term("connector.grantedTo")}: Quill`)).toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: term("connector.remove") }),
    ).not.toBeInTheDocument();
  });

  it("connects, and when sign-in is needed offers a link to open in a new tab", async () => {
    const user = userEvent.setup();
    const fake = withNotion("disconnected");
    fake.connectAnswer.status = "needs_auth";
    fake.connectAnswer.authorizationUrl = "https://auth.example.test/authorize?state=s1";
    renderApp("/connectors", fake);
    const card = await screen.findByRole("region", { name: "Notion" });
    await user.click(within(card).getByRole("button", { name: term("connector.connect") }));
    const link = await within(card).findByRole("link", {
      name: `${term("connector.signIn")} Notion`,
    });
    expect(link).toHaveAttribute("href", "https://auth.example.test/authorize?state=s1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(card).getByText(term("connector.signInHint"))).toBeInTheDocument();
  });

  it("disconnects, or disconnects and forgets the sign-in", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/connectors", withNotion());
    const card = await screen.findByRole("region", { name: "Notion" });
    await user.click(within(card).getByRole("button", { name: term("connector.forget") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/connectors/notion/disconnect",
      body: { forget: true },
    });
  });

  it("saves a new server URL", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/connectors", withNotion("disconnected"));
    const card = await screen.findByRole("region", { name: "Notion" });
    const field = within(card).getByLabelText(term("connector.url"));
    await user.clear(field);
    await user.type(field, "https://mcp.example.test/mcp");
    await user.click(within(card).getByRole("button", { name: term("connector.save") }));
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/connectors/notion",
      body: { url: "https://mcp.example.test/mcp" },
    });
  });

  it("says why a connector could not connect", async () => {
    const fake = withNotion("disconnected");
    const first = fake.connectors[0];
    if (first) fake.connectors[0] = { ...first, status: "error", detail: "connect ECONNREFUSED" };
    renderApp("/connectors", fake);
    const card = await screen.findByRole("region", { name: "Notion" });
    expect(within(card).getByRole("status", { name: "Notion status" })).toHaveTextContent(
      `${term("connectorStatus.error")}: connect ECONNREFUSED`,
    );
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/connectors", withNotion());
    await screen.findByRole("region", { name: "Notion" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
