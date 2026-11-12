import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const fresh = (mode: "fake" | "live" = "fake") => {
  const fake = fakeApi();
  fake.state.fresh = true;
  fake.state.agents.clear();
  fake.settings.modelMode = mode;
  return fake;
};

describe("Onboarding", () => {
  it("replaces the screens on an empty station; with the fake model no key is needed", async () => {
    const { container } = renderApp("/crew", fresh());
    expect(
      await screen.findByRole("heading", { level: 1, name: term("onboarding.title") }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    expect(await screen.findByText(term("onboarding.key.fake"))).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("creates the Overseer, then opens a first chat with it in COMMS", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/", fresh());
    await user.click(await screen.findByRole("button", { name: term("onboarding.continue") }));
    const form = screen.getByRole("form", { name: term("onboarding.overseer.title") });
    await user.type(within(form).getByLabelText(term("onboarding.overseerName")), "Meridian");
    await user.click(within(form).getByLabelText(term("tone.warm")));
    await user.click(within(form).getByRole("button", { name: term("onboarding.start") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/onboarding",
      body: { overseerName: "Meridian", tone: "warm" },
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: term("comms") }),
    ).toBeInTheDocument();
    expect(calls).toContainEqual({ method: "POST", path: "/agents/meridian/sessions", body: {} });
    expect(calls.some((c) => c.path === "/templates/project-manager")).toBe(false);
  });

  it("can add the Project Manager and name the station on the way", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/", fresh());
    await user.click(await screen.findByRole("button", { name: term("onboarding.continue") }));
    const form = screen.getByRole("form", { name: term("onboarding.overseer.title") });
    await user.type(within(form).getByLabelText(term("onboarding.stationName")), "Home Base");
    await user.type(within(form).getByLabelText(term("onboarding.overseerName")), "Lodestar");
    await user.click(within(form).getByLabelText(term("onboarding.pm")));
    await user.click(within(form).getByRole("button", { name: term("onboarding.start") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/onboarding",
      body: { overseerName: "Lodestar", tone: "calm", stationName: "Home Base" },
    });
    await screen.findByRole("heading", { level: 1, name: term("comms") });
    expect(calls).toContainEqual({ method: "POST", path: "/templates/project-manager", body: {} });
  });

  it("asks for an Anthropic key by default when runs are live", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/", fresh("live"));
    await user.type(await screen.findByLabelText(term("settings.key.new")), "sk-ant-test-1234");
    await user.click(screen.getByRole("button", { name: term("settings.key.save") }));
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/settings/anthropic",
      body: { key: "sk-ant-test-1234" },
    });
    expect(
      await screen.findByRole("form", { name: term("onboarding.overseer.title") }),
    ).toBeInTheDocument();
  });

  it("takes an OpenRouter key instead when that provider is chosen", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/", fresh("live"));
    await user.selectOptions(
      await screen.findByLabelText(term("onboarding.key.provider")),
      "openrouter",
    );
    const key = screen.getByLabelText(term("settings.key.new"));
    await user.type(key, "sk-or-test-1234");
    await user.click(screen.getByRole("button", { name: term("settings.key.save") }));
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/settings/openrouter",
      body: { key: "sk-or-test-1234" },
    });
    expect(
      await screen.findByRole("form", { name: term("onboarding.overseer.title") }),
    ).toBeInTheDocument();
  });

  it("lets the key wait until later", async () => {
    const user = userEvent.setup();
    renderApp("/", fresh("live"));
    await user.click(await screen.findByRole("button", { name: term("onboarding.key.later") }));
    expect(
      screen.getByRole("form", { name: term("onboarding.overseer.title") }),
    ).toBeInTheDocument();
  });
});

describe("Crew templates", () => {
  it("adds a Project Manager from the Crew screen's Add crew member view and opens it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew?add=agent");
    await user.click(await screen.findByRole("button", { name: term("template.projectManager") }));
    expect(calls).toContainEqual({ method: "POST", path: "/templates/project-manager", body: {} });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Project Manager" }),
    ).toBeInTheDocument();
  });
});
