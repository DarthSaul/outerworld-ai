import { ApproveMemoryInput, EditMemoryInput } from "@darthsaul/outerworld-ai-core";
import type { MemoryService } from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

/**
 * Memory review (brief §14): an agent's proposals awaiting the Commander and its stored beliefs;
 * approve (optionally edited), reject, edit, delete. A decided proposal is 409.
 */
export function memoryRoutes(memory: MemoryService): Hono {
  const app = jsonApi(new Hono());
  app.get("/agents/:id/memories", (c) => c.json(memory.view(c.req.param("id"))));
  app.post("/memories/:id/approve", async (c) => {
    const { text } = (await c.req.text()).trim()
      ? await readBody(c, ApproveMemoryInput)
      : { text: undefined };
    return c.json(memory.approve(c.req.param("id"), text));
  });
  app.post("/memories/:id/reject", (c) => c.json(memory.reject(c.req.param("id"))));
  app.patch("/memories/:id", async (c) => {
    const { text } = await readBody(c, EditMemoryInput);
    return c.json(memory.edit(c.req.param("id"), text));
  });
  app.delete("/memories/:id", (c) => {
    memory.delete(c.req.param("id"));
    return c.body(null, 204);
  });
  return app;
}
