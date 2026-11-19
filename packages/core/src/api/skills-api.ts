import { z } from "zod";

/**
 * Skills HTTP contract (ADR-0023). The library is read-only; the Commander turns skills on or off
 * station-wide (`PUT /api/skills/:id`) and adds them to one crew member through
 * `PATCH /api/agents/:id` (`skills`).
 */

/** A skill as the station sees it: never its body, which only the agent reads (`skill_view`). */
export interface SkillRef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/** `GET /api/skills`: one row per skill in the library, by category then name. */
export interface SkillListItem extends SkillRef {
  readonly category: string;
  readonly requires: readonly string[];
  /** The library's own default. */
  readonly default: boolean;
  /** The Commander's station-wide choice, or null when the default stands. */
  readonly override: boolean | null;
  /** On for every crew member (override, else default). */
  readonly globallyEnabled: boolean;
  /** Crew members who have it in their own list. */
  readonly addedBy: readonly string[];
  /** Crew members it is actually offered to: enabled for them, and they have its tools. */
  readonly offeredTo: readonly string[];
  /** Requirements no crew member on this station can meet (e.g. `shell` in v1). */
  readonly missing: readonly string[];
}

/** A crew member's skills, as its page shows them; the same selection the run makes. */
export interface AgentSkillsView {
  readonly offered: readonly SkillRef[];
  readonly unavailable: readonly (SkillRef & { readonly missing: readonly string[] })[];
}

/** `PUT /api/skills/:id`: on or off for every crew member, or `null` for the skill's default. */
export const UpdateSkillInput = z.strictObject({ enabled: z.boolean().nullable() });
export type UpdateSkillInput = z.infer<typeof UpdateSkillInput>;
