import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomic-write.js";

const dir = () => mkdtempSync(join(tmpdir(), "ow-atomic-"));

describe("writeFileAtomic", () => {
  it("writes a new file and leaves no temp file behind", async () => {
    const d = dir();
    await writeFileAtomic(join(d, "a.json"), "{}\n");
    expect(readFileSync(join(d, "a.json"), "utf8")).toBe("{}\n");
    expect(readdirSync(d)).toEqual(["a.json"]);
  });

  it("replaces an existing file", async () => {
    const d = dir();
    writeFileSync(join(d, "a.md"), "old");
    await writeFileAtomic(join(d, "a.md"), "new");
    expect(readFileSync(join(d, "a.md"), "utf8")).toBe("new");
  });

  it("applies the requested mode", async () => {
    const d = dir();
    await writeFileAtomic(join(d, "token"), "secret-ish", { mode: 0o600 });
    expect(statSync(join(d, "token")).mode & 0o777).toBe(0o600);
  });

  it("keeps the old contents and removes the temp file when the rename fails (simulated crash)", async () => {
    const d = dir();
    writeFileSync(join(d, "station.json"), "original");
    const failingRename = { ...fs, rename: async () => Promise.reject(new Error("power loss")) };
    await expect(
      writeFileAtomic(join(d, "station.json"), "half-written", { fs: failingRename }),
    ).rejects.toThrow("power loss");
    expect(readFileSync(join(d, "station.json"), "utf8")).toBe("original");
    expect(readdirSync(d)).toEqual(["station.json"]);
  });

  it("creates missing parent directories", async () => {
    const d = dir();
    await writeFileAtomic(join(d, "agents", "pm", "agent.json"), "{}");
    expect(readFileSync(join(d, "agents", "pm", "agent.json"), "utf8")).toBe("{}");
  });
});
