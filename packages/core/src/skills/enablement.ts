import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import { type EffectiveTool, resolveGrants } from "../policy/grants.js";
import { isRequirement, type Requirement, type Skill } from "./skill.js";

/**
 * Which skills a crew member is offered (ADR-0023). A skill is enabled for an agent when it is on
 * station-wide (its `default`, unless the Commander overrode it) or the agent's own list names it;
 * an agent's list only adds. An enabled skill is offered only when the run has the tools it needs,
 * so the prompt never points at a recipe the agent cannot follow. Pure.
 */

/** Station-wide overrides of each skill's `default` (`station.json` → `skills`). */
export interface SkillOverrideLists {
  readonly enabled?: readonly string[];
  readonly disabled?: readonly string[];
}

/** On for every crew member? The Commander's override wins over the skill's default. */
export function isGloballyEnabled(
  skill: Skill,
  overrides: SkillOverrideLists | undefined,
): boolean {
  if (overrides?.disabled?.includes(skill.id)) return false;
  if (overrides?.enabled?.includes(skill.id)) return true;
  return skill.default;
}

/** The Commander's explicit choice for one skill, or null when the default stands. */
export function skillOverride(
  id: string,
  overrides: SkillOverrideLists | undefined,
): boolean | null {
  if (overrides?.disabled?.includes(id)) return false;
  if (overrides?.enabled?.includes(id)) return true;
  return null;
}

/** `overrides` with one skill set on, off, or back to its default (null). */
export function withSkillOverride(
  overrides: SkillOverrideLists | undefined,
  id: string,
  enabled: boolean | null,
): { enabled: string[]; disabled: string[] } {
  const enabledIds = (overrides?.enabled ?? []).filter((s) => s !== id);
  const disabledIds = (overrides?.disabled ?? []).filter((s) => s !== id);
  if (enabled === true) enabledIds.push(id);
  if (enabled === false) disabledIds.push(id);
  return { enabled: enabledIds, disabled: disabledIds };
}

const TOOL_CAPABILITY: Readonly<Record<string, Requirement>> = {
  web_fetch: "web",
  remember: "memory",
  dispatch: "dispatch",
};

/** Recipes needing files read, list, and write: `files` is met only with all three. */
const FILES_TOOLS = ["read_file", "list_files", "write_file"] as const;

/** What a run's effective tools let it do, in requirement terms. */
export function capabilitiesOf(tools: readonly EffectiveTool[]): Set<Requirement> {
  const caps = new Set<Requirement>();
  for (const t of tools) {
    const cap = TOOL_CAPABILITY[t.name];
    if (cap) caps.add(cap);
  }
  const names = new Set(tools.map((t) => t.name));
  if (FILES_TOOLS.every((n) => names.has(n))) caps.add("files");
  return caps;
}

/** The requirements `skill` declares that `caps` does not meet; unknown ones are never met. */
export function missingRequirements(skill: Skill, caps: ReadonlySet<Requirement>): string[] {
  return skill.requires.filter((r) => !isRequirement(r) || !caps.has(r));
}

export interface SkillSelectionInput {
  /** The whole library. */
  readonly skills: readonly Skill[];
  readonly overrides: SkillOverrideLists | undefined;
  /** The agent's own skill list (`agent.json` → `skills`); ids not in the library are ignored. */
  readonly agentSkills: readonly string[];
  /** The run's effective tools, before `skill_view` is added. */
  readonly tools: readonly EffectiveTool[];
}

export interface UnavailableSkill {
  readonly skill: Skill;
  readonly missing: readonly string[];
}

export interface SkillSelection {
  /** Enabled and runnable: the agent's own first, then station-wide, each by name. */
  readonly offered: readonly Skill[];
  /** Enabled but missing a capability; never offered. Same order. */
  readonly unavailable: readonly UnavailableSkill[];
}

const byName = (a: Skill, b: Skill) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function selectSkills(input: SkillSelectionInput): SkillSelection {
  const own = new Set(input.agentSkills);
  const mine = input.skills.filter((s) => own.has(s.id)).sort(byName);
  const station = input.skills
    .filter((s) => !own.has(s.id) && isGloballyEnabled(s, input.overrides))
    .sort(byName);
  const caps = capabilitiesOf(input.tools);
  const offered: Skill[] = [];
  const unavailable: UnavailableSkill[] = [];
  for (const skill of [...mine, ...station]) {
    const missing = missingRequirements(skill, caps);
    if (missing.length) unavailable.push({ skill, missing });
    else offered.push(skill);
  }
  return { offered, unavailable };
}

/**
 * An agent's skills from its config alone: what `skill_view` checks and what its page shows.
 * Capabilities come from role and props only (connector tools meet no requirement), so this
 * matches the run's selection whenever the built-in tools are registered, as the daemon does.
 */
export function skillsForAgent(
  agent: AgentConfig,
  station: StationConfig,
  skills: readonly Skill[],
): SkillSelection {
  return selectSkills({
    skills,
    overrides: station.skills,
    agentSkills: agent.skills,
    tools: resolveGrants(agent, station, {}),
  });
}
