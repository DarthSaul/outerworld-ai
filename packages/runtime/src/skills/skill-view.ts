import { type Skill, skillsForAgent } from "@darthsaul/outerworld-ai-core";
import { z } from "zod";
import type { ToolImpl } from "../run/run-service.js";
import { loadStationDir } from "../storage/station-dir.js";

const Input = z.strictObject({ id: z.string().trim().min(1).max(200) });

/**
 * `skill_view` (ADR-0021): returns one skill's full recipe. It answers only for a skill offered to
 * the calling agent, recomputed from the station's config at call time, so a name the agent never
 * saw (or one turned off since) is refused. Read-class: it changes nothing.
 */
export function createSkillViewTool(deps: {
  readonly home: string;
  readonly skills: readonly Skill[];
}): ToolImpl {
  return {
    description:
      "Read the full recipe of one of your installed skills, by its id from the Installed skills list. Read it before doing a task the skill matches, then follow it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The skill's id, e.g. web-research" } },
      required: ["id"],
      additionalProperties: false,
    },
    class: "read",
    async execute(input, ctx) {
      const parsed = Input.safeParse(input);
      if (!parsed.success) throw new Error('invalid input: give the skill\'s "id"');
      const { id } = parsed.data;
      const loaded = await loadStationDir(deps.home);
      const agent = loaded.agents.find((a) => a.id === ctx.agentId);
      if (!agent || !loaded.station) throw new Error("no station config to check skills against");
      const { offered } = skillsForAgent(agent.config, loaded.station, deps.skills);
      const skill = offered.find((s) => s.id === id);
      if (!skill) {
        const ids = offered.map((s) => s.id).join(", ") || "none";
        throw new Error(`"${id}" is not one of your installed skills (yours: ${ids})`);
      }
      return { id: skill.id, name: skill.name, body: skill.body };
    },
  };
}
