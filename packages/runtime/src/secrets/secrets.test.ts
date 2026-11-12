import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_KEY_URL,
  ANTHROPIC_PROVIDER,
  ApiKeyService,
  InvalidKeyError,
  KeyCheckUnavailableError,
  KeychainWriteError,
  OPENROUTER_KEY_URL,
} from "./api-key.js";
import { createRedactor } from "./redact.js";
import { MemorySecretStore } from "./store.js";

// Obviously fake and low-entropy, so it reads as a fixture to people and to secret scanners.
const KEY = "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

let lastHeaders: Headers | undefined;
const fakeFetch = (status: number) => {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization") });
    lastHeaders = headers;
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

  it("remembers every key it has seen, and the env fallback, for redaction", async () => {
    const svc = new ApiKeyService({
      store: new MemorySecretStore(),
      env: { OPENROUTER_API_KEY: "sk-or-env-value-123" },
      fetch: fakeFetch(200).fetch,
    });
    await svc.setKey(KEY);
    expect(svc.knownSecrets().sort()).toEqual([KEY, "sk-or-env-value-123"].sort());
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
      env: { OPENROUTER_API_KEY: "sk-or-env-xxxxxxxxxxxx" },
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

describe("ApiKeyService for Anthropic (ADR-0015)", () => {
  const ANT = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  it("checks the key against Anthropic's model list with x-api-key, then stores it apart", async () => {
    const store = new MemorySecretStore();
    const { fetch, calls } = fakeFetch(200);
    const svc = new ApiKeyService({ store, env: {}, fetch, provider: ANTHROPIC_PROVIDER });
    await svc.setKey(ANT);
    expect(calls.map((c) => c.url)).toEqual([ANTHROPIC_KEY_URL]);
    expect(lastHeaders?.get("x-api-key")).toBe(ANT);
    expect(lastHeaders?.get("anthropic-version")).toBe("2023-06-01");
    expect(await store.get("anthropic-api-key")).toBe(ANT);
    expect(await store.get("openrouter-api-key")).toBeUndefined();
  });

  it("falls back to ANTHROPIC_API_KEY, not OPENROUTER_API_KEY", async () => {
    const svc = new ApiKeyService({
      store: new MemorySecretStore(),
      env: { OPENROUTER_API_KEY: KEY },
      fetch: fakeFetch(200).fetch,
      provider: ANTHROPIC_PROVIDER,
    });
    expect(await svc.status()).toEqual({ configured: false, source: null });
    const withEnv = new ApiKeyService({
      store: new MemorySecretStore(),
      env: { ANTHROPIC_API_KEY: ANT },
      fetch: fakeFetch(200).fetch,
      provider: ANTHROPIC_PROVIDER,
    });
    expect(await withEnv.key()).toBe(ANT);
  });

  it("names Anthropic when it rejects a key", async () => {
    const svc = new ApiKeyService({
      store: new MemorySecretStore(),
      env: {},
      fetch: fakeFetch(401).fetch,
      provider: ANTHROPIC_PROVIDER,
    });
    await expect(svc.setKey(ANT)).rejects.toThrow("Anthropic did not accept this key");
  });

  it("is redacted by shape", () => {
    expect(createRedactor(() => [])(`k=${ANT}`)).toBe("k=[redacted]");
  });
});

describe("ApiKeyService: pasted keys and failures that are not a rejection", () => {
  const ANT = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const anthropic = (fetch: typeof globalThis.fetch, store = new MemorySecretStore()) =>
    new ApiKeyService({ store, env: {}, fetch, provider: ANTHROPIC_PROVIDER });

  it("drops invisible characters a copy can carry (zero-width, no-break space, BOM)", async () => {
    const store = new MemorySecretStore();
    await anthropic(fakeFetch(200).fetch, store).setKey(
      `\uFEFF${ANT.slice(0, 10)}\u200B${ANT.slice(10)}\u00A0`,
    );
    expect(await store.get("anthropic-api-key")).toBe(ANT);
    expect(lastHeaders?.get("x-api-key")).toBe(ANT);
  });

  it("refuses a key with characters no key has, without calling the provider", async () => {
    const { fetch, calls } = fakeFetch(200);
    const error = await anthropic(fetch)
      .setKey("sk-ant-api03-ключ")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidKeyError);
    expect((error as Error).message).toMatch(/copy it again/);
    expect(calls).toEqual([]);
  });

  it("says the provider could not be reached when the check request fails", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND") });
    }) as unknown as typeof globalThis.fetch;
    const error = (await anthropic(fetch)
      .setKey(ANT)
      .catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(KeyCheckUnavailableError);
    expect(error.message).toMatch(/could not reach Anthropic.*ENOTFOUND/);
    expect(error.message).not.toContain(ANT);
  });

  it("passes on the provider's own reason for an unexpected status", async () => {
    const fetch = (async () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        }),
        { status: 529 },
      )) as unknown as typeof globalThis.fetch;
    const error = (await anthropic(fetch)
      .setKey(ANT)
      .catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(KeyCheckUnavailableError);
    expect(error.message).toMatch(/HTTP 529: Overloaded/);
  });

  it("names the keychain when storing the checked key fails", async () => {
    const store = new MemorySecretStore();
    store.set = async () => Promise.reject(new Error("User canceled the operation."));
    const error = (await anthropic(fakeFetch(200).fetch, store)
      .setKey(ANT)
      .catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(KeychainWriteError);
    expect(error.message).toMatch(/OS keychain.*User canceled/);
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
