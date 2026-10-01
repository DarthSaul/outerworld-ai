/**
 * The models v1 supports (brief §19: "support a small tested model list in v1"). Ids are
 * OpenRouter's, checked against https://openrouter.ai/api/v1/models on 2026-09-29; all support
 * tool calling. agent.json may name another id (hand edits); it loads with a warning.
 */
export interface SupportedModel {
  readonly id: string;
  readonly label: string;
  /** Context window, for windowing session history (Phase 3). */
  readonly contextTokens: number;
}

export const SUPPORTED_MODELS: readonly SupportedModel[] = [
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", contextTokens: 1_000_000 },
  { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5", contextTokens: 1_000_000 },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", contextTokens: 1_050_000 },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", contextTokens: 1_048_576 },
];

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

export const isSupportedModel = (id: string): boolean => SUPPORTED_MODELS.some((m) => m.id === id);
