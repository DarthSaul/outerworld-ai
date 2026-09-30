import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, stat } from "node:fs/promises";
import { writeFileAtomic } from "@darthsaul/outerworld-ai-runtime";

const TOKEN = /^[0-9a-f]{64}$/;

/**
 * The per-install bearer token (brief §11). Generated on first start into
 * `$OUTERWORLD_HOME/daemon.token` with mode 0600 and reused afterwards; a malformed file is
 * replaced, and a file other users can read is tightened back to 0600.
 */
export async function ensureToken(path: string): Promise<string> {
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (TOKEN.test(existing)) {
      if (((await stat(path)).mode & 0o077) !== 0) await chmod(path, 0o600);
      return existing;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const token = randomBytes(32).toString("hex");
  await writeFileAtomic(path, `${token}\n`, { mode: 0o600 });
  return token;
}

/** Constant-time comparison; an empty token never matches. */
export function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
