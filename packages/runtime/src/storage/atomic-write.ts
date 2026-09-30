import { randomBytes } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { basename, dirname, join } from "node:path";

type Fs = Pick<typeof nodeFs, "mkdir" | "open" | "rename" | "rm">;

export interface AtomicWriteOptions {
  /** File mode for a new file, e.g. 0o600 for the daemon token. */
  readonly mode?: number;
  /** Injected for tests that simulate a crash between write and rename. */
  readonly fs?: Fs;
}

/**
 * Writes `data` so that readers only ever see the old file or the complete new one: write a
 * temp file in the same directory, fsync it, rename it over the target, then fsync the
 * directory. On any failure the temp file is removed and the target is untouched.
 */
export async function writeFileAtomic(
  path: string,
  data: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const fs = options.fs ?? nodeFs;
  const dir = dirname(path);
  await fs.mkdir(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await fs.open(temp, "wx", options.mode ?? 0o644);
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, path);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  const dirHandle = await fs.open(dir, "r");
  try {
    await dirHandle.sync();
  } finally {
    await dirHandle.close();
  }
}
