import { z } from "zod";
import { AgentConfig, AgentRole, ApprovalMode, Schedule } from "../config/agent-config.js";
import { Prop, type StationConfig } from "../config/station-config.js";
import type { EffectiveTool } from "../policy/grants.js";
import { Id, type Issue } from "../schema/common.js";
import { Rig } from "../schema/station.js";

/**
 * The HTTP contract for crew and rooms (Phase 2), shared by the daemon (validation) and the SPA
 * (types). Update inputs are strict: an unknown field is an error, not silently dropped.
 */

/** The four markdown documents that make up a crew member (brief §9). */
export const AGENT_DOCUMENTS = ["identity", "purpose", "standing-orders", "context"] as const;
export type AgentDocumentName = (typeof AGENT_DOCUMENTS)[number];
export const AgentDocumentName = z.enum(AGENT_DOCUMENTS);

/** Documents longer than this crowd out the prompt; the editor and the loader both enforce it. */
export const MAX_DOCUMENT_BYTES = 256 * 1024;

export const CreateAgentInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  roomId: Id,
  role: AgentRole.optional(),
  model: z.string().min(1).optional(),
  approvalMode: ApprovalMode.optional(),
});

export const UpdateAgentInput = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  roomId: Id.optional(),
  role: AgentRole.optional(),
  model: z.string().min(1).optional(),
  approvalMode: ApprovalMode.optional(),
  connectorGrants: z.array(Id).optional(),
  rig: Rig.optional(),
  look: AgentConfig.shape.look,
});

/** A scheduled prompt is sent like a Commander's message, so it has the same practical limit. */
const SchedulePrompt = z.string().trim().min(1).max(8000);

/** `POST /api/agents/:id/schedules`: the id is made by the runtime. */
export const CreateScheduleInput = z.strictObject({
  cron: Schedule.shape.cron,
  timezone: Schedule.shape.timezone,
  prompt: SchedulePrompt,
  catchUp: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

/** `PATCH /api/agents/:id/schedules/:scheduleId`; `timezone: null` goes back to the machine's zone. */
export const UpdateScheduleInput = z.strictObject({
  cron: Schedule.shape.cron.optional(),
  timezone: Schedule.shape.timezone.unwrap().nullable().optional(),
  prompt: SchedulePrompt.optional(),
  catchUp: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const DocumentInput = z.strictObject({
  text: z
    .string()
    .refine(
      (t) => new TextEncoder().encode(t).length <= MAX_DOCUMENT_BYTES,
      `documents are limited to ${MAX_DOCUMENT_BYTES} bytes`,
    ),
});

export const CreateRoomInput = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  props: z.array(Prop).optional(),
});

export const UpdateRoomInput = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  props: z.array(Prop).optional(),
});

/** `PUT /api/budgets`: each cap in USD, or `null` for no cap. Missing fields keep their value. */
const Cap = z.number().positive().max(100_000).nullable().optional();
export const UpdateBudgetsInput = z.strictObject({
  perRunUsd: Cap,
  perAgentDailyUsd: Cap,
  stationDailyUsd: Cap,
});

/** Overseer tones offered at onboarding; the runtime turns each into a line of its identity. */
export const OVERSEER_TONES = ["calm", "warm", "brisk"] as const;
export const OverseerTone = z.enum(OVERSEER_TONES);

/** `POST /api/onboarding`: creates station.json and the Overseer on an empty station. */
export const OnboardInput = z.strictObject({
  stationName: z.string().trim().min(1).max(80).optional(),
  overseerName: z.string().trim().min(1).max(80),
  tone: OverseerTone,
});

/** Crew templates (brief §17). */
export const CREW_TEMPLATES = ["project-manager"] as const;
export const CrewTemplate = z.enum(CREW_TEMPLATES);

/** `POST /api/templates/:template`: adds a crew member from a template, with a name of your own. */
export const TemplateInput = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentInput>;
export type OverseerTone = z.infer<typeof OverseerTone>;
export type OnboardInput = z.infer<typeof OnboardInput>;
export type CrewTemplate = z.infer<typeof CrewTemplate>;
export type TemplateInput = z.infer<typeof TemplateInput>;
export type UpdateBudgetsInput = z.infer<typeof UpdateBudgetsInput>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;
export type DocumentInput = z.infer<typeof DocumentInput>;
export type CreateScheduleInput = z.infer<typeof CreateScheduleInput>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInput>;
export type CreateRoomInput = z.infer<typeof CreateRoomInput>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomInput>;

/** `GET /api/station`: the station config, its crew, and every issue found loading them. */
export interface StationView {
  readonly station?: StationConfig;
  readonly agents: readonly { readonly id: string; readonly config: AgentConfig }[];
  readonly issues: readonly Issue[];
}

/** `GET /api/agents/:id`: config, documents, and the effective tools the runtime would grant. */
export interface AgentView {
  readonly id: string;
  readonly config: AgentConfig;
  readonly documents: Readonly<Record<AgentDocumentName, string>>;
  readonly tools: readonly EffectiveTool[];
}

/**
 * A lowercase kebab id from a display name, unique among `taken`: `"Project Manager"` becomes
 * `project-manager`, then `project-manager-2`. Accents are folded; a name with no usable
 * characters becomes `item`. Never a JavaScript object property name.
 */
export function slugify(name: string, taken: readonly string[]): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item";
  const used = new Set(taken);
  const free = (id: string) => !used.has(id) && Id.safeParse(id).success;
  if (free(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (free(candidate)) return candidate;
  }
}
