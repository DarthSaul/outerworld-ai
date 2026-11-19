import { z } from "zod";
import { Id, type Issue, zodIssues } from "../schema/common.js";

/**
 * A skill (ADR-0023): a Markdown recipe with frontmatter that tells a crew member how to do one
 * kind of work well. The library is bundled with the runtime and read-only; which skills are on is
 * station config (global overrides) and agent config (per-agent additions).
 */

/**
 * What a skill needs before it can be offered. Each maps to tools the run must actually have
 * (`capabilitiesOf`); `shell`, `media`, and `browser` have no tools in v1, so skills needing them
 * load and show in the catalog but are never offered.
 */
export const REQUIREMENTS = [
  "web",
  "files",
  "memory",
  "dispatch",
  "shell",
  "media",
  "browser",
] as const;
export type Requirement = (typeof REQUIREMENTS)[number];

export const isRequirement = (value: string): value is Requirement =>
  (REQUIREMENTS as readonly string[]).includes(value);

/** Skill files above this are skipped: a recipe, not a document store. */
export const MAX_SKILL_BYTES = 64 * 1024;

export const SkillFrontmatter = z.looseObject({
  name: z.string().min(1),
  slug: Id,
  description: z.string().min(1),
  category: z.string().min(1),
  /** Unknown values are kept and reported; an unknown requirement is never met. */
  requires: z.array(z.string().min(1)).default([]),
  /** On for every crew member unless the Commander turns it off. */
  default: z.boolean().default(false),
  license: z.string().min(1).optional(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>;

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly requires: readonly string[];
  readonly default: boolean;
  readonly body: string;
}

export interface ParsedSkill {
  readonly skill?: Skill;
  readonly issues: readonly Issue[];
}

const scalar = (raw: string): string | boolean => {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  const quoted = /^"(.*)"$/.exec(v) ?? /^'(.*)'$/.exec(v);
  return quoted ? (quoted[1] ?? "") : v;
};

/**
 * The frontmatter subset skill files use: `key: value` and `key: [a, b]`, one per line. Anything
 * else (nesting, multi-line values) is malformed rather than guessed at.
 */
function parseFrontmatter(text: string): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const [i, line] of text.split("\n").entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = /^([a-zA-Z][\w-]*):(.*)$/.exec(line);
    if (!m) return `line ${i + 2} is not "key: value"`;
    const key = m[1] as string;
    const value = (m[2] as string).trim();
    if (key in out) return `"${key}" appears twice`;
    if (value.startsWith("[")) {
      if (!value.endsWith("]")) return `"${key}" opens a list it does not close`;
      const inner = value.slice(1, -1).trim();
      out[key] = inner ? inner.split(",").map((s) => String(scalar(s))) : [];
    } else {
      out[key] = scalar(value);
    }
  }
  return out;
}

/** Parses one skill file. Never throws: a bad file is `{ issues }` with no skill. */
export function parseSkillFile(fileName: string, text: string): ParsedSkill {
  const issue = (message: string, level: Issue["level"] = "error"): Issue => ({
    level,
    path: fileName,
    message,
  });
  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  // The closing --- must be a whole line: "---not-a-delimiter" is frontmatter text, not the end.
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
  if (!m) return { issues: [issue("no frontmatter between --- lines")] };
  const fields = parseFrontmatter(m[1] as string);
  if (typeof fields === "string") return { issues: [issue(`malformed frontmatter: ${fields}`)] };
  const parsed = SkillFrontmatter.safeParse(fields);
  if (!parsed.success) {
    return {
      issues: zodIssues(parsed.error).map((i) => issue(`${i.path || "frontmatter"}: ${i.message}`)),
    };
  }
  const fm = parsed.data;
  const expected = fileName.replace(/\.md$/, "");
  if (fm.slug !== expected) {
    return { issues: [issue(`slug "${fm.slug}" does not match the file name "${expected}"`)] };
  }
  const body = (m[2] as string).trim();
  if (!body) return { issues: [issue("the skill has no body")] };
  const issues = fm.requires
    .filter((r) => !isRequirement(r))
    .map((r) => issue(`unknown requirement "${r}"; the skill is never offered`, "warn"));
  return {
    skill: {
      id: fm.slug,
      name: fm.name,
      description: fm.description,
      category: fm.category,
      requires: fm.requires,
      default: fm.default,
      body,
    },
    issues,
  };
}
