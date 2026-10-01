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

/** `use <tool> {json}`: the fake model's one trick, so tools and consent can be tried for free. */
const TOOL_REQUEST = /^use\s+([a-zA-Z0-9_-]+)\s*(\{[\s\S]*\})?\s*$/;

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/**
 * The scripted fake model (`OUTERWORLD_MODEL=fake`, tasks/todo.md D8): streams a fixed reply word
 * by word so development and browser checks need no key and make no network calls, and says
 * plainly that it is not a real model. A message of the form `use <tool> {json}` makes it call
 * that tool (if granted); after the result it reports what came back.
 */
export function scriptedModels(options: { chunkDelayInMs?: number } = {}): ModelFactory {
  return (modelId) =>
    new MockLanguageModelV4({
      provider: "outerworld-fake",
      modelId,
      doStream: async ({ prompt }) => {
        const messages = prompt as ReadonlyArray<{ role: string; content: unknown }>;
        const said = lastUserText(messages);
        const last = messages.at(-1);
        const request = TOOL_REQUEST.exec(said);
        if (request && last?.role === "user") {
          return {
            stream: simulateReadableStream({
              chunkDelayInMs: options.chunkDelayInMs ?? 40,
              chunks: [
                { type: "stream-start", warnings: [] },
                {
                  type: "tool-call",
                  toolCallId: `fake-${Date.now()}`,
                  toolName: request[1],
                  input: request[2] ?? "{}",
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_calls" },
                  usage,
                },
              ],
            }),
          } as never;
        }
        const reply =
          last?.role === "tool"
            ? `Scripted reply (fake model, no API call). The tool returned: ${JSON.stringify(last.content).slice(0, 300)}`
            : `Scripted reply (fake model, no API call). You said: “${said}”`;
        const words = reply.split(/(?<= )/);
        return {
          stream: simulateReadableStream({
            chunkDelayInMs: options.chunkDelayInMs ?? 40,
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              ...words.map((delta) => ({ type: "text-delta", id: "t", delta })),
              { type: "text-end", id: "t" },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
            ],
          }),
        } as never;
      },
    });
}
