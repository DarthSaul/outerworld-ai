import { z } from "zod";

/** Current Station / status / StationState schema version. See ADR-0009. */
export const SCHEMA_VERSION = 1 as const;

/** Something the parser could not prove or accept. Never thrown; always reported. */
export interface Issue {
  readonly level: "warn" | "error";
  readonly path: string;
  readonly message: string;
}

/** Every parse returns this. `ok: true` may still carry warnings. */
export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly Issue[] }
  | { readonly ok: false; readonly issues: readonly Issue[] };

/** Ids are lowercase kebab: stable in filenames, URLs, and prompts. */
export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase letters, digits, and hyphens");

export const Hue = z.number().min(0).max(360);

export const Timestamp = z.iso.datetime({ offset: true });

/**
 * Any positive integer is accepted at the type level so a newer document can be read
 * best-effort; `versionIssues` turns a newer version into a warning.
 */
export const SchemaVersion = z.number().int().positive();

export function versionIssues(version: number, path = "schemaVersion"): Issue[] {
  if (version === SCHEMA_VERSION) return [];
  if (version > SCHEMA_VERSION) {
    return [
      {
        level: "warn",
        path,
        message: `document is schema version ${version}; this build reads ${SCHEMA_VERSION}. Reading known fields only.`,
      },
    ];
  }
  return [
    {
      level: "error",
      path,
      message: `schema version ${version} has no migration to ${SCHEMA_VERSION}`,
    },
  ];
}

export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => ({
    level: "error",
    path: i.path.map(String).join("."),
    message: i.message,
  }));
}

/** Indices of items whose id repeats an earlier item's id. */
export function duplicateIdIssues(items: readonly { id: string }[], collection: string): Issue[] {
  const seen = new Set<string>();
  const issues: Issue[] = [];
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push({
        level: "error",
        path: `${collection}.${index}.id`,
        message: `duplicate id "${item.id}" in ${collection}`,
      });
    }
    seen.add(item.id);
  });
  return issues;
}

export function toResult<T>(
  parsed: z.ZodSafeParseResult<T>,
  extra: (value: T) => Issue[],
): Result<T> {
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const issues = extra(parsed.data);
  if (issues.some((i) => i.level === "error")) return { ok: false, issues };
  return { ok: true, value: parsed.data, issues };
}
