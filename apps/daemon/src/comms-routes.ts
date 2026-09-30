import {
  ApiKeyInput,
  CreateSessionInput,
  SendMessageInput,
  type SettingsView,
  UpdateSessionInput,
} from "@darthsaul/outerworld-ai-core";
import {
  type ApiKeyService,
  type CrewService,
  NotFoundError,
  type RunRecord,
  type RunService,
  type SessionRecord,
  type SessionStore,
  type StoredMessage,
} from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

/** `GET /api/sessions/:id`: the session, its messages oldest first, and its runs newest first. */
export interface SessionDetail {
  readonly session: SessionRecord;
  readonly messages: readonly StoredMessage[];
  readonly runs: readonly RunRecord[];
}

export interface CommsDeps {
  readonly crew: CrewService;
  readonly runs: RunService;
  readonly sessions: SessionStore;
  readonly apiKeys: ApiKeyService;
  readonly modelMode: "openrouter" | "fake";
}

/**
 * Sessions, runs, and settings (Phase 3). Sending a message returns 202 with the run id at once;
 * the reply streams as events. The OpenRouter key goes in through PUT and never comes back out.
 */
export function commsRoutes(deps: CommsDeps): Hono {
  const app = jsonApi(new Hono());
  const { crew, runs, sessions } = deps;

  const session = (id: string) => {
    const s = sessions.getSession(id);
    if (!s) throw new NotFoundError(`no session "${id}"`);
    return s;
  };

  app.get("/agents/:id/sessions", (c) =>
    c.json(
      sessions.listSessions(c.req.param("id"), {
        includeArchived: c.req.query("archived") === "1",
      }),
    ),
  );
  app.post("/agents/:id/sessions", async (c) => {
    const agentId = c.req.param("id");
    const { title } = await readBody(c, CreateSessionInput);
    if (!(await crew.agent(agentId))) throw new NotFoundError(`no agent "${agentId}"`);
    return c.json(runs.createSession(agentId, title), 201);
  });

  app.get("/sessions/:id", (c) => {
    const s = session(c.req.param("id"));
    const detail: SessionDetail = {
      session: s,
      messages: sessions.messages(s.id),
      runs: sessions.runs(s.id),
    };
    return c.json(detail);
  });
  app.patch("/sessions/:id", async (c) => {
    const s = session(c.req.param("id"));
    const input = await readBody(c, UpdateSessionInput);
    let result = s;
    if (input.title !== undefined) result = runs.renameSession(s.id, input.title);
    if (input.archived) result = runs.archiveSession(s.id);
    return c.json(result);
  });
  app.post("/sessions/:id/messages", async (c) => {
    const { text } = await readBody(c, SendMessageInput);
    return c.json(await runs.send(c.req.param("id"), text), 202);
  });

  app.post("/runs/:id/cancel", async (c) => {
    await runs.cancel(c.req.param("id"));
    return c.body(null, 202);
  });

  app.get("/settings", async (c) => {
    const view: SettingsView = {
      modelMode: deps.modelMode,
      openrouter: await deps.apiKeys.status(),
    };
    return c.json(view);
  });
  app.put("/settings/openrouter", async (c) => {
    const { key } = await readBody(c, ApiKeyInput);
    await deps.apiKeys.setKey(key);
    return c.body(null, 204);
  });
  app.delete("/settings/openrouter", async (c) => {
    await deps.apiKeys.clearKey();
    return c.body(null, 204);
  });

  return app;
}
