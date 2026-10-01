import type { SecretStore } from "./store.js";

/** OpenRouter's key check: metadata only, no model call (ADR-0011). */
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
const SECRET_NAME = "openrouter-api-key";

export class InvalidKeyError extends Error {}

export interface ApiKeyStatus {
  readonly configured: boolean;
  readonly source: "keychain" | "env" | null;
  /** Why the keychain could not be read, when it could not. */
  readonly keychainError?: string;
}

/**
 * The OpenRouter key (Phase 3). The keychain wins over `OPENROUTER_API_KEY` (a development
 * fallback). A new key is checked with OpenRouter before it is stored. Nothing here ever returns
 * the key to a caller outside the runtime or puts it in an error message.
 */
export class ApiKeyService {
  readonly #store: SecretStore;
  readonly #env: Readonly<Record<string, string | undefined>>;
  readonly #fetch: typeof globalThis.fetch;
  /** Every key value seen, for the redactor. Never leaves the runtime. */
  readonly #seen = new Set<string>();

  constructor(options: {
    store: SecretStore;
    env: Readonly<Record<string, string | undefined>>;
    fetch?: typeof globalThis.fetch;
  }) {
    this.#store = options.store;
    this.#env = options.env;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async #fromKeychain(): Promise<{ key?: string; error?: string }> {
    try {
      const key = await this.#store.get(SECRET_NAME);
      return key ? { key } : {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The key for model calls, or undefined. Runtime-internal only. */
  async key(): Promise<string | undefined> {
    const key = (await this.#fromKeychain()).key ?? (this.#env.OPENROUTER_API_KEY || undefined);
    if (key) this.#seen.add(key);
    return key;
  }

  /** Key values this process has seen (including the env fallback), for redaction. */
  knownSecrets(): string[] {
    const env = this.#env.OPENROUTER_API_KEY;
    return [...this.#seen, ...(env ? [env] : [])];
  }

  async status(): Promise<ApiKeyStatus> {
    const keychain = await this.#fromKeychain();
    const source = keychain.key ? "keychain" : this.#env.OPENROUTER_API_KEY ? "env" : null;
    return {
      configured: source !== null,
      source,
      ...(keychain.error !== undefined ? { keychainError: keychain.error } : {}),
    };
  }

  /** Checks the key with OpenRouter, then stores it in the keychain. */
  async setKey(raw: string): Promise<void> {
    const key = raw.trim();
    if (!key) throw new InvalidKeyError("the key is empty");
    const res = await this.#fetch(OPENROUTER_KEY_URL, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (res.status === 401 || res.status === 403) {
      throw new InvalidKeyError("OpenRouter did not accept this key");
    }
    if (!res.ok) throw new Error(`OpenRouter's key check failed with HTTP ${res.status}`);
    this.#seen.add(key);
    await this.#store.set(SECRET_NAME, key);
  }

  async clearKey(): Promise<void> {
    await this.#store.delete(SECRET_NAME);
  }
}
