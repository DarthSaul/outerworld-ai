import { describe, expect, it } from "vitest";
import { ApiKeyService, InvalidKeyError, OPENROUTER_KEY_URL } from "./api-key.js";
import { createRedactor } from "./redact.js";
import { MemorySecretStore } from "./store.js";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef";

const fakeFetch = (status: number) => {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    return new Response(status === 200 ? '{"data":{"label":"x"}}' : '{"error":{"message":"no"}}', {
      status,
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

describe("ApiKeyService", () => {
  it("reports no key when neither the keychain nor the environment has one", async () => {
    const svc = new ApiKeyService({
      store: new MemorySecretStore(),
      env: {},
      fetch: fakeFetch(200).fetch,
    });
    expect(await svc.status()).toEqual({ configured: false, source: null });
    expect(await svc.key()).toBeUndefined();
  });

  it("falls back to OPENROUTER_API_KEY in the environment for development", async () => {
    const svc = new ApiKeyService({
      store: new MemorySecretStore(),
      env: { OPENROUTER_API_KEY: KEY },
      fetch: fakeFetch(200).fetch,
    });
    expect(await svc.status()).toEqual({ configured: true, source: "env" });
    expect(await svc.key()).toBe(KEY);
  });

  it("validates a new key with OpenRouter's key check, then stores it in the keychain", async () => {
    const store = new MemorySecretStore();
    const { fetch, calls } = fakeFetch(200);
    const svc = new ApiKeyService({ store, env: { OPENROUTER_API_KEY: "sk-or-env" }, fetch });
    await svc.setKey(`  ${KEY}\n`);
    expect(calls).toEqual([{ url: OPENROUTER_KEY_URL, auth: `Bearer ${KEY}` }]);
    expect(await svc.status()).toEqual({ configured: true, source: "keychain" });
    expect(await svc.key()).toBe(KEY);
  });

  it("refuses a key OpenRouter rejects and stores nothing", async () => {
    const store = new MemorySecretStore();
    const svc = new ApiKeyService({ store, env: {}, fetch: fakeFetch(401).fetch });
    await expect(svc.setKey(KEY)).rejects.toBeInstanceOf(InvalidKeyError);
    expect(await svc.status()).toEqual({ configured: false, source: null });
  });

  it("refuses an empty key without calling OpenRouter", async () => {
    const { fetch, calls } = fakeFetch(200);
    const svc = new ApiKeyService({ store: new MemorySecretStore(), env: {}, fetch });
    await expect(svc.setKey("   ")).rejects.toBeInstanceOf(InvalidKeyError);
    expect(calls).toEqual([]);
  });

  it("never puts the key in an error message", async () => {
    const svc = new ApiKeyService({
      store: new MemorySecretStore(),
      env: {},
      fetch: fakeFetch(500).fetch,
    });
    const error = (await svc.setKey(KEY).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(KEY);
    expect(error.message).toMatch(/500/);
  });

  it("clears the stored key, leaving any environment fallback", async () => {
    const store = new MemorySecretStore();
    const svc = new ApiKeyService({
      store,
      env: { OPENROUTER_API_KEY: "sk-or-env-key-1234567890" },
      fetch: fakeFetch(200).fetch,
    });
    await svc.setKey(KEY);
    await svc.clearKey();
    expect(await svc.status()).toEqual({ configured: true, source: "env" });
  });

  it("reports the keychain as unavailable instead of throwing, and still uses the environment", async () => {
    const broken = new MemorySecretStore();
    broken.get = async () => Promise.reject(new Error("no secret service"));
    const svc = new ApiKeyService({
      store: broken,
      env: { OPENROUTER_API_KEY: KEY },
      fetch: fakeFetch(200).fetch,
    });
    expect(await svc.status()).toEqual({
      configured: true,
      source: "env",
      keychainError: "no secret service",
    });
  });
});

describe("createRedactor", () => {
  it("replaces known secrets and anything shaped like an OpenRouter key", () => {
    const redact = createRedactor(() => ["hunter2-secret-value"]);
    expect(redact(`key ${KEY} and hunter2-secret-value`)).toBe("key [redacted] and [redacted]");
  });

  it("redacts inside nested values without changing their shape", () => {
    const redact = createRedactor(() => []);
    expect(redact.value({ a: [`x ${KEY}`], n: 3, ok: true })).toEqual({
      a: ["x [redacted]"],
      n: 3,
      ok: true,
    });
  });

  it("ignores very short known values so ordinary words are never blanked", () => {
    const redact = createRedactor(() => ["ab"]);
    expect(redact("abc")).toBe("abc");
  });
});
