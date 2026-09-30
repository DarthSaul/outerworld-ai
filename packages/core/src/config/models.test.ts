import { describe, expect, it } from "vitest";
import { parseAgentConfig } from "./agent-config.js";
import { DEFAULT_MODEL, isSupportedModel, SUPPORTED_MODELS } from "./models.js";

describe("supported models", () => {
  it("lists a small set of OpenRouter ids with a label and a context window", () => {
    expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
    for (const m of SUPPORTED_MODELS) {
      expect(m.id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
      expect(m.label.length).toBeGreaterThan(0);
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
