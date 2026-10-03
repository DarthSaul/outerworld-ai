import { term } from "@darthsaul/outerworld-ai-core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const region = () => screen.findByRole("region", { name: term("crewSelect.appearance") });

describe("Crew Select", () => {
  it("lists the Overseer first, then crew, and opens on the Overseer's look", async () => {
    const fake = fakeApi();
    const vesper = fake.state.agents.get("vesper");
    if (vesper) vesper.config = { ...vesper.config, look: 3 };
    const { container } = renderApp("/crew-select", fake);
    const appearance = await region();
    expect(
      screen.getByRole("heading", { level: 1, name: term("tab.crewSelect") }),
    ).toBeInTheDocument();
    const pickers = within(appearance).getAllByRole("button", { pressed: true });
    expect(pickers[0]).toHaveTextContent("Vesper");
    expect(screen.getByText("Equipped on Vesper")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "KESTREL" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("assigns the character under the cursor with Enter, and says so", async () => {
    const { calls } = renderApp("/crew-select");
    await region();
    await userEvent.click(screen.getByRole("button", { name: "Quill" }));
    await userEvent.click(screen.getByRole("button", { name: "NOVA, Pilot" }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "PATCH", path: "/agents/quill", body: { look: 1 } }),
    );
    expect(await screen.findByText("Quill now appears as BOLT")).toBeInTheDocument();
  });

  it("assigns with (A) after a random pick with (B)", async () => {
    const { calls } = renderApp("/crew-select");
    await region();
    await userEvent.click(screen.getByRole("button", { name: term("crewSelect.random") }));
    await userEvent.click(screen.getByRole("button", { name: term("crewSelect.assign") }));
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.path).toBe("/agents/vesper");
    expect((patch?.body as { look?: number } | undefined)?.look).toBeGreaterThanOrEqual(0);
  });
});
