import { fromBase64, toBase64, toBase64Url, utf8 } from "./base64.js";

/**
 * Email for the Gmail service (ADR-0021): building a draft as Gmail's `raw` RFC 2822 message,
 * and reading Gmail's parsed threads back as plain text for the model. Pure; no IO.
 */

/** A draft to create: plain text, with the threading headers when it replies. */
export interface DraftMessage {
  readonly to: readonly string[];
  readonly cc?: readonly string[] | undefined;
  readonly bcc?: readonly string[] | undefined;
  readonly subject: string;
  readonly body: string;
  /** The Message-ID this replies to (RFC 2822 §3.6.4). */
  readonly inReplyTo?: string | undefined;
  /** The thread's References, ending with the Message-ID replied to. */
  readonly references?: string | undefined;
}

/** A header value with a line break could start a header of its own; it is refused. */
const oneLine = (name: string, value: string): string => {
  if (/[\r\n]/.test(value)) throw new Error(`${name} cannot contain a line break`);
  return value.trim();
};

/** ASCII printable and space only: everything else goes in an encoded word. */
const plainAscii = (text: string) => /^[\x20-\x7e]*$/.test(text);

/**
 * RFC 2047 encoded words for a non-ASCII header value, each at most 75 characters, split on
 * whole code points so no character is cut between words.
 */
