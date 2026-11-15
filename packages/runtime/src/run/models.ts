import { createAnthropic } from "@ai-sdk/anthropic";
import { type ProviderChoice, routeModel, TITLE_INSTRUCTIONS } from "@darthsaul/outerworld-ai-core";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { ApiKeyService } from "../secrets/api-key.js";

/** Options for building a model: which key to use (ADR-0016); `auto` when absent. */
export interface ModelOptions {
  readonly provider?: ProviderChoice;
}

export type ModelFactory = (
  modelId: string,
  options?: ModelOptions,
) => LanguageModel | Promise<LanguageModel>;

export class NoApiKeyError extends Error {
  constructor(
    message = "No model key: add an Anthropic or OpenRouter key in Settings › Providers",
  ) {
    super(message);
  }
}

const NO_ROUTE = {
  no_key: () => "No model key: add an Anthropic or OpenRouter key in Settings › Providers",
  needs_openrouter: (id: string) =>
    `"${id}" needs an OpenRouter key here: add one in Settings › Providers, or pick another key or model`,
  needs_anthropic: (id: string) =>
    `"${id}" is set to use the Anthropic key, but none is configured: add one in Settings › Providers`,
  not_on_anthropic: (id: string) =>
    `"${id}" is not an Anthropic model: choose OpenRouter or Auto for its key`,
} as const;

/** The provider keys live models read from; Anthropic is optional (ADR-0015). */
export interface LiveModelKeys {
  readonly openrouter: ApiKeyService;
  readonly anthropic?: ApiKeyService;
}

/**
 * Real models (ADR-0011, ADR-0015): Claude straight to Anthropic when there is an Anthropic key,
 * everything else through OpenRouter (core's `routeModel`). Keys are read from the keychain (or
 * the env fallback) at the start of every run, so a key added in Settings works without a restart.
 */
export function liveModels(keys: LiveModelKeys): ModelFactory {
  return async (modelId, options = {}) => {
    const [openrouterKey, anthropicKey] = await Promise.all([
      keys.openrouter.key(),
      keys.anthropic?.key(),
    ]);
    const route = routeModel(
      modelId,
      { openrouter: openrouterKey !== undefined, anthropic: anthropicKey !== undefined },
      options.provider ?? "auto",
    );
    if (!route.ok) throw new NoApiKeyError(NO_ROUTE[route.reason](modelId));
    if (route.provider === "anthropic" && anthropicKey !== undefined) {
      return createAnthropic({ apiKey: anthropicKey })(route.modelId);
    }
    return createOpenRouter({
      apiKey: openrouterKey ?? "",
      compatibility: "strict",
      headers: { "X-Title": "Outerworld AI" },
    }).chat(route.modelId);
  };
}

/** OpenRouter only: {@link liveModels} without an Anthropic key. */
export const openRouterModels = (keys: ApiKeyService): ModelFactory =>
  liveModels({ openrouter: keys });

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
        if (messages.find((m) => m.role === "system")?.content === TITLE_INSTRUCTIONS) {
          // A session title: the message's first few words, so dev sessions read sensibly.
          const title = said.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
          return {
            stream: simulateReadableStream({
              chunkDelayInMs: options.chunkDelayInMs ?? 40,
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: title || "Scripted session" },
                { type: "text-end", id: "t" },
                { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
              ],
            }),
          } as never;
        }
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
