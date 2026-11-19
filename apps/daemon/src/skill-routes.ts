import { UpdateSkillInput } from "@darthsaul/outerworld-ai-core";
import type { CrewService } from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

/**
 * Skills (ADR-0021): the library with each skill's state, and the Commander's station-wide
 * on/off. A crew member's own skills change through `PATCH /api/agents/:id` (`skills`).
 */
export function skillRoutes(crew: CrewService): Hono {
  const api = jsonApi(new Hono());
  api.get("/skills", async (c) => c.json(await crew.skills()));
  api.put("/skills/:id", async (c) => {
    const { enabled } = await readBody(c, UpdateSkillInput);
    return c.json(await crew.setSkillOverride(c.req.param("id"), enabled));
  });
  return api;
}