export function encodeHeaderValue(text: string): string {
  if (plainAscii(text)) return text;
  const words: string[] = [];
  let chunk = "";
  // 45 bytes of UTF-8 encode to 60 characters of base64, inside the 75-character limit.
  for (const ch of text) {
    if (utf8(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${toBase64(utf8(w))}?=`).join("\r\n ");
}

const addresses = (name: string, list: readonly string[] | undefined): string | undefined => {
  const kept = (list ?? []).map((a) => oneLine(name, a)).filter(Boolean);
  return kept.length > 0 ? kept.join(", ") : undefined;
};

/** Base64 body lines of at most 76 characters (RFC 2045 §6.8). */
const wrap = (b64: string) => b64.match(/.{1,76}/g)?.join("\r\n") ?? "";

/** The draft as an RFC 2822 message, UTF-8 plain text with a base64 body. */
export function buildMessage(draft: DraftMessage): string {
  const to = addresses("To", draft.to);
  if (!to) throw new Error("a draft needs at least one recipient");
  const headers: Array<[string, string | undefined]> = [
    ["To", to],
    ["Cc", addresses("Cc", draft.cc)],
    ["Bcc", addresses("Bcc", draft.bcc)],
    ["Subject", encodeHeaderValue(oneLine("Subject", draft.subject))],
    ["In-Reply-To", draft.inReplyTo ? oneLine("In-Reply-To", draft.inReplyTo) : undefined],
    ["References", draft.references ? oneLine("References", draft.references) : undefined],
    ["MIME-Version", "1.0"],
    ["Content-Type", 'text/plain; charset="UTF-8"'],
    ["Content-Transfer-Encoding", "base64"],
  ];
  const head = headers
    .filter((h): h is [string, string] => h[1] !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  const body = draft.body.replace(/\r?\n/g, "\r\n");
  return `${head}\r\n\r\n${wrap(toBase64(utf8(body)))}\r\n`;
}

/** The draft as Gmail's `raw` field: the RFC 2822 message, base64url. */
export function buildRawMessage(draft: DraftMessage): string {
  return toBase64Url(utf8(buildMessage(draft)));
}

/** "Re: " once, as Gmail threads a reply only when the subjects match. */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** In-Reply-To and References for a reply to a message (RFC 2822 §3.6.4). */
export function replyHeaders(
  messageId: string | undefined,
  references: string | undefined,
): { inReplyTo?: string; references?: string } {
  if (!messageId) return {};
  const chain = [...(references ?? "").split(/\s+/).filter(Boolean), messageId];
  return { inReplyTo: messageId, references: [...new Set(chain)].join(" ") };
}

// Reading: Gmail's parsed message (`format=full` or `metadata`).

/** The parts of Gmail's `Message` resource this reads; everything else is ignored. */
export interface GmailMessagePart {
  readonly mimeType?: string;
  readonly filename?: string;
  readonly headers?: ReadonlyArray<{ readonly name: string; readonly value: string }>;
  readonly body?: {
    readonly data?: string;
    readonly size?: number;
    readonly attachmentId?: string;
  };
  readonly parts?: readonly GmailMessagePart[];
}

export interface GmailMessage {
  readonly id: string;
  readonly threadId?: string;
  readonly labelIds?: readonly string[];
  readonly snippet?: string;
  readonly internalDate?: string;
  readonly payload?: GmailMessagePart;
}

export interface GmailThread {
  readonly id: string;
  readonly snippet?: string;
  readonly messages?: readonly GmailMessage[];
}

/** A message as the model reads it. */
export interface ReadMessage {
  readonly id: string;
  readonly from?: string;
  readonly to?: string;
  readonly cc?: string;
  readonly date?: string;
  readonly subject?: string;
  readonly messageId?: string;
  readonly labels: readonly string[];
  readonly body: string;
  readonly attachments: readonly string[];
}

/** A thread in a search result: who, what, when, and whether it is unread. */
export interface ThreadSummary {
  readonly id: string;
  readonly subject?: string;
  readonly from?: string;
  readonly date?: string;
  readonly snippet?: string;
  readonly messages: number;
  readonly unread: boolean;
  readonly labels: readonly string[];
}

/** A header's value, by case-insensitive name. */
export function header(part: GmailMessagePart | undefined, name: string): string | undefined {
  const lower = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

const charsetOf = (part: GmailMessagePart) =>
  /charset="?([^";\s]+)"?/i.exec(header(part, "Content-Type") ?? "")?.[1] ?? "utf-8";

const decodeBody = (part: GmailMessagePart): string => {
  const data = part.body?.data;
  if (!data) return "";
  const bytes = fromBase64(data);
  try {
    return new TextDecoder(charsetOf(part)).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
};

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTML to readable text: scripts and styles dropped, block ends as line breaks, tags removed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code =
          e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Every leaf part, depth first. */
const leaves = (part: GmailMessagePart | undefined): GmailMessagePart[] =>
  !part ? [] : part.parts?.length ? part.parts.flatMap(leaves) : [part];

/** The text of a message: its plain-text parts, or its HTML ones made readable. */
export function messageText(payload: GmailMessagePart | undefined): string {
  const parts = leaves(payload).filter((p) => !p.filename);
  const plain = parts.filter((p) => p.mimeType === "text/plain").map(decodeBody);
  if (plain.some((t) => t.trim())) return plain.join("\n\n").trim();
  const html = parts.filter((p) => p.mimeType === "text/html").map(decodeBody);
  return htmlToText(html.join("\n"));
}

/** A message body longer than this is cut, so one long thread does not crowd out the rest. */
export const MAX_BODY_CHARS = 8000;

/** Drops undefined fields, so an absent header is left out rather than set to `undefined`. */
const defined = <T extends object>(o: { [K in keyof T]-?: T[K] | undefined }): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** A Gmail message read for the model: the headers that matter and the text, capped. */
export function readMessage(message: GmailMessage, maxBody = MAX_BODY_CHARS): ReadMessage {
  const p = message.payload;
  const text = messageText(p);
  return defined<ReadMessage>({
    id: message.id,
    from: header(p, "From"),
    to: header(p, "To"),
    cc: header(p, "Cc"),
    date: header(p, "Date"),
    subject: header(p, "Subject"),
    messageId: header(p, "Message-ID"),
    labels: message.labelIds ?? [],
    body:
      text.length > maxBody ? `${text.slice(0, maxBody)}\n[… cut at ${maxBody} characters]` : text,
    attachments: leaves(p)
      .map((x) => x.filename)
      .filter((f): f is string => Boolean(f)),
  });
}

/** A whole thread, oldest message first, as Gmail returns it. */
export function readThread(thread: GmailThread): { id: string; messages: ReadMessage[] } {
  return { id: thread.id, messages: (thread.messages ?? []).map((m) => readMessage(m)) };
}

/** One line per thread for a search result, from a `format=metadata` thread. */
export function summarizeThread(thread: GmailThread): ThreadSummary {
  const messages = thread.messages ?? [];
  const first = messages[0]?.payload;
  const last = messages[messages.length - 1];
  const labels = [...new Set(messages.flatMap((m) => m.labelIds ?? []))];
  return defined<ThreadSummary>({
    id: thread.id,
    subject: header(first, "Subject"),
    from: header(first, "From"),
    date: header(last?.payload, "Date"),
    snippet: last?.snippet ?? thread.snippet,
    messages: messages.length,
    unread: labels.includes("UNREAD"),
    labels,
  });
}
