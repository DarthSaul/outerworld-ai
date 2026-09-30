import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureToken, tokensMatch } from "./token.js";

const path = () => join(mkdtempSync(join(tmpdir(), "ow-token-")), "daemon.token");

describe("ensureToken", () => {
  it("creates a 256-bit hex token with mode 0600 on first start", async () => {
    const p = path();
    const token = await ensureToken(p);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(p, "utf8").trim()).toBe(token);
    expect(statSync(p).mode & 0o777).toBe(0o600);
  });

  it("reuses the existing token on later starts", async () => {
    const p = path();
    const first = await ensureToken(p);
    expect(await ensureToken(p)).toBe(first);
  });

  it("replaces a malformed token file", async () => {
    const p = path();
    writeFileSync(p, "not-a-token", { mode: 0o600 });
    const token = await ensureToken(p);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tightens a token file other users can read back to 0600", async () => {
    const p = path();
    const first = await ensureToken(p);
    chmodSync(p, 0o644);
    expect(await ensureToken(p)).toBe(first);
    expect(statSync(p).mode & 0o777).toBe(0o600);
  });
});

describe("tokensMatch", () => {
  it("compares in constant time and rejects different lengths", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("abc", "abcd")).toBe(false);
    expect(tokensMatch("", "")).toBe(false);
  });
});
