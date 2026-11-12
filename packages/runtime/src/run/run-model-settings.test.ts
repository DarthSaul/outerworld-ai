import { describe, expect, it } from "vitest";
import { reply, scripted, setup } from "../test/loop.js";

/** Per-conversation model, key, and reasoning level (ADR-0016). */
describe("RunService: model settings", () => {
  const recording = () => {
    const asked: Array<{ modelId: string; provider: string | undefined }> = [];
    const model = scripted([reply("one"), reply("two"), reply("three")]);
    const t = setup(model, {
      models: (modelId, options) => {
        asked.push({ modelId, provider: options?.provider });
        return model;
      },
    });
    return { ...t, asked };
  };

  it("uses the crew member's model, with the automatic key and the provider's default reasoning", async () => {
    const t = recording();
    const s = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(s.id, "Hi")).runId);
    expect(run).toMatchObject({
      model: "anthropic/claude-sonnet-5.5",
      provider: "auto",
      reasoning: "default",
    });
    expect(t.asked).toEqual([{ modelId: "anthropic/claude-sonnet-5.5", provider: "auto" }]);
    expect(t.model.doStreamCalls[0]?.reasoning).toBeUndefined();
  });

  it("uses the conversation's choice from the next run on, and sends the reasoning level", async () => {
    const t = recording();
    const s = t.service.createSession("vesper");
    const set = t.service.setSessionModel(s.id, {
      model: "anthropic/claude-opus-5.5",
      provider: "anthropic",
      reasoning: "high",
    });
    expect(set.modelSettings).toEqual({
      model: "anthropic/claude-opus-5.5",
      provider: "anthropic",
      reasoning: "high",
    });
    expect(t.sessions.getSession(s.id)?.modelSettings).toEqual(set.modelSettings);
    const run = await t.service.settled((await t.service.send(s.id, "Hi")).runId);
    expect(run).toMatchObject({
      model: "anthropic/claude-opus-5.5",
      provider: "anthropic",
      reasoning: "high",
    });
    expect(t.asked.at(-1)).toEqual({ modelId: "anthropic/claude-opus-5.5", provider: "anthropic" });
    const call = t.model.doStreamCalls.at(-1);
    expect(call?.reasoning).toBe("high");
    expect(call?.providerOptions).toMatchObject({ openrouter: { reasoning: { effort: "high" } } });
    const started = t.events.since(0).find((e) => e.type === "run.started");
    expect(started?.payload).toEqual({
      model: "anthropic/claude-opus-5.5",
      provider: "anthropic",
      reasoning: "high",
    });
  });

  it("keeps fields the conversation leaves out, and goes back to the default on null", async () => {
    const t = recording();
    const s = t.service.createSession("vesper");
    t.service.setSessionModel(s.id, { reasoning: "low" });
    const first = await t.service.settled((await t.service.send(s.id, "a")).runId);
    expect(first).toMatchObject({ model: "anthropic/claude-sonnet-5.5", reasoning: "low" });
    expect(t.service.setSessionModel(s.id, null).modelSettings).toBeUndefined();
    const second = await t.service.settled((await t.service.send(s.id, "b")).runId);
    expect(second).toMatchObject({ reasoning: "default" });
  });

  it("lets one send override the conversation (a scheduled job's settings)", async () => {
    const t = recording();
    const s = t.service.createSession("vesper");
    t.service.setSessionModel(s.id, { model: "anthropic/claude-opus-5.5", reasoning: "low" });
    const run = await t.service.settled(
      (await t.service.send(s.id, "Go", { modelSettings: { provider: "openrouter" } })).runId,
    );
    expect(run).toMatchObject({
      model: "anthropic/claude-opus-5.5",
      provider: "openrouter",
      reasoning: "low",
    });
  });

  it("fails the run with the factory's message when the chosen key is missing", async () => {
    const t = setup(scripted([]), {
      models: () => {
        throw new Error("needs an OpenRouter key");
      },
    });
    const s = t.service.createSession("vesper");
    t.service.setSessionModel(s.id, { provider: "openrouter" });
    const run = await t.service.settled((await t.service.send(s.id, "Hi")).runId);
    expect(run.state).toBe("failed");
    expect(run.error).toMatch(/OpenRouter key/);
  });
});
