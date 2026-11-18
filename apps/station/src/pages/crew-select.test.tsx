import { ART_CHARACTERS, CHARACTER_COUNT, term } from "@darthsaul/outerworld-ai-core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const region = () => screen.findByRole("region", { name: term("crewSelect.appearance") });
const strip = (name = "Quill") => screen.getByRole("list", { name: `Choose how ${name} appears` });

/** Appearance on a crew member's page (ADR-0017): it replaced the Crew Select tab. */
describe("Appearance on a crew member's page", () => {
  it("is the first row under the header, opening on the crew member's look", async () => {
    const fake = fakeApi();
    const vesper = fake.state.agents.get("vesper");
    if (vesper) vesper.config = { ...vesper.config, look: "kestrel" };
    const { container } = renderApp("/crew/vesper", fake);
    const appearance = await region();
    const header = screen.getByRole("heading", { level: 2, name: "Vesper" }).closest("header");
    expect(header?.nextElementSibling?.contains(appearance)).toBe(true);
    expect(screen.getByText("Equipped on Vesper")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "KESTREL" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("offers the painted characters too, in two rows that scroll sideways", async () => {
    renderApp("/crew/quill");
    await region();
    expect(within(strip()).getAllByRole("listitem")).toHaveLength(CHARACTER_COUNT);
    const painted = ART_CHARACTERS[0];
    expect(
      within(strip()).getByRole("button", { name: `${painted?.name}, ${painted?.role}` }),
    ).toBeInTheDocument();
  });

  it("saves the character under the cursor with Enter, and says so", async () => {
    const { calls } = renderApp("/crew/quill");
    await region();
    await userEvent.click(within(strip()).getByRole("button", { name: "NOVA, Pilot" }));
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    fireEvent.keyDown(strip(), { key: "Enter" });
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/agents/quill",
        body: { look: "bolt" },
      }),
    );
    expect(await screen.findByText("Quill now appears as BOLT")).toBeInTheDocument();
  });

  it("drops the note once the saved look changes again elsewhere", async () => {
    const fake = fakeApi();
    const { client } = renderApp("/crew/quill", fake);
    await region();
    await userEvent.click(within(strip()).getByRole("button", { name: "NOVA, Pilot" }));
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    fireEvent.keyDown(strip(), { key: "Enter" });
    expect(await screen.findByText("Quill now appears as BOLT")).toBeInTheDocument();
    // The refreshed crew member shows the saved look: the note stands.
    await act(() => client.invalidateQueries());
    expect(screen.getByText("Quill now appears as BOLT")).toBeInTheDocument();
    // Another tab picks a different look: the note would now be false.
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, look: "moss" };
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(screen.queryByText("Quill now appears as BOLT")).toBeNull());
  });

  it("saves from the title strip, live only once the look has changed", async () => {
    const { calls } = renderApp("/crew/vesper");
    const appearance = await region();
    const save = within(appearance).getByRole("button", { name: term("crewSelect.save") });
    expect(save).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Random" })).toBeNull();
    await userEvent.click(within(strip("Vesper")).getByRole("button", { name: "NOVA, Pilot" }));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.path).toBe("/agents/vesper");
    expect((patch?.body as { look?: string } | undefined)?.look).toBe("nova");
  });

  it("names the crew member's room under their name, Delete aligned to the top", async () => {
    renderApp("/crew/quill");
    const name = await screen.findByRole("heading", { level: 2, name: "Quill" });
    const room = name.parentElement?.querySelector("[data-room-line]");
    expect(room).toHaveTextContent("Room: Operations");
    const header = name.closest("header");
    expect(header?.className).toMatch(/items-start/);
  });

  it("sends the old Crew Select address to the crew list, and has no tab", async () => {
    renderApp("/crew-select");
    expect(
      await screen.findByRole("heading", { level: 1, name: term("crewPage.rooms") }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).queryByRole("link", { name: term("tab.crewSelect") })).toBeNull();
  });
});
