import {
  AddConnectorInput,
  CONNECTOR_PRESETS,
  ConnectorClientInput,
  DisconnectInput,
  UpdateConnectorInput,
} from "@darthsaul/outerworld-ai-core";
import type {
  ConnectorManager,
  ConnectorView,
  CrewService,
} from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

/** `GET /api/connectors`: each connector's status and tools, and which crew are granted it. */
export interface ConnectorListItem extends ConnectorView {
  readonly grantedTo: readonly string[];
}

/**
 * `/api/connectors/*` (ADR-0012, ADR-0019): install a preset (Notion, GitHub, Gmail), change a
 * connector's URL, store the Commander's own OAuth client for a server that registers none,
 * remove it, connect (which may answer with a sign-in URL), and disconnect (optionally
 * forgetting the stored sign-in). Station changes refresh the manager.
 */
export function connectorRoutes(deps: { crew: CrewService; connectors: ConnectorManager }): Hono {
  const app = jsonApi(new Hono());
  const { crew, connectors } = deps;

  app.get("/connectors", async (c) => {
    await connectors.refresh();
    const view = await crew.view();
    const list: ConnectorListItem[] = connectors.views().map((v) => ({
      ...v,
      grantedTo: view.agents
        .filter((a) => a.config.connectorGrants.includes(v.id))
        .map((a) => a.id),
    }));
    return c.json(list);
  });

  app.post("/connectors", async (c) => {
    const { preset } = await readBody(c, AddConnectorInput);
    const added = await crew.addConnector(CONNECTOR_PRESETS[preset]);
    await connectors.refresh();
    return c.json(added, 201);
  });

  app.patch("/connectors/:id", async (c) => {
    const input = await readBody(c, UpdateConnectorInput);
    const updated = await crew.updateConnector(c.req.param("id"), {
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
    });
    await connectors.refresh();
    return c.json(updated);
  });

  // The client secret goes to the keychain only; the list reports just whether one is stored.
  app.put("/connectors/:id/client", async (c) => {
    const input = await readBody(c, ConnectorClientInput);
    await connectors.refresh();
    await connectors.setOwnClient(c.req.param("id"), input);
    return c.body(null, 204);
  });

  app.delete("/connectors/:id", async (c) => {
    const id = c.req.param("id");
    await crew.removeConnector(id);
    await connectors.disconnect(id, { forget: true, ownClient: true });
    await connectors.refresh();
    return c.body(null, 204);
  });

  app.post("/connectors/:id/connect", async (c) => {
    await connectors.refresh();
    return c.json(await connectors.connect(c.req.param("id")));
  });

  app.post("/connectors/:id/disconnect", async (c) => {
    // The body is optional: a bare POST disconnects without forgetting.
    const { forget } = (await c.req.text()).trim()
      ? await readBody(c, DisconnectInput)
      : { forget: false };
    await connectors.disconnect(c.req.param("id"), { forget: forget ?? false });
    return c.body(null, 204);
  });

  return app;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family: system-ui, sans-serif; padding: 2rem"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`;

/**
 * `GET /oauth/callback/:id`: where the connector's sign-in returns. It cannot carry the API token
 * (the browser arrives from Notion), so it accepts only the one-time `state` of a sign-in the
 * SPA started; anything else is refused.
 */
export function oauthCallback(connectors: ConnectorManager): Hono {
  const app = new Hono();
  app.get("/oauth/callback/:id", async (c) => {
    const id = c.req.param("id");
    const error = c.req.query("error");
    const state = c.req.query("state");
    if (error) {
      // The service's text is shown only for the sign-in this daemon started (its state): anyone
      // can open this URL with words of their choosing.
      const ours = state !== undefined && connectors.cancelAuth(id, state);
      return c.html(
        page(
          "Sign-in was not completed",
          ours
            ? `The service said: ${error}. You can close this tab and try again.`
            : "You can close this tab and try again from Outerworld AI.",
        ),
        400,
      );
    }
    const code = c.req.query("code");
    if (!code || !state)
      return c.html(page("Sign-in failed", "The response had no code or state."), 400);
    try {
      const result = await connectors.finishAuth(id, code, state, c.req.query("iss"));
      if (result.status !== "connected") {
        return c.html(
          page(
            "Signed in, but not connected",
            result.detail ?? "Try Connect again from Outerworld AI.",
          ),
          502,
        );
      }
      return c.html(page("Connected", "You can close this tab and return to Outerworld AI."));
    } catch (e) {
      return c.html(page("Sign-in failed", e instanceof Error ? e.message : String(e)), 400);
    }
  });
  return app;
}
