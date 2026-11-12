import type { SecretStore } from "./store.js";

/** OpenRouter's key check: metadata only, no model call (ADR-0011). */
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
/** Anthropic's key check: list one model, metadata only, no tokens spent (ADR-0015). */
export const ANTHROPIC_KEY_URL = "https://api.anthropic.com/v1/models?limit=1";

/** One model provider's key: where it is kept, its dev fallback, and how it is checked. */
export interface KeyProvider {
  readonly label: string;
  /** The keychain entry's name. */
  readonly secretName: string;
  /** The development fallback environment variable. */
  readonly envVar: string;
  readonly checkUrl: string;
  readonly checkHeaders: (key: string) => Record<string, string>;
}

export const OPENROUTER_PROVIDER: KeyProvider = {
  label: "OpenRouter",
  secretName: "openrouter-api-key",
  envVar: "OPENROUTER_API_KEY",
  checkUrl: OPENROUTER_KEY_URL,
  checkHeaders: (key) => ({ authorization: `Bearer ${key}` }),
};

export const ANTHROPIC_PROVIDER: KeyProvider = {
  label: "Anthropic",
  secretName: "anthropic-api-key",
  envVar: "ANTHROPIC_API_KEY",
  checkUrl: ANTHROPIC_KEY_URL,
  checkHeaders: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
};

/** The provider rejected the key, or it cannot be a key at all (HTTP 400). */
export class InvalidKeyError extends Error {}
/** The key could not be checked: the provider was unreachable or answered unexpectedly (502). */
export class KeyCheckUnavailableError extends Error {}
/** The key was accepted but the OS keychain would not store it. */
export class KeychainWriteError extends Error {}

/** Whitespace and invisible characters a copy from a web page can carry; never part of a key. */
const INVISIBLE = /[\s\u200B-\u200D\u2060\uFEFF]/g;
/** What every provider key is made of: printable ASCII. */
const KEY_CHARS = /^[\x21-\x7E]+$/;

/** The provider's own reason from an error body (`{ error: { message } }`), if it has one. */
async function providerReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const message = body.error?.message;
    return typeof message === "string" ? message.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export interface ApiKeyStatus {
  readonly configured: boolean;
  readonly source: "keychain" | "env" | null;
  /** Why the keychain could not be read, when it could not. */
  readonly keychainError?: string;
}

/**
 * One provider's key (Phase 3; Anthropic added by ADR-0015). The keychain wins over the provider's
 * environment variable (a development fallback). A new key is checked with the provider before it
 * is stored. Nothing here ever returns the key to a caller outside the runtime or puts it in an
 * error message.
 */
export class ApiKeyService {
  readonly #provider: KeyProvider;
  readonly #store: SecretStore;
  readonly #env: Readonly<Record<string, string | undefined>>;
  readonly #fetch: typeof globalThis.fetch;
  /** Every key value seen, for the redactor. Never leaves the runtime. */
  readonly #seen = new Set<string>();

  constructor(options: {
    store: SecretStore;
    env: Readonly<Record<string, string | undefined>>;
    fetch?: typeof globalThis.fetch;
    /** Defaults to OpenRouter. */
    provider?: KeyProvider;
  }) {
    this.#provider = options.provider ?? OPENROUTER_PROVIDER;
    this.#store = options.store;
    this.#env = options.env;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async #fromKeychain(): Promise<{ key?: string; error?: string }> {
    try {
      const key = await this.#store.get(this.#provider.secretName);
      return key ? { key } : {};
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The key for model calls, or undefined. Runtime-internal only. */
  async key(): Promise<string | undefined> {
    const key = (await this.#fromKeychain()).key ?? (this.#env[this.#provider.envVar] || undefined);
    if (key) this.#seen.add(key);
    return key;
  }

  /** Key values this process has seen (including the env fallback), for redaction. */
  knownSecrets(): string[] {
    const env = this.#env[this.#provider.envVar];
    return [...this.#seen, ...(env ? [env] : [])];
  }

  async status(): Promise<ApiKeyStatus> {
    const keychain = await this.#fromKeychain();
    const source = keychain.key ? "keychain" : this.#env[this.#provider.envVar] ? "env" : null;
    return {
      configured: source !== null,
      source,
      ...(keychain.error !== undefined ? { keychainError: keychain.error } : {}),
    };
  }

  /** Checks the key with the provider, then stores it in the keychain. */
  async setKey(raw: string): Promise<void> {
    const key = raw.replace(INVISIBLE, "");
    const { label } = this.#provider;
    if (!key) throw new InvalidKeyError("the key is empty");
    if (!KEY_CHARS.test(key)) {
      throw new InvalidKeyError(
        "the key has characters no key contains: copy it again from the provider's console",
      );
    }
    const clean = (text: string) => text.split(key).join("[redacted]");
    let res: Response;
    try {
      res = await this.#fetch(this.#provider.checkUrl, {
        headers: this.#provider.checkHeaders(key),
      });
    } catch (error) {
      const cause = error instanceof Error ? (error.cause as Error | undefined) : undefined;
      const why = cause?.message ?? (error instanceof Error ? error.message : String(error));
      throw new KeyCheckUnavailableError(
        clean(`could not reach ${label} to check the key: ${why}`),
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new InvalidKeyError(`${label} did not accept this key`);
    }
    if (!res.ok) {
      const reason = await providerReason(res);
      throw new KeyCheckUnavailableError(
        clean(`${label}'s key check failed with HTTP ${res.status}${reason ? `: ${reason}` : ""}`),
      );
    }
    this.#seen.add(key);
    try {
      await this.#store.set(this.#provider.secretName, key);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      throw new KeychainWriteError(clean(`could not save the key in the OS keychain: ${why}`));
    }
  }

  async clearKey(): Promise<void> {
    await this.#store.delete(this.#provider.secretName);
  }
}
