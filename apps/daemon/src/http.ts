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
}

/**
 * The shared rules for every JSON API router: bodies must be `application/json` (415, which also
 * blocks simple cross-site form posts) and at most 1 MiB (413); errors map to 400 (bad input or a
 * rejected key), 404 (unknown id), and 409 (the change would break the station).
 */
export function jsonApi(app: Hono): Hono {
  app.use("*", async (c, next) => {
    // Only requests that carry a body must be JSON; a bare POST (e.g. cancel) has none.
    if (["POST", "PUT", "PATCH"].includes(c.req.method) && c.req.raw.body !== null) {
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
