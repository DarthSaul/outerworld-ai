/** Anything shaped like an OpenRouter key, whether or not it is ours. */
const KEY_SHAPE = /sk-or-[A-Za-z0-9_-]{10,}/g;
/** Known values shorter than this are not redacted, so ordinary words are never blanked. */
const MIN_SECRET_LENGTH = 8;
const REDACTED = "[redacted]";

export interface Redactor {
  (text: string): string;
  /** Redacts every string inside a JSON-like value, keeping its shape. */
  value<T>(input: T): T;
}

/**
 * Secrets never reach events, logs, or the SPA (brief §11). `known` returns the secret values
 * currently in use (read on every call, so a newly stored key is covered at once).
 */
export function createRedactor(known: () => readonly string[]): Redactor {
  const text = (input: string) => {
    let out = input.replace(KEY_SHAPE, REDACTED);
    for (const secret of known()) {
      if (secret.length >= MIN_SECRET_LENGTH) out = out.split(secret).join(REDACTED);
    }
    return out;
  };
  const value = <T>(input: T): T => {
    if (typeof input === "string") return text(input) as T;
    if (Array.isArray(input)) return input.map(value) as T;
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, value(v)])) as T;
    }
    return input;
  };
  return Object.assign(text, { value });
}
