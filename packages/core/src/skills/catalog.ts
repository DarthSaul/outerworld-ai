import type { AgentSkillsView, SkillListItem, SkillRef } from "../api/skills-api.js";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import { resolveGrants } from "../policy/grants.js";
import {
  capabilitiesOf,
  isGloballyEnabled,
  missingRequirements,
  type SkillSelection,
  skillOverride,
  skillsForAgent,
} from "./enablement.js";
import type { Requirement, Skill } from "./skill.js";

/**
 * What the station shows about skills (ADR-0023): the catalog under Abilities and each crew
 * member's offered and held-back skills. Pure; built from the same selection a run makes.
 */

const ref = (s: Skill): SkillRef => ({ id: s.id, name: s.name, description: s.description });

export function agentSkillsView(selection: SkillSelection): AgentSkillsView {
  return {
    offered: selection.offered.map(ref),
    unavailable: selection.unavailable.map((u) => ({ ...ref(u.skill), missing: u.missing })),
  };
}

/** Every skill in the library, by category then name, with its state on this station. */
export function skillCatalog(
  skills: readonly Skill[],
  station: StationConfig,
  agents: readonly { readonly id: string; readonly config: AgentConfig }[],
): SkillListItem[] {
  const offered = new Map<string, string[]>();
  const anyone = new Set<Requirement>();
  for (const a of agents) {
    for (const cap of capabilitiesOf(resolveGrants(a.config, station, {}))) anyone.add(cap);
    for (const s of skillsForAgent(a.config, station, skills).offered) {
      offered.set(s.id, [...(offered.get(s.id) ?? []), a.id]);
    }
  }
  return [...skills]
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .map((s) => ({
      ...ref(s),
      category: s.category,
      requires: s.requires,
      default: s.default,
      override: skillOverride(s.id, station.skills),
      globallyEnabled: isGloballyEnabled(s, station.skills),
      addedBy: agents.filter((a) => a.config.skills.includes(s.id)).map((a) => a.id),
      offeredTo: offered.get(s.id) ?? [],
      missing: missingRequirements(s, anyone),
    }));
}
