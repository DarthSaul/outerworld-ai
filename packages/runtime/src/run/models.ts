import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { ApiKeyService } from "../secrets/api-key.js";

export type ModelFactory = (modelId: string) => LanguageModel | Promise<LanguageModel>;

export class NoApiKeyError extends Error {
  constructor() {
    super("No OpenRouter key: add one in Settings");
  }
}

/**
 * Real models through OpenRouter (ADR-0011). The key is read from the keychain (or the env
 * fallback) at the start of every run, so a key added in Settings works without a restart.
 */
export function openRouterModels(keys: ApiKeyService): ModelFactory {
  return async (modelId) => {
    const apiKey = await keys.key();
    if (!apiKey) throw new NoApiKeyError();
    return createOpenRouter({
      apiKey,
      compatibility: "strict",
      headers: { "X-Title": "Outerworld AI" },
    }).chat(modelId);
  };
}

const lastUserText = (prompt: ReadonlyArray<{ role: string; content: unknown }>): string => {
  const last = [...prompt].reverse().find((m) => m.role === "user");
  const content = last?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : ""))
      .join("");
  }
  return "";
};

/**
 * The scripted fake model (`OUTERWORLD_MODEL=fake`, tasks/todo.md D8): streams a fixed reply word
 * by word so development and browser checks need no key and make no network calls. It never
 * calls tools and says plainly that it is not a real model.
 */
export function scriptedModels(options: { chunkDelayInMs?: number } = {}): ModelFactory {
  return (modelId) =>
    new MockLanguageModelV4({
      provider: "outerworld-fake",
      modelId,
      doStream: async ({ prompt }) => {
        const said = lastUserText(prompt as ReadonlyArray<{ role: string; content: unknown }>);
        const words = `Scripted reply (fake model, no API call). You said: “${said}”`.split(
          /(?<= )/,
        );
        return {
          stream: simulateReadableStream({
            chunkDelayInMs: options.chunkDelayInMs ?? 40,
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              ...words.map((delta) => ({ type: "text-delta", id: "t", delta })),
              { type: "text-end", id: "t" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 0, text: 0, reasoning: 0 },
                },
              },
            ],
          }),
        } as never;
      },
    });
}
