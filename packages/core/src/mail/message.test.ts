import { describe, expect, it } from "vitest";
import { fromBase64, toBase64, toBase64Url, utf8 } from "./base64.js";
import {
  buildMessage,
  buildRawMessage,
  encodeHeaderValue,
  type GmailMessage,
  htmlToText,
  readMessage,
  readThread,
  replyHeaders,
  replySubject,
  summarizeThread,
} from "./message.js";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const b64url = (s: string) => toBase64Url(utf8(s));

describe("base64", () => {
  it("matches the standard encoding, padded and unpadded", () => {
    for (const s of ["", "f", "fo", "foo", "foob", "fooba", "foobar"]) {
      expect(toBase64(utf8(s))).toBe(Buffer.from(s).toString("base64"));
      expect(toBase64Url(utf8(s))).toBe(Buffer.from(s).toString("base64url"));
      expect(text(fromBase64(Buffer.from(s).toString("base64")))).toBe(s);
    }
  });

  it("round trips bytes that use the url-safe characters", () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xfe, 0x3e, 0x3f]);
    const url = toBase64Url(bytes);
    expect(url).not.toMatch(/[+/=]/);
    expect([...fromBase64(url)]).toEqual([...bytes]);
  });
});

describe("buildMessage", () => {
  const parse = (raw: string) => {
    const [head = "", body = ""] = raw.split("\r\n\r\n");
    return { head: head.split("\r\n"), body: text(fromBase64(body)) };
  };

  it("writes a plain-text RFC 2822 message with a base64 UTF-8 body", () => {
    const m = parse(
      buildMessage({
        to: ["ada@example.test", "bo@example.test"],
        cc: ["cy@example.test"],
        subject: "Status",
        body: "Hello,\nall well.\n— A",
      }),
    );
    expect(m.head).toEqual([
      "To: ada@example.test, bo@example.test",
      "Cc: cy@example.test",
      "Subject: Status",
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ]);
    expect(m.body).toBe("Hello,\r\nall well.\r\n— A");
  });

  it("sets the threading headers for a reply", () => {
    const { head } = parse(
      buildMessage({
        to: ["ada@example.test"],
        subject: "Re: Status",
        body: "Thanks",
        inReplyTo: "<b@x.test>",
        references: "<a@x.test> <b@x.test>",
      }),
    );
    expect(head).toContain("In-Reply-To: <b@x.test>");
    expect(head).toContain("References: <a@x.test> <b@x.test>");
  });

  it("refuses a line break in any header value, so nothing can add a header", () => {
    const base = { to: ["ada@example.test"], subject: "x", body: "y" };
    expect(() => buildMessage({ ...base, subject: "x\r\nBcc: eve@example.test" })).toThrow(
      /line break/,
    );
    expect(() => buildMessage({ ...base, to: ["a@x.test\nBcc: eve@x.test"] })).toThrow(
      /line break/,
    );
    expect(() => buildMessage({ ...base, inReplyTo: "<a>\n" })).toThrow(/line break/);
  });

  it("needs a recipient", () => {
    expect(() => buildMessage({ to: [" "], subject: "x", body: "y" })).toThrow(/recipient/);
  });

  it("wraps long bodies at 76 characters", () => {
    const raw = buildMessage({ to: ["a@x.test"], subject: "x", body: "z".repeat(500) });
    const body = raw.split("\r\n\r\n")[1] ?? "";
    for (const line of body.trim().split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
  });

  it("is sent to Gmail as base64url", () => {
    const draft = { to: ["a@x.test"], subject: "x", body: "y" };
    expect(text(fromBase64(buildRawMessage(draft)))).toBe(buildMessage(draft));
    expect(buildRawMessage(draft)).not.toMatch(/[+/=]/);
  });
});

describe("encodeHeaderValue", () => {
  it("leaves ASCII alone and encodes anything else in words of at most 75 characters", () => {
    expect(encodeHeaderValue("Plain subject")).toBe("Plain subject");
    const subject = "Réunion — 会議の議題について、詳細をお知らせします ".repeat(3);
    const encoded = encodeHeaderValue(subject);
    const words = encoded.split("\r\n ");
    expect(words.length).toBeGreaterThan(1);
    for (const w of words) {
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(w.length).toBeLessThanOrEqual(75);
    }
    const decoded = words.map((w) => text(fromBase64(w.slice(10, -2)))).join("");
    expect(decoded).toBe(subject);
  });
});

describe("replies", () => {
  it("prefixes Re: once", () => {
    expect(replySubject("Status")).toBe("Re: Status");
    expect(replySubject("RE: Status")).toBe("RE: Status");
    expect(replySubject(" re: x ")).toBe("re: x");
  });

  it("chains References and ends them with the message replied to", () => {
    expect(replyHeaders("<b@x>", "<a@x>")).toEqual({
      inReplyTo: "<b@x>",
      references: "<a@x> <b@x>",
    });
    expect(replyHeaders("<a@x>", undefined)).toEqual({ inReplyTo: "<a@x>", references: "<a@x>" });
    expect(replyHeaders("<b@x>", "<a@x> <b@x>").references).toBe("<a@x> <b@x>");
    expect(replyHeaders(undefined, "<a@x>")).toEqual({});
  });
});

describe("reading Gmail messages", () => {
  const multipart: GmailMessage = {
    id: "m2",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "See attached",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Ada <ada@example.test>" },
        { name: "To", value: "me@example.test" },
        { name: "Subject", value: "Re: Report" },
        { name: "Date", value: "Tue, 17 Nov 2026 09:00:00 +0000" },
        { name: "Message-Id", value: "<m2@example.test>" },
      ],
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("See attached, café.") } },
            { mimeType: "text/html", body: { data: b64url("<p>See <b>attached</b></p>") } },
          ],
        },
        { mimeType: "application/pdf", filename: "report.pdf", body: { attachmentId: "a1" } },
      ],
    },
  };

  it("reads headers, the plain-text body, labels, and attachment names", () => {
    expect(readMessage(multipart)).toEqual({
      id: "m2",
      from: "Ada <ada@example.test>",
      to: "me@example.test",
      date: "Tue, 17 Nov 2026 09:00:00 +0000",
      subject: "Re: Report",
      messageId: "<m2@example.test>",
      labels: ["INBOX", "UNREAD"],
      body: "See attached, café.",
      attachments: ["report.pdf"],
    });
  });

  it("falls back to the HTML made readable when there is no plain text", () => {
    const html: GmailMessage = {
      id: "h",
      payload: {
        mimeType: "text/html",
        body: {
          data: b64url(
            "<html><head><style>p{}</style></head><body><p>Hi&nbsp;there &amp; you</p><script>x()</script><div>Line&#33;</div></body></html>",
          ),
        },
      },
    };
    expect(readMessage(html).body).toBe("Hi there & you\nLine!");
  });

  it("decodes a body in its declared charset", () => {
    const latin1: GmailMessage = {
      id: "l",
      payload: {
        mimeType: "text/plain",
        headers: [{ name: "Content-Type", value: "text/plain; charset=ISO-8859-1" }],
        body: { data: toBase64Url(Uint8Array.from([0x63, 0x61, 0x66, 0xe9])) },
      },
    };
    expect(readMessage(latin1).body).toBe("café");
  });

  it("cuts a long body and says so", () => {
    const long: GmailMessage = {
      id: "x",
      payload: { mimeType: "text/plain", body: { data: b64url("a".repeat(50)) } },
    };
    expect(readMessage(long, 10).body).toBe("aaaaaaaaaa\n[… cut at 10 characters]");
  });

  it("reads a thread in order and summarizes it for a search result", () => {
    const first: GmailMessage = {
      id: "m1",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "Subject", value: "Report" },
          { name: "From", value: "me@example.test" },
        ],
      },
    };
    const thread = { id: "t1", messages: [first, multipart] };
    expect(readThread(thread).messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(summarizeThread(thread)).toEqual({
      id: "t1",
      subject: "Report",
      from: "me@example.test",
      date: "Tue, 17 Nov 2026 09:00:00 +0000",
      snippet: "See attached",
      messages: 2,
      unread: true,
      labels: ["INBOX", "UNREAD"],
    });
  });
});

describe("htmlToText", () => {
  it("leaves unknown entities and drops tags", () => {
    expect(htmlToText("a &bogus; <i>b</i><br>c")).toBe("a &bogus; b\nc");
  });
});
