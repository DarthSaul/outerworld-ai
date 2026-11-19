import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Issue,
  MAX_SKILL_BYTES,
  parseSkillFile,
  type Skill,
} from "@darthsaul/outerworld-ai-core";

/**
 * The bundled skills library (ADR-0023): `packages/runtime/skills/library/*.md`, read-only and
 * shipped with the runtime. The same relative path works from `src/` (tests) and `dist/`.
 */
export const BUNDLED_SKILLS_DIR = fileURLToPath(new URL("../../skills/library", import.meta.url));

export interface LoadedSkills {
  /** Valid skills, sorted by id; a bad file is skipped with an issue, so one never blocks the rest. */
  readonly skills: readonly Skill[];
  readonly issues: readonly Issue[];
}

/** Parses every `.md` skill in `dir`. Never throws: a missing folder is an empty library. */
export async function loadSkillLibrary(dir: string): Promise<LoadedSkills> {
  const issues: Issue[] = [];
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      skills: [],
      issues: [
        {
          level: "warn",
          path: dir,
          message: code === "ENOENT" ? "no skills library" : String(error),
        },
      ],
    };
  }
  const byId = new Map<string, Skill>();
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const path = join(dir, name);
    let info: Awaited<ReturnType<typeof lstat>>;
    let text: string;
    try {
      info = await lstat(path);
      text = info.isFile() && info.size <= MAX_SKILL_BYTES ? await readFile(path, "utf8") : "";
    } catch (error) {
      // One unreadable entry is skipped; the skills loaded so far and the rest still count.
      const reason = (error as NodeJS.ErrnoException).code ?? String(error);
      issues.push({ level: "warn", path: name, message: `could not read: ${reason}` });
      continue;
    }
    if (!info.isFile()) {
      issues.push({ level: "warn", path: name, message: "not a regular file; skipped" });
      continue;
    }
    if (info.size > MAX_SKILL_BYTES) {
      issues.push({
        level: "warn",
        path: name,
        message: `longer than ${MAX_SKILL_BYTES} bytes; skipped`,
      });
      continue;
    }
    const parsed = parseSkillFile(name, text);
    issues.push(...parsed.issues);
    if (parsed.skill) byId.set(parsed.skill.id, parsed.skill);
  }
  return { skills: [...byId.values()], issues };
}
