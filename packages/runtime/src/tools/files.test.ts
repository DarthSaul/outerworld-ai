import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileTools, MAX_READ_BYTES, MAX_WRITE_BYTES } from "./files.js";

const ctx = (agentId = "quill") => ({
  agentId,
  sessionId: "s",
  runId: "r",
  signal: new AbortController().signal,
});

const setup = () => {
  const workspaces = mkdtempSync(join(tmpdir(), "ow-ws-"));
  const tools = createFileTools({ workspacesDir: workspaces });
  const ws = join(workspaces, "quill");
  return { workspaces, ws, tools };
};

describe("file tools", () => {
  it("classes reads as read and writes as write", () => {
    const { tools } = setup();
    expect([tools.read_file.class, tools.list_files.class, tools.write_file.class]).toEqual([
      "read",
      "read",
      "write",
    ]);
  });

  it("writes, reads back, and lists inside the agent's own workspace", async () => {
    const { tools, ws } = setup();
    expect(
      await tools.write_file.execute({ path: "notes/today.md", content: "# Today\n" }, ctx()),
    ).toEqual({
      path: "notes/today.md",
      bytes: 8,
    });
    expect(readFileSync(join(ws, "notes", "today.md"), "utf8")).toBe("# Today\n");
    expect(await tools.read_file.execute({ path: "notes/today.md" }, ctx())).toEqual({
      path: "notes/today.md",
      content: "# Today\n",
      truncated: false,
    });
    expect(await tools.list_files.execute({}, ctx())).toEqual({
      path: ".",
      entries: [{ name: "notes", type: "directory" }],
    });
    expect(await tools.list_files.execute({ path: "notes" }, ctx())).toEqual({
      path: "notes",
      entries: [{ name: "today.md", type: "file", bytes: 8 }],
    });
  });

  it("keeps each agent to its own workspace", async () => {
    const { tools } = setup();
    await tools.write_file.execute({ path: "a.md", content: "quill's" }, ctx("quill"));
    await expect(tools.read_file.execute({ path: "a.md" }, ctx("vesper"))).rejects.toThrow(
      /no such file/,
    );
    await expect(tools.read_file.execute({ path: "../quill/a.md" }, ctx("vesper"))).rejects.toThrow(
      /outside/,
    );
  });

  it("refuses traversal, absolute paths, and NUL bytes", async () => {
    const { tools } = setup();
    for (const path of ["../escape.md", "a/../../escape.md", "/etc/passwd", "C:\\x", "a\0b"]) {
      await expect(tools.write_file.execute({ path, content: "x" }, ctx()), path).rejects.toThrow(
        /outside|absolute|invalid/,
      );
    }
  });

  it("refuses to follow a symlink out of the workspace, for reads and writes", async () => {
    const { tools, ws } = setup();
    const outside = mkdtempSync(join(tmpdir(), "ow-outside-"));
    writeFileSync(join(outside, "secret.txt"), "secret");
    mkdirSync(ws, { recursive: true });
    symlinkSync(outside, join(ws, "link"));
    symlinkSync(join(outside, "secret.txt"), join(ws, "file-link"));
    await expect(tools.read_file.execute({ path: "link/secret.txt" }, ctx())).rejects.toThrow(
      /outside/,
    );
    await expect(tools.read_file.execute({ path: "file-link" }, ctx())).rejects.toThrow(/outside/);
    await expect(
      tools.write_file.execute({ path: "link/new.txt", content: "x" }, ctx()),
    ).rejects.toThrow(/outside/);
    await expect(
      tools.write_file.execute({ path: "file-link", content: "x" }, ctx()),
    ).rejects.toThrow(/link|outside/);
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
  });

  it("truncates a large read and refuses an oversized write", async () => {
    const { tools, ws } = setup();
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "big.txt"), "x".repeat(MAX_READ_BYTES + 10));
    const read = (await tools.read_file.execute({ path: "big.txt" }, ctx())) as {
      content: string;
      truncated: boolean;
    };
    expect(read.truncated).toBe(true);
    expect(read.content).toHaveLength(MAX_READ_BYTES);
    await expect(
      tools.write_file.execute(
        { path: "huge.txt", content: "x".repeat(MAX_WRITE_BYTES + 1) },
        ctx(),
      ),
    ).rejects.toThrow(/too large/);
  });

  it("rejects input that does not match the tool's schema", async () => {
    const { tools } = setup();
    await expect(tools.read_file.execute({}, ctx())).rejects.toThrow(/invalid/);
    await expect(tools.write_file.execute({ path: "a" }, ctx())).rejects.toThrow(/invalid/);
  });

  it("says plainly when a file is missing or a path is a directory", async () => {
    const { tools } = setup();
    await expect(tools.read_file.execute({ path: "nope.md" }, ctx())).rejects.toThrow(
      /no such file/,
    );
    await tools.write_file.execute({ path: "dir/a.md", content: "x" }, ctx());
    await expect(tools.read_file.execute({ path: "dir" }, ctx())).rejects.toThrow(/directory/);
  });
});
