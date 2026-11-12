import { jsonSchema, streamText } from "ai";
import { describe, expect, it } from "vitest";
import { ANTHROPIC_PROVIDER, ApiKeyService } from "../secrets/api-key.js";
import { MemorySecretStore } from "../secrets/store.js";
import { liveModels, NoApiKeyError, openRouterModels, scriptedModels } from "./models.js";

describe("scriptedModels", () => {
  it("streams a reply that quotes the Commander and says it is fake", async () => {
    const model = await scriptedModels({ chunkDelayInMs: 0 })("anthropic/claude-sonnet-5.5");
    const result = streamText({ model, messages: [{ role: "user", content: "Status?" }] });
    const deltas: string[] = [];
    for await (const part of result.stream) if (part.type === "text-delta") deltas.push(part.text);
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.join("")).toBe("Scripted reply (fake model, no API call). You said: “Status?”");
  });

  it("calls a tool when asked with `use <tool> {json}`, then reports the result", async () => {
    const model = await scriptedModels({ chunkDelayInMs: 0 })("m");
    const first = streamText({
      model,
      messages: [{ role: "user", content: 'use write_file {"path":"a.md","content":"hi"}' }],
      tools: { write_file: { inputSchema: jsonSchema({ type: "object" }) } },
    });
    const calls = await first.toolCalls;
    expect(calls).toEqual([
      expect.objectContaining({ toolName: "write_file", input: { path: "a.md", content: "hi" } }),
    ]);
    const second = streamText({
      model,
      messages: [
        { role: "user", content: "use write_file {}" },
        ...(await first.responseMessages),
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: calls[0]?.toolCallId ?? "",
              toolName: "write_file",
              output: { type: "json", value: { bytes: 2 } },
            },
          ],
        },
      ],
    });
    expect(await second.text).toMatch(/The tool returned: .*bytes/);
  });
});

describe("openRouterModels", () => {
  const keys = (env: Record<string, string>) =>
    new ApiKeyService({ store: new MemorySecretStore(), env });

  it("refuses to build a model without a key, with a message that says what to do", async () => {
    await expect(openRouterModels(keys({}))("anthropic/claude-sonnet-5.5")).rejects.toBeInstanceOf(
      NoApiKeyError,
    );
  });

  it("builds an OpenRouter chat model for the id when a key is configured (no network)", async () => {
    const model = await openRouterModels(keys({ OPENROUTER_API_KEY: "sk-or-test-0000000000" }))(
      "anthropic/claude-sonnet-5.5",
    );
    expect(model).toMatchObject({ modelId: "anthropic/claude-sonnet-5.5" });
  });
});

describe("liveModels (ADR-0015)", () => {
  const ant = (env: Record<string, string>) =>
    new ApiKeyService({ store: new MemorySecretStore(), env, provider: ANTHROPIC_PROVIDER });
  const or = (env: Record<string, string>) =>
    new ApiKeyService({ store: new MemorySecretStore(), env });
  const ANT = { ANTHROPIC_API_KEY: "sk-ant-test-0000000000" };
  const OR = { OPENROUTER_API_KEY: "sk-or-test-0000000000" };

  it("sends Claude straight to Anthropic when there is an Anthropic key (no network)", async () => {
    const model = await liveModels({ openrouter: or(OR), anthropic: ant(ANT) })(
      "anthropic/claude-opus-5.5",
    );
    expect(model).toMatchObject({ modelId: "claude-opus-5-5" });
    expect((model as { provider: string }).provider).toMatch(/^anthropic/);
  });

  it("sends other vendors through OpenRouter", async () => {
    const model = await liveModels({ openrouter: or(OR), anthropic: ant(ANT) })(
      "openai/gpt-5.6-terra",
    );
    expect(model).toMatchObject({ modelId: "openai/gpt-5.6-terra" });
  });

  it("says a non-Claude model needs an OpenRouter key when only Anthropic's is set", async () => {
    await expect(
      liveModels({ openrouter: or({}), anthropic: ant(ANT) })("openai/gpt-5.6-terra"),
    ).rejects.toThrow(/OpenRouter key/);
  });

  it("uses the key the conversation chose, even for Claude with both keys set (ADR-0016)", async () => {
    const model = await liveModels({ openrouter: or(OR), anthropic: ant(ANT) })(
      "anthropic/claude-opus-5.5",
      { provider: "openrouter" },
    );
    expect(model).toMatchObject({ modelId: "anthropic/claude-opus-5.5" });
    expect((model as { provider: string }).provider).toMatch(/openrouter/);
    await expect(
      liveModels({ openrouter: or(OR), anthropic: ant({}) })("anthropic/claude-opus-5.5", {
        provider: "anthropic",
      }),
    ).rejects.toThrow(/Anthropic key/);
  });

  it("refuses without any key, naming both providers", async () => {
    await expect(
      liveModels({ openrouter: or({}), anthropic: ant({}) })("anthropic/claude-sonnet-5.5"),
    ).rejects.toThrow(/Anthropic or OpenRouter/);
  });
});
