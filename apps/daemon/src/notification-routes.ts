import { MarkReadInput } from "@darthsaul/outerworld-ai-core";
import type { NotificationService } from "@darthsaul/outerworld-ai-runtime";
import { Hono } from "hono";
import { jsonApi, readBody } from "./http.js";

const intQuery = (value: string | undefined) => {
  const n = value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** The Notifications feed (brief §10): a page of the projection, and the shared read marker. */
export function notificationRoutes(notifications: NotificationService): Hono {
  const app = jsonApi(new Hono());
  app.get("/notifications", (c) => {
    const before = intQuery(c.req.query("before"));
    const limit = intQuery(c.req.query("limit"));
    return c.json(
      notifications.page({
        ...(before !== undefined ? { before } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }),
    );
  });
  app.post("/notifications/read", async (c) => {
    const { seq } = await readBody(c, MarkReadInput);
    const readSeq = notifications.markRead(seq);
    return c.json({ readSeq, unread: notifications.unread() });
  });
  return app;
}
