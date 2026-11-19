import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { GmailApi } from "./gmail-api.js";
import { SignInRequiredError } from "./google-oauth.js";

/**
 * The Gmail service's tools as an MCP server that runs in memory inside the daemon (ADR-0022):
 * no port and no process, only an adapter so the connector pipeline (grants, classes, consent,
 * status, sign-in) treats Gmail like any other connector. Each tool makes plain HTTPS calls to
 * the Gmail API. The annotations match core's `KNOWN_TOOL_CLASSES`, which stay authoritative.
 */
export function createGmailServer(
  api: GmailApi,
  options: { onSignInRequired?: () => Promise<void> } = {},
): McpServer {
  const server = new McpServer({ name: "outerworld-gmail", version: "1.0.0" });
  const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;
  const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

  /** A tool's result as JSON text; a failure as an error result the agent can read. */
  const run = async (work: () => Promise<unknown>) => {
    try {
      const value = await work();
      return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
    } catch (error) {
      if (error instanceof SignInRequiredError) await options.onSignInRequired?.();
      const text = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text }], isError: true };
    }
  };

  const addresses = z.array(z.string().trim().min(3).max(320)).max(50);

  server.registerTool(
    "search_threads",
    {
      description:
        "Search the mailbox with Gmail's search syntax (from:, to:, subject:, is:unread, label:, newer_than:2d, …) and list matching threads, newest first, with subject, sender, date, snippet, and labels. An empty query lists the latest threads.",
      inputSchema: z.object({
        query: z.string().max(500).optional().describe("Gmail search, e.g. 'is:unread in:inbox'"),
        maxResults: z.number().int().min(1).max(20).optional().describe("At most 20; default 10"),
        pageToken: z.string().max(200).optional().describe("nextPageToken from a previous search"),
      }),
      annotations: READ,
    },
    (args) => run(() => api.searchThreads(args)),
  );

  server.registerTool(
    "get_thread",
    {
      description:
        "Read a whole thread, oldest message first: sender, recipients, date, subject, Message-ID, labels, the text of each message, and attachment names.",
      inputSchema: z.object({ threadId: z.string().min(1).max(100) }),
      annotations: READ,
    },
    ({ threadId }) => run(() => api.getThread(threadId)),
  );

  server.registerTool(
    "list_labels",
    {
      description:
        "List the mailbox's labels with their ids: system ones (INBOX, UNREAD, STARRED, IMPORTANT, SPAM, TRASH, CATEGORY_*) and the user's own. Label changes take ids, not names.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    () => run(() => api.listLabels()),
  );

  server.registerTool(
    "create_draft",
    {
      description:
        "Create a plain-text draft in Gmail. It is never sent; the Commander reviews and sends it. Give threadId to reply inside a thread: the subject and threading headers then come from its last message.",
      inputSchema: z.object({
        to: addresses.min(1),
        cc: addresses.optional(),
        bcc: addresses.optional(),
        subject: z.string().max(500).optional().describe("Required unless replying in a thread"),
        body: z.string().max(100_000),
        threadId: z.string().min(1).max(100).optional(),
      }),
      annotations: WRITE,
    },
    (args) => run(() => api.createDraft(args)),
  );

  server.registerTool(
    "modify_thread_labels",
    {
      description:
        "Add or remove labels on every message in a thread, by label id. Archive: remove INBOX. Mark read: remove UNREAD. Star: add STARRED.",
      inputSchema: z.object({
        threadId: z.string().min(1).max(100),
        add: z.array(z.string().min(1).max(200)).max(100).optional(),
        remove: z.array(z.string().min(1).max(200)).max(100).optional(),
      }),
      annotations: WRITE,
    },
    (args) => run(() => api.modifyThreadLabels(args)),
  );

  server.registerTool(
    "trash_thread",
    {
      description:
        "Move a thread to the trash. Gmail keeps it there for 30 days and it can be restored; nothing is deleted permanently.",
      inputSchema: z.object({ threadId: z.string().min(1).max(100) }),
      annotations: WRITE,
    },
    ({ threadId }) => run(() => api.trashThread(threadId)),
  );

  return server;
}
