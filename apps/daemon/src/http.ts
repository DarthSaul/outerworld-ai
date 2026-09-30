import { ConflictError, InvalidKeyError, NotFoundError } from "@darthsaul/outerworld-ai-runtime";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { z } from "zod";

/** Request bodies are small JSON documents; the largest is one 256 KiB agent document. */
export const MAX_BODY_BYTES = 1024 * 1024;

export class BadRequest extends Error {
  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/** Parses the JSON body with a core schema, or throws BadRequest with the issues. */
export async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    // Read as text once (the JSON check may already have read it) and parse from that.
    raw = JSON.parse(await c.req.text());
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
}

/**
 * Request rules for every `/api` request, applied once by the app (applying them per router would
 * run the size limiter again over a body already read): bodies at most 1 MiB (413), and a request
 * with content must send JSON (415, which also blocks simple cross-site form posts). A bare POST
 * (cancel, connect) has no content; over real HTTP it still has an empty body stream, so the check
 * looks at the content, not the stream.
 */
export function apiRequestRules(app: Hono, path: string): void {
  app.use(
    path,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json({ error: `request bodies are limited to ${MAX_BODY_BYTES} bytes` }, 413),
    }),
  );
  app.use(path, async (c, next) => {
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      const type = c.req.header("content-type") ?? "";
      if (!type.startsWith("application/json") && (await c.req.text()).length > 0) {
        return c.json({ error: "request bodies must be application/json" }, 415);
      }
    }
    await next();
  });
}

/** Error mapping for a JSON API router: 400 (bad input or a rejected key), 404, 409. */
export function jsonApi(app: Hono): Hono {
  app.onError((error, c) => {
    if (error instanceof BadRequest) {
      return c.json({ error: error.message, issues: error.issues }, 400);
    }
    if (error instanceof InvalidKeyError) return c.json({ error: error.message }, 400);
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof ConflictError) {
      return c.json({ error: error.message, issues: error.issues }, 409);
    }
    throw error;
  });
  return app;
}
