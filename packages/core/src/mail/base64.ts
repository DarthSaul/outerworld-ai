/**
 * Base64 and base64url over bytes, without Buffer or the DOM, so core stays usable from the SPA.
 * Gmail sends and takes message bodies as base64url (RFC 4648 §5).
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP: Readonly<Record<string, number>> = Object.fromEntries(
  [...ALPHABET].map((c, i) => [c, i]),
);

/** Standard base64, padded. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += b === undefined ? "=" : ALPHABET[(n >> 6) & 63];
    out += c === undefined ? "=" : ALPHABET[n & 63];
  }
  return out;
}

/** base64url without padding, as Gmail's `raw` field takes it. */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes base64 or base64url, padded or not; characters outside the alphabet are skipped. */
export function fromBase64(text: string): Uint8Array {
  const clean = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | (LOOKUP[ch] ?? 0);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
