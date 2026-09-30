import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../storage/database.js";
import { SessionStore } from "./session-store.js";

const clock = () => {
  let t = Date.parse("2026-09-29T12:00:00.000Z");
  return () => {
    t += 1000;
    return new Date(t);
  };
};

const store = (path = ":memory:") => new SessionStore(openDatabase(path), { now: clock() });

describe("SessionStore: sessions", () => {
  it("creates, lists newest first, renames, and archives sessions per agent", () => {
    const s = store();
    const a = s.createSession("vesper", "First");
    const b = s.createSession("vesper", "Second");
    s.createSession("quill", "Other agent");
    expect(s.listSessions("vesper").map((x) => x.title)).toEqual(["Second", "First"]);
    s.renameSession(a.id, "Renamed");
    s.archiveSession(b.id);
    expect(s.listSessions("vesper").map((x) => x.title)).toEqual(["Renamed"]);
    expect(s.listSessions("vesper", { includeArchived: true })).toHaveLength(2);
    expect(s.getSession(b.id)?.archivedAt).toBe("2026-09-29T12:00:04.000Z");
  });

  it("returns undefined for an unknown session and refuses to rename one", () => {
    const s = store();
    expect(s.getSession("nope")).toBeUndefined();
    expect(() => s.renameSession("nope", "x")).toThrow(/no session/);
  });
});

describe("SessionStore: messages", () => {
  it("appends messages in order and reads them back exactly", () => {
    const s = store();
    const { id } = s.createSession("vesper", "Chat");
    s.appendMessage(id, undefined, { role: "user", text: "hi" });
    s.appendMessage(id, undefined, {
      role: "assistant",
      text: "",
      toolCalls: [{ id: "c1", name: "web_fetch", input: { url: "u" } }],
    });
    s.appendMessage(id, undefined, {
      role: "tool",
      toolCallId: "c1",
      name: "web_fetch",
      output: "p",
    });
    expect(s.messages(id).map((m) => m.message.role)).toEqual(["user", "assistant", "tool"]);
    expect(s.messages(id).map((m) => m.position)).toEqual([1, 2, 3]);
  });

  it("refuses a message that does not match the schema", () => {
    const s = store();
    const { id } = s.createSession("vesper", "Chat");
    expect(() => s.appendMessage(id, undefined, { role: "system", text: "x" } as never)).toThrow();
    expect(s.messages(id)).toEqual([]);
  });
});

describe("SessionStore: runs", () => {
  it("creates a queued run and moves it only along the state machine", () => {
    const s = store();
    const { id: sessionId } = s.createSession("vesper", "Chat");
    const run = s.createRun({ sessionId, agentId: "vesper", trigger: "user", model: "m" });
    expect(run.state).toBe("queued");
    expect(s.transition(run.id, "start").state).toBe("running");
    expect(s.getRun(run.id)?.startedAt).toBeDefined();
    expect(() => s.transition(run.id, "resolve_consent")).toThrow(/running.*resolve_consent/);
    const done = s.transition(run.id, "complete");
    expect(done.state).toBe("completed");
    expect(done.endedAt).toBeDefined();
    expect(() => s.transition(run.id, "cancel")).toThrow();
  });

  it("records the error of a failed run and counts steps", () => {
    const s = store();
    const { id: sessionId } = s.createSession("vesper", "Chat");
    const run = s.createRun({ sessionId, agentId: "vesper", trigger: "user", model: "m" });
    s.transition(run.id, "start");
    s.countStep(run.id);
    s.countStep(run.id);
    const failed = s.transition(run.id, "fail", { error: "provider error" });
    expect(failed).toMatchObject({ state: "failed", error: "provider error", steps: 2 });
  });

  it("finds every unfinished run, and after a restart marks them interrupted without touching finished ones", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ow-sess-")), "station.db");
    const before = store(path);
    const { id: sessionId } = before.createSession("vesper", "Chat");
    const make = () =>
      before.createRun({ sessionId, agentId: "vesper", trigger: "user", model: "m" });
    const queued = make();
    const running = make();
    before.transition(running.id, "start");
    const done = make();
    before.transition(done.id, "start");
    before.transition(done.id, "complete");
    before.appendMessage(sessionId, running.id, { role: "user", text: "hello" });

    const after = store(path);
    const interrupted = after.interruptUnfinished();
    expect(interrupted.map((r) => r.id).sort()).toEqual([queued.id, running.id].sort());
    expect(after.getRun(queued.id)?.state).toBe("interrupted");
    expect(after.getRun(done.id)?.state).toBe("completed");
    expect(after.messages(sessionId)).toHaveLength(1);
    expect(after.interruptUnfinished()).toEqual([]);
  });

  it("lists a session's runs, newest first", () => {
    const s = store();
    const { id: sessionId } = s.createSession("vesper", "Chat");
    const a = s.createRun({ sessionId, agentId: "vesper", trigger: "user", model: "m" });
    const b = s.createRun({ sessionId, agentId: "vesper", trigger: "user", model: "m" });
    expect(s.runs(sessionId).map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
