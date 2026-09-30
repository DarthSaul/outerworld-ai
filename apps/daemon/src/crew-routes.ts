import {
  AgentDocumentName,
  CreateAgentInput,
  CreateRoomInput,
  DocumentInput,
  SUPPORTED_MODELS,
  UpdateAgentInput,
  UpdateRoomInput,
} from "@darthsaul/outerworld-ai-core";
import { ConflictError, type CrewService, NotFoundError } from "@darthsaul/outerworld-ai-runtime";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";

/** Request bodies are small JSON documents; the largest is one 256 KiB agent document. */
const MAX_BODY_BYTES = 1024 * 1024;

class BadRequest extends Error {
  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

const readBody = async <S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new BadRequest("body is not valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequest(
      "invalid request body",
      parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  return parsed.data;
};

/**
 * `/api/station`, `/api/models`, `/api/agents/*`, `/api/rooms/*` (Phase 2): thin handlers over the
 * runtime's CrewService. Validation errors are 400, unknown ids 404, changes that would break the
 * station 409 (with the issues), non-JSON bodies 415.
 */
export function crewRoutes(crew: CrewService): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      const type = c.req.header("content-type") ?? "";
      if (!type.startsWith("application/json")) {
        return c.json({ error: "request bodies must be application/json" }, 415);
      }
    }
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ error: `request bodies are limited to ${MAX_BODY_BYTES} bytes` }, 413),
    }),
  );

  app.onError((error, c) => {
    if (error instanceof BadRequest)
      return c.json({ error: error.message, issues: error.issues }, 400);
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof ConflictError) {
      return c.json({ error: error.message, issues: error.issues }, 409);
    }
    throw error;
  });

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

  return app;
}
