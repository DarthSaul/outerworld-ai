import {
  buildRawMessage,
  type GmailThread,
  header,
  type ReadMessage,
  readThread,
  replyHeaders,
  replySubject,
  summarizeThread,
  type ThreadSummary,
} from "@darthsaul/outerworld-ai-core";
import { type Fetch, SignInRequiredError } from "./google-oauth.js";

/**
 * A thin client for the Gmail REST API v1 (https://developers.google.com/workspace/gmail/api/
 * reference/rest, checked 2026-11-18), as the signed-in user (`users/me`). Only what the Gmail
 * service's tools need: search, read, labels, drafts, label changes, trash. Nothing sends.
 */
export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/";

/** Threads a search returns at most, each fetched for its summary. */
export const MAX_SEARCH_RESULTS = 20;

/** A current access token; `force` asks for a renewed one after Gmail refused the last. */
export type AccessToken = (options?: { force?: boolean }) => Promise<string>;

export interface Label {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
}

export interface NewDraft {
  readonly to: readonly string[];
  readonly cc?: readonly string[] | undefined;
  readonly bcc?: readonly string[] | undefined;
  readonly subject?: string | undefined;
  readonly body: string;
  /** Reply in this thread: the subject and threading headers come from its last message. */
  readonly threadId?: string | undefined;
}

/** An error from Gmail with its status; the message is Gmail's own, never a token. */
export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

export class GmailApi {
  readonly #fetch: Fetch;
  readonly #token: AccessToken;

  constructor(options: { fetch: Fetch; token: AccessToken }) {
    this.#fetch = options.fetch;
    this.#token = options.token;
  }

  /** One call, retried once with a renewed token if Gmail refuses the current one. */
  async #call<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string | string[] | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(path, GMAIL_API_BASE);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) {
        url.searchParams.append(k, one);
      }
    }
    const send = async (force: boolean) =>
      this.#fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${await this.#token({ force })}`,
          accept: "application/json",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    let res = await send(false);
    if (res.status === 401) {
      res = await send(true);
      if (res.status === 401) throw new SignInRequiredError("Gmail refused the sign-in");
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    if (!res.ok) {
      const why = json.error?.message ?? json.error?.status ?? `HTTP ${res.status}`;
      throw new GmailApiError(res.status, `Gmail: ${why}`);
    }
    return json as T;
  }

  /** Threads matching a Gmail search (the search box's syntax), newest first, summarized. */
  async searchThreads(input: {
    query?: string | undefined;
    maxResults?: number | undefined;
    pageToken?: string | undefined;
  }): Promise<{ threads: ThreadSummary[]; nextPageToken?: string }> {
    const max = Math.min(Math.max(input.maxResults ?? 10, 1), MAX_SEARCH_RESULTS);
    const listed = await this.#call<{ threads?: Array<{ id: string }>; nextPageToken?: string }>(
      "GET",
      "threads",
      {
        query: {
          q: input.query || undefined,
          maxResults: String(max),
          pageToken: input.pageToken,
        },
      },
    );
    const threads = await Promise.all(
      (listed.threads ?? []).map((t) =>
        this.#call<GmailThread>("GET", `threads/${encodeURIComponent(t.id)}`, {
          query: { format: "metadata", metadataHeaders: ["Subject", "From", "Date"] },
        }).then(summarizeThread),
      ),
    );
    return { threads, ...(listed.nextPageToken ? { nextPageToken: listed.nextPageToken } : {}) };
  }

  /** A whole thread, oldest message first, as text. */
  async getThread(id: string): Promise<{ id: string; messages: ReadMessage[] }> {
    return readThread(await this.#rawThread(id, "full"));
  }

  #rawThread(id: string, format: "full" | "metadata"): Promise<GmailThread> {
    return this.#call<GmailThread>("GET", `threads/${encodeURIComponent(id)}`, {
      query: { format },
    });
  }

  /** Every label: Gmail's system labels (INBOX, UNREAD, STARRED…) and the user's own. */
  async listLabels(): Promise<Label[]> {
    const got = await this.#call<{ labels?: Label[] }>("GET", "labels");
    return (got.labels ?? []).map(({ id, name, type }) => ({
      id,
      name,
      ...(type ? { type } : {}),
    }));
  }

  /**
   * Creates a draft; nothing is sent. A reply goes in the thread: Gmail threads a message only
   * with the thread id, matching subjects, and RFC 2822 In-Reply-To and References.
   */
  async createDraft(
    input: NewDraft,
  ): Promise<{ draftId: string; messageId?: string; threadId?: string }> {
    let subject = input.subject ?? "";
    let threading: { inReplyTo?: string; references?: string } = {};
    if (input.threadId) {
      const thread = await this.#rawThread(input.threadId, "metadata");
      const last = thread.messages?.[thread.messages.length - 1]?.payload;
      if (!last) throw new GmailApiError(404, "Gmail: that thread has no messages");
      subject = replySubject(header(last, "Subject") ?? subject);
      threading = replyHeaders(header(last, "Message-ID"), header(last, "References"));
    }
    if (!subject.trim()) throw new Error("a new draft needs a subject");
    const raw = buildRawMessage({
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject,
      body: input.body,
      ...threading,
    });
    const draft = await this.#call<{ id: string; message?: { id?: string; threadId?: string } }>(
      "POST",
      "drafts",
      { body: { message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } } },
    );
    return {
      draftId: draft.id,
      ...(draft.message?.id ? { messageId: draft.message.id } : {}),
      ...(draft.message?.threadId ? { threadId: draft.message.threadId } : {}),
    };
  }

  /** Adds and removes labels on every message in a thread (archive: remove INBOX). */
  async modifyThreadLabels(input: {
    threadId: string;
    add?: readonly string[] | undefined;
    remove?: readonly string[] | undefined;
  }): Promise<{ id: string; labels: string[] }> {
    const thread = await this.#call<GmailThread>(
      "POST",
      `threads/${encodeURIComponent(input.threadId)}/modify`,
      { body: { addLabelIds: input.add ?? [], removeLabelIds: input.remove ?? [] } },
    );
    return { id: thread.id, labels: summarizeThread(thread).labels as string[] };
  }

  /** Moves a thread to the trash, where Gmail keeps it for 30 days; never a permanent delete. */
  async trashThread(id: string): Promise<{ id: string; trashed: true }> {
    const thread = await this.#call<GmailThread>("POST", `threads/${encodeURIComponent(id)}/trash`);
    return { id: thread.id, trashed: true };
  }
}
