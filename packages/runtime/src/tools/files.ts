import { lstat, mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { z } from "zod";
import type { ToolImpl } from "../run/run-service.js";
import { writeFileAtomic } from "../storage/atomic-write.js";

/** Reads return at most this much; the rest is cut and marked truncated. */
export const MAX_READ_BYTES = 256 * 1024;
/** A single write may be at most this large. */
export const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_ENTRIES = 500;

const ReadInput = z.strictObject({ path: z.string().min(1) });
const ListInput = z.strictObject({ path: z.string().min(1).optional() });
const WriteInput = z.strictObject({ path: z.string().min(1), content: z.string() });

const parse = <S extends z.ZodType>(schema: S, input: unknown): z.infer<S> => {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new Error(`invalid input: ${r.error.issues.map((i) => i.message).join("; ")}`);
  return r.data;
};

const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);

/**
 * Resolves `rel` inside the agent's workspace or throws. Rejects absolute paths, NUL bytes, and
 * anything that normalizes outside; then resolves symlinks of whatever already exists and checks
 * again, so a link cannot lead out (brief §11).
 */
async function resolveInside(root: string, rel: string): Promise<string> {
  if (rel.includes("\0")) throw new Error("invalid path");
  if (isAbsolute(rel) || win32.isAbsolute(rel)) throw new Error("absolute paths are not allowed");
  const target = resolve(root, rel);
  if (!inside(root, target)) throw new Error("that path is outside the workspace");
  const realRoot = await realpath(root);
  // Walk up to the deepest part that exists and check where it really points.
  let existing = target;
  for (;;) {
    try {
      const real = await realpath(existing);
      if (!inside(realRoot, real)) throw new Error("that path is outside the workspace");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (existing === root) break;
      existing = dirname(existing);
    }
  }
  return target;
}

const display = (root: string, path: string) => relative(root, path) || ".";

/**
 * The Files prop's tools (brief §6), confined to `workspaces/<agentId>/`, which is created on
 * first use. `read_file` and `list_files` are read-class; `write_file` is write-class.
 */
export function createFileTools(options: {
  workspacesDir: string;
}): Record<"read_file" | "list_files" | "write_file", ToolImpl> {
  const workspace = async (agentId: string) => {
    const dir = join(options.workspacesDir, agentId);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  return {
    read_file: {
      description:
        "Read a text file from your workspace. Paths are relative to the workspace root. Large files are truncated.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path, e.g. notes/today.md" } },
        required: ["path"],
        additionalProperties: false,
      },
      class: "read",
      async execute(input, ctx) {
        const { path } = parse(ReadInput, input);
        const root = await workspace(ctx.agentId);
        const file = await resolveInside(root, path);
        const info = await stat(file).catch(() => {
          throw new Error(`no such file: ${path}`);
        });
        if (info.isDirectory()) throw new Error(`${path} is a directory; use list_files`);
        const buffer = await readFile(file);
        const truncated = buffer.length > MAX_READ_BYTES;
        return {
          path: display(root, file),
          content: buffer.subarray(0, MAX_READ_BYTES).toString("utf8"),
          truncated,
        };
      },
    },

    list_files: {
      description: "List the files and folders in a folder of your workspace (default: the root).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative folder path; omit for the root" },
        },
        additionalProperties: false,
      },
      class: "read",
      async execute(input, ctx) {
        const { path = "." } = parse(ListInput, input);
        const root = await workspace(ctx.agentId);
        const dir = await resolveInside(root, path);
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => {
          throw new Error(`no such folder: ${path}`);
        });
        const out = [];
        for (const e of entries
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, MAX_ENTRIES)) {
          if (e.isDirectory()) out.push({ name: e.name, type: "directory" as const });
          else if (e.isFile()) {
            out.push({
              name: e.name,
              type: "file" as const,
              bytes: (await stat(join(dir, e.name))).size,
            });
          } else out.push({ name: e.name, type: "other" as const });
        }
        return { path: display(root, dir), entries: out };
      },
    },

    write_file: {
      description:
        "Create or replace a text file in your workspace. Folders are created as needed. Paths are relative to the workspace root.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path, e.g. notes/today.md" },
          content: { type: "string", description: "The whole new content of the file" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
      class: "write",
      async execute(input, ctx) {
        const { path, content } = parse(WriteInput, input);
        const bytes = Buffer.byteLength(content);
        if (bytes > MAX_WRITE_BYTES)
          throw new Error(`too large: ${bytes} bytes (max ${MAX_WRITE_BYTES})`);
        const root = await workspace(ctx.agentId);
        const file = await resolveInside(root, path);
        const existing = await lstat(file).catch(() => undefined);
        if (existing?.isSymbolicLink()) throw new Error("refusing to write through a link");
        if (existing?.isDirectory()) throw new Error(`${path} is a directory`);
        await writeFileAtomic(file, content);
        return { path: display(root, file), bytes };
      },
    },
  };
}
