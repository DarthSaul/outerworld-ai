import { z } from "zod";

/**
 * The models v1 supports (brief §19: "support a small tested model list in v1"). Ids are
 * OpenRouter's, checked against https://openrouter.ai/api/v1/models on 2026-09-29; all support
 * tool calling. agent.json may name another id (hand edits); it loads with a warning.
 *
 * Claude models can also run directly on the Anthropic API with the Commander's own Anthropic key
 * (ADR-0015); `anthropicId` is the Anthropic model id and `pricing` the Anthropic list price,
 * used to estimate spend because the Anthropic API reports tokens, not dollars.
 */
export interface SupportedModel {
  readonly id: string;
  readonly label: string;
  /** One line on what it is for, under its name in a model menu. */
  readonly blurb: string;
  /** Context window, for windowing session history (Phase 3). */
  readonly contextTokens: number;
  /** The Anthropic API's id for this model, when Anthropic serves it directly. */
  readonly anthropicId?: string;
  /** Anthropic list price in USD per million tokens, checked 2026-11-11. */
  readonly pricing?: ModelPricing;
}

export interface ModelPricing {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  readonly cacheReadPerMTok: number;
  /** Five-minute cache writes: 1.25 × input. */
  readonly cacheWritePerMTok: number;
}

export const SUPPORTED_MODELS: readonly SupportedModel[] = [
  {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    blurb: "Fast and capable for everyday work",
    contextTokens: 1_000_000,
    anthropicId: "claude-sonnet-5-5",
    pricing: { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, cacheWritePerMTok: 2.5 },
  },
  {
    id: "anthropic/claude-opus-5.5",
    label: "Claude Opus 5.5",
    blurb: "For complex work and long tasks",
    contextTokens: 1_000_000,
    anthropicId: "claude-opus-5-5",
    pricing: { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 },
  },
  {
    id: "openai/gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    blurb: "OpenAI's model, through OpenRouter",
    contextTokens: 1_050_000,
  },
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    blurb: "Google's quick model, through OpenRouter",
    contextTokens: 1_048_576,
  },
];

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

export const isSupportedModel = (id: string): boolean => SUPPORTED_MODELS.some((m) => m.id === id);

/** The supported model an id names, by its OpenRouter id or its Anthropic id. */
export const findModel = (id: string): SupportedModel | undefined =>
  SUPPORTED_MODELS.find((m) => m.id === id || m.anthropicId === id);

/**
 * The Anthropic API id for a model id, or undefined when Anthropic does not serve it. A listed
 * model uses its `anthropicId`; an unlisted `anthropic/<name>` (a hand edit) maps by OpenRouter's
 * convention, dots to dashes; a bare `claude-…` id is already an Anthropic id.
 */
export function anthropicModelId(id: string): string | undefined {
  const listed = findModel(id);
  if (listed) return listed.anthropicId;
  if (id.startsWith("anthropic/")) return id.slice("anthropic/".length).replaceAll(".", "-");
  if (/^claude-[a-z0-9-]+$/.test(id)) return id;
  return undefined;
}

export type ModelProvider = "anthropic" | "openrouter";

/** Which key a model call uses: the routing rule below, or one provider by name (ADR-0016). */
export const ProviderChoice = z.enum(["auto", "anthropic", "openrouter"]);
export type ProviderChoice = z.infer<typeof ProviderChoice>;

/**
 * How hard the model thinks before answering (ADR-0016). `default` leaves it to the provider;
 * the rest are the AI SDK's levels, which each provider maps to its own (Anthropic effort,
 * OpenRouter `reasoning.effort`).
 */
export const ReasoningLevel = z.enum(["default", "none", "low", "medium", "high", "xhigh"]);
export type ReasoningLevel = z.infer<typeof ReasoningLevel>;

/**
 * A model choice that overrides the crew member's default, for one conversation or one
 * scheduled job (ADR-0016). Every field is optional: what is left out falls through.
 */
export const ModelSettings = z.strictObject({
  model: z.string().trim().min(1).max(200).optional(),
  provider: ProviderChoice.optional(),
  reasoning: ReasoningLevel.optional(),
});
export type ModelSettings = z.infer<typeof ModelSettings>;

/** Model settings with every field decided. */
export interface ResolvedModelSettings {
  readonly model: string;
  readonly provider: ProviderChoice;
  readonly reasoning: ReasoningLevel;
}

/**
 * The settings a run uses: the agent's model, then each layer in order (session, then a
 * schedule's or a single send's), a later field winning over an earlier one.
 */
export function resolveModelSettings(
  agentModel: string,
  ...layers: ReadonlyArray<ModelSettings | undefined>
): ResolvedModelSettings {
  let resolved: ResolvedModelSettings = {
    model: agentModel,
    provider: "auto",
    reasoning: "default",
  };
  for (const layer of layers) {
    if (!layer) continue;
    resolved = {
      model: layer.model ?? resolved.model,
      provider: layer.provider ?? resolved.provider,
      reasoning: layer.reasoning ?? resolved.reasoning,
    };
  }
  return resolved;
}

/** Which provider keys the runtime holds. Only whether one exists, never the key. */
export interface ProviderKeys {
  readonly anthropic: boolean;
  readonly openrouter: boolean;
}

export type ModelRoute =
  | { readonly ok: true; readonly provider: ModelProvider; readonly modelId: string }
  | {
      readonly ok: false;
      readonly reason: "no_key" | "needs_openrouter" | "needs_anthropic" | "not_on_anthropic";
    };

/**
 * Where a model call goes (ADR-0015): a Claude model goes straight to Anthropic when there is an
 * Anthropic key; everything else, and Claude when there is only an OpenRouter key, goes through
 * OpenRouter. A bare Anthropic id (`claude-…`) can only go to Anthropic.
 */
export function routeModel(
  id: string,
  keys: ProviderKeys,
  prefer: ProviderChoice = "auto",
): ModelRoute {
  const direct = anthropicModelId(id);
  if (prefer === "anthropic") {
    if (direct === undefined) return { ok: false, reason: "not_on_anthropic" };
    if (!keys.anthropic) return { ok: false, reason: "needs_anthropic" };
    return { ok: true, provider: "anthropic", modelId: direct };
  }
  if (prefer === "openrouter") {
    if (!keys.openrouter) return { ok: false, reason: "needs_openrouter" };
    // A bare Anthropic id has an OpenRouter twin under the `anthropic/` prefix.
    const listed = findModel(id);
    const openrouterId = listed ? listed.id : id.includes("/") ? id : `anthropic/${id}`;
    return { ok: true, provider: "openrouter", modelId: openrouterId };
  }
  if (direct !== undefined && keys.anthropic) {
    return { ok: true, provider: "anthropic", modelId: direct };
  }
  const bareAnthropic = direct !== undefined && !id.includes("/");
  if (keys.openrouter && !bareAnthropic) return { ok: true, provider: "openrouter", modelId: id };
  if (keys.anthropic && direct === undefined) return { ok: false, reason: "needs_openrouter" };
  return { ok: false, reason: "no_key" };
}

export interface TokenUsage {
  /** Input tokens not read from or written to the cache. */
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}

/** USD for one call at a model's list price, or undefined when its price is not known. */
export function estimateCostUsd(id: string, usage: TokenUsage): number | undefined {
  const p = findModel(id)?.pricing;
  if (!p) return undefined;
  return (
    (usage.input * p.inputPerMTok +
      usage.cacheRead * p.cacheReadPerMTok +
      usage.cacheWrite * p.cacheWritePerMTok +
      usage.output * p.outputPerMTok) /
    1_000_000
  );
}
