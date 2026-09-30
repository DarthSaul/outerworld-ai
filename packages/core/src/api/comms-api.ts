import { z } from "zod";

/** The HTTP contract for sessions, runs, and settings (Phase 3), shared by daemon and SPA. */

/** A message to an agent; large enough for pasted notes, small enough to keep prompts sane. */
export const MAX_MESSAGE_CHARS = 100_000;

export const CreateSessionInput = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
});
export const UpdateSessionInput = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  archived: z.literal(true).optional(),
});
export const SendMessageInput = z.strictObject({
  text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
});
/** The OpenRouter key goes in once and never comes back out. */
export const ApiKeyInput = z.strictObject({ key: z.string().trim().min(1).max(500) });

export type CreateSessionInput = z.infer<typeof CreateSessionInput>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;
export type SendMessageInput = z.infer<typeof SendMessageInput>;
export type ApiKeyInput = z.infer<typeof ApiKeyInput>;

/** `GET /api/settings`: which models runs use, and whether a key is configured (never the key). */
export interface SettingsView {
  readonly modelMode: "openrouter" | "fake";
  readonly openrouter: {
    readonly configured: boolean;
    readonly source: "keychain" | "env" | null;
    readonly keychainError?: string;
  };
}
