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

/** The Commander's answer to a consent request. */
export const ConsentDecisionInput = z.strictObject({ decision: z.enum(["approved", "denied"]) });
export const KillSwitchInput = z.strictObject({ engaged: z.boolean() });

export type ConsentDecisionInput = z.infer<typeof ConsentDecisionInput>;
export type KillSwitchInput = z.infer<typeof KillSwitchInput>;

/** `GET /api/spend`: USD spent on one UTC day, station-wide and per agent. */
export interface SpendView {
  readonly day: string;
  readonly stationUsd: number;
  readonly agents: Readonly<Record<string, number>>;
}

/** Connectors (ADR-0012): the Notion preset, a URL change, and disconnecting. */
export const AddConnectorInput = z.strictObject({ preset: z.literal("notion") });
export const UpdateConnectorInput = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});
export const DisconnectInput = z.strictObject({ forget: z.boolean().optional() });

export type AddConnectorInput = z.infer<typeof AddConnectorInput>;
export type UpdateConnectorInput = z.infer<typeof UpdateConnectorInput>;
export type DisconnectInput = z.infer<typeof DisconnectInput>;

/** Approving a memory proposal, optionally with the Commander's edit; editing a belief. */
export const ApproveMemoryInput = z.strictObject({
  text: z.string().trim().min(1).max(2000).optional(),
});
export const EditMemoryInput = z.strictObject({ text: z.string().trim().min(1).max(2000) });

export type ApproveMemoryInput = z.infer<typeof ApproveMemoryInput>;
export type EditMemoryInput = z.infer<typeof EditMemoryInput>;

export type CreateSessionInput = z.infer<typeof CreateSessionInput>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;
export type SendMessageInput = z.infer<typeof SendMessageInput>;
export type ApiKeyInput = z.infer<typeof ApiKeyInput>;

/** `GET /api/settings`: which models runs use, and whether a key is configured (never the key). */
export interface SettingsView {
  readonly modelMode: "openrouter" | "fake";
  /** The machine's IANA zone: where a schedule with no zone of its own runs. */
  readonly timezone: string;
  readonly openrouter: {
    readonly configured: boolean;
    readonly source: "keychain" | "env" | null;
    readonly keychainError?: string;
  };
}

/** `POST /api/notifications/read`: everything up to `seq` has been seen. */
export const MarkReadInput = z.strictObject({ seq: z.number().int().nonnegative() });
export type MarkReadInput = z.infer<typeof MarkReadInput>;
