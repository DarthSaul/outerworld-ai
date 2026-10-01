import { AsyncEntry } from "@napi-rs/keyring";

/** Where secrets live (brief §9): never the station directory, the database, logs, or events. */
export interface SecretStore {
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export const KEYCHAIN_SERVICE = "outerworld-ai";

/**
 * The OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). On Linux the
 * store is pinned to Secret Service so a machine without it fails loudly rather than keeping the
 * secret in a keyring that does not survive a reboot (ADR-0011).
 */
export class KeychainSecretStore implements SecretStore {
  readonly #service: string;

  constructor(service = KEYCHAIN_SERVICE) {
    this.#service = service;
  }

  #entry(name: string) {
    return new AsyncEntry(this.#service, name, { linux: { store: "secret-service" } });
  }

  async get(name: string) {
    return (await this.#entry(name).getPassword()) ?? undefined;
  }

  async set(name: string, value: string) {
    await this.#entry(name).setPassword(value);
  }

  async delete(name: string) {
    await this.#entry(name).deletePassword();
  }
}

/** For tests and machines without a keychain; never persisted. */
export class MemorySecretStore implements SecretStore {
  readonly #values = new Map<string, string>();

  async get(name: string) {
    return this.#values.get(name);
  }

  async set(name: string, value: string) {
    this.#values.set(name, value);
  }

  async delete(name: string) {
    this.#values.delete(name);
  }
}
