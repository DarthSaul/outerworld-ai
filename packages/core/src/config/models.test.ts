import { describe, expect, it } from "vitest";
import { parseAgentConfig } from "./agent-config.js";
import {
  anthropicModelId,
  DEFAULT_MODEL,
  estimateCostUsd,
  isSupportedModel,
  ModelSettings,
  resolveModelSettings,
  routeModel,
  SUPPORTED_MODELS,
} from "./models.js";

describe("supported models", () => {
  it("lists a small set of OpenRouter ids with a label and a context window", () => {
    expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
    for (const m of SUPPORTED_MODELS) {
      expect(m.id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
      expect(m.contextTokens).toBeGreaterThan(0);
    }
    expect(new Set(SUPPORTED_MODELS.map((m) => m.id)).size).toBe(SUPPORTED_MODELS.length);
  });

  it("has a default that is on the list", () => {
    expect(isSupportedModel(DEFAULT_MODEL)).toBe(true);
    expect(isSupportedModel("vendor/unknown")).toBe(false);
  });

  it("warns, without rejecting, when agent.json names a model outside the list", () => {
    const r = parseAgentConfig({
      schemaVersion: 1,
      name: "A",
      roomId: "ops",
      model: "vendor/unknown",
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([expect.objectContaining({ level: "warn", path: "model" })]);
  });
});

describe("model routing (ADR-0015)", () => {
  const both = { anthropic: true, openrouter: true };
  const anthropicOnly = { anthropic: true, openrouter: false };
  const openrouterOnly = { anthropic: false, openrouter: true };
  const none = { anthropic: false, openrouter: false };

  it("maps Claude models to their Anthropic ids", () => {
    expect(anthropicModelId("anthropic/claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
    expect(anthropicModelId("anthropic/claude-haiku-5.5")).toBe("claude-haiku-5-5");
    expect(anthropicModelId("claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(anthropicModelId("openai/gpt-5.6-terra")).toBeUndefined();
    expect(anthropicModelId("gpt-5")).toBeUndefined();
  });

  it("sends Claude straight to Anthropic when there is an Anthropic key", () => {
    expect(routeModel("anthropic/claude-opus-5.5", both)).toEqual({
      ok: true,
      provider: "anthropic",
      modelId: "claude-opus-5-5",
    });
    expect(routeModel("anthropic/claude-opus-5.5", anthropicOnly)).toMatchObject({
      provider: "anthropic",
    });
  });

  it("sends Claude through OpenRouter when that is the only key", () => {
    expect(routeModel("anthropic/claude-opus-5.5", openrouterOnly)).toEqual({
      ok: true,
      provider: "openrouter",
      modelId: "anthropic/claude-opus-5.5",
    });
  });

  it("sends other vendors through OpenRouter, or says it needs an OpenRouter key", () => {
    expect(routeModel("openai/gpt-5.6-terra", both)).toMatchObject({ provider: "openrouter" });
    expect(routeModel("openai/gpt-5.6-terra", anthropicOnly)).toEqual({
      ok: false,
      reason: "needs_openrouter",
    });
  });

  it("never sends a bare Anthropic id to OpenRouter", () => {
    expect(routeModel("claude-opus-5-5", openrouterOnly)).toEqual({ ok: false, reason: "no_key" });
  });

  it("says when there is no key at all", () => {
    expect(routeModel("anthropic/claude-sonnet-5.5", none)).toEqual({
      ok: false,
      reason: "no_key",
    });
  });
});

describe("cost estimate", () => {
  it("prices every token class at the model's list price", () => {
    const usd = estimateCostUsd("claude-sonnet-5-5", {
      input: 1_000_000,
      cacheRead: 1_000_000,
      cacheWrite: 1_000_000,
      output: 1_000_000,
    });
    expect(usd).toBeCloseTo(2 + 0.1 + 2.5 + 10);
    expect(
      estimateCostUsd("anthropic/claude-opus-5.5", {
        input: 500_000,
        cacheRead: 0,
        cacheWrite: 0,
        output: 0,
      }),
    ).toBe(2);
  });

  it("is undefined for a model without a known price", () => {
    expect(
      estimateCostUsd("openai/gpt-5.6-terra", { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }),
    ).toBeUndefined();
  });
});

describe("per-conversation model settings (ADR-0016)", () => {
  it("falls through from the agent's model, a later layer winning field by field", () => {
    expect(resolveModelSettings("anthropic/claude-sonnet-5.5")).toEqual({
      model: "anthropic/claude-sonnet-5.5",
      provider: "auto",
      reasoning: "default",
    });
    expect(
      resolveModelSettings(
        "anthropic/claude-sonnet-5.5",
        { model: "anthropic/claude-opus-5.5", reasoning: "high" },
        undefined,
        { provider: "openrouter" },
      ),
    ).toEqual({ model: "anthropic/claude-opus-5.5", provider: "openrouter", reasoning: "high" });
  });

  it("accepts only known providers and reasoning levels, and nothing else", () => {
    expect(ModelSettings.safeParse({ provider: "anthropic", reasoning: "xhigh" }).success).toBe(
      true,
    );
    expect(ModelSettings.safeParse({ provider: "openai" }).success).toBe(false);
    expect(ModelSettings.safeParse({ reasoning: "ultra" }).success).toBe(false);
    expect(ModelSettings.safeParse({ temperature: 1 }).success).toBe(false);
  });

  it("forces Anthropic when asked, or says why it cannot", () => {
    const both = { anthropic: true, openrouter: true };
    expect(routeModel("anthropic/claude-opus-5.5", both, "anthropic")).toMatchObject({
      provider: "anthropic",
      modelId: "claude-opus-5-5",
    });
    expect(routeModel("openai/gpt-5.6-terra", both, "anthropic")).toEqual({
      ok: false,
      reason: "not_on_anthropic",
    });
    expect(
      routeModel("anthropic/claude-opus-5.5", { anthropic: false, openrouter: true }, "anthropic"),
    ).toEqual({ ok: false, reason: "needs_anthropic" });
  });

  it("forces OpenRouter when asked, even for Claude with an Anthropic key", () => {
    const both = { anthropic: true, openrouter: true };
    expect(routeModel("anthropic/claude-opus-5.5", both, "openrouter")).toEqual({
      ok: true,
      provider: "openrouter",
      modelId: "anthropic/claude-opus-5.5",
    });
    expect(routeModel("claude-opus-5-5", both, "openrouter")).toMatchObject({
      modelId: "anthropic/claude-opus-5.5",
    });
    expect(
      routeModel("anthropic/claude-opus-5.5", { anthropic: true, openrouter: false }, "openrouter"),
    ).toEqual({ ok: false, reason: "needs_openrouter" });
  });
});
