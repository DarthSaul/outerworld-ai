import { describe, expect, it } from "vitest";
import { createSseParser, type SseMessage } from "./sse.js";

const collect = (chunks: string[]) => {
  const out: SseMessage[] = [];
  const parser = createSseParser((m) => out.push(m));
  for (const c of chunks) parser.push(c);
  return out;
};

describe("createSseParser", () => {
  it("parses id, event, and data fields and dispatches on a blank line", () => {
    expect(collect(['id: 3\nevent: run.delta\ndata: {"a":1}\n\n'])).toEqual([
      { id: "3", event: "run.delta", data: '{"a":1}' },
    ]);
  });

  it("handles messages split across arbitrary chunk boundaries", () => {
    expect(collect(["id: 1\nda", "ta: hel", "lo\n", "\nid: 2\ndata: x\n\n"])).toEqual([
      { id: "1", data: "hello" },
      { id: "2", data: "x" },
    ]);
  });

  it("joins multiple data lines with a newline", () => {
    expect(collect(["data: a\ndata: b\n\n"])).toEqual([{ data: "a\nb" }]);
  });

  it("accepts CRLF and CR line endings", () => {
    expect(collect(["data: a\r\n\r\ndata: b\r\rdata: c\n\n"])).toEqual([
      { data: "a" },
      { data: "b" },
      { data: "c" },
    ]);
  });

  it("ignores comments (keepalive pings) and blocks without data", () => {
    expect(collect([": ping\n\n", "id: 9\n\n", "data: z\n\n"])).toEqual([{ data: "z" }]);
  });

  it("strips exactly one space after the colon and accepts a field with no colon", () => {
    expect(collect(["data:  two spaces\n\n", "data\n\n"])).toEqual([
      { data: " two spaces" },
      { data: "" },
    ]);
  });

  it("reports the last seen id even when a later message omits it", () => {
    const parser = createSseParser(() => {});
    parser.push("id: 5\ndata: a\n\ndata: b\n\n");
    expect(parser.lastEventId()).toBe("5");
  });
});
