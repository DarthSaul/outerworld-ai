import {
  AgentDocumentName,
  CreateAgentInput,
  CreateRoomInput,
  DocumentInput,
  SUPPORTED_MODELS,
  UpdateAgentInput,
  UpdateBudgetsInput,
  UpdateRoomInput,
} from "@darthsaul/outerworld-ai-core";
import type { CrewService } from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

/**
 * `/api/station`, `/api/models`, `/api/agents/*`, `/api/rooms/*` (Phase 2): thin handlers over the
 * runtime's CrewService. Validation errors are 400, unknown ids 404, changes that would break the
 * station 409 (with the issues), non-JSON bodies 415.
 */
export function crewRoutes(crew: CrewService): Hono {
  const app = jsonApi(new Hono());

  app.get("/station", async (c) => c.json(await crew.view()));
  app.get("/models", (c) => c.json(SUPPORTED_MODELS));

  app.get("/agents/:id", async (c) => {
    const agent = await crew.agent(c.req.param("id"));
    return agent ? c.json(agent) : c.json({ error: "no such agent" }, 404);
  });
  app.post("/agents", async (c) =>
    c.json(await crew.createAgent(await readBody(c, CreateAgentInput)), 201),
  );
  app.patch("/agents/:id", async (c) =>
    c.json(await crew.updateAgent(c.req.param("id"), await readBody(c, UpdateAgentInput))),
  );
  app.put("/agents/:id/documents/:name", async (c) => {
    const name = AgentDocumentName.safeParse(c.req.param("name"));
    if (!name.success) return c.json({ error: "no such document" }, 404);
    const { text } = await readBody(c, DocumentInput);
    await crew.putDocument(c.req.param("id"), name.data, text);
    return c.body(null, 204);
  });
  app.delete("/agents/:id", async (c) => {
    await crew.deleteAgent(c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/rooms", async (c) =>
    c.json(await crew.createRoom(await readBody(c, CreateRoomInput)), 201),
  );
  app.patch("/rooms/:id", async (c) =>
    c.json(await crew.updateRoom(c.req.param("id"), await readBody(c, UpdateRoomInput))),
  );
  app.delete("/rooms/:id", async (c) => {
    await crew.deleteRoom(c.req.param("id"));
    return c.body(null, 204);
  });

  app.put("/budgets", async (c) =>
    c.json(await crew.updateBudgets(await readBody(c, UpdateBudgetsInput))),
  );

  return app;
}
