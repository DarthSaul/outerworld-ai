import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "../crew/crew-service.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { reply, scripted, setup } from "../test/loop.js";
import { MemoryService } from "./memory-service.js";
import { MemoryStore } from "./memory-store.js";

const clock = () => {
  let t = Date.parse("2026-09-30T12:00:00.000Z");
  return () => {
    t += 1000;
    return new Date(t);
  };
};

const make = () => {
  const db = openDatabase(":memory:");
  const events = new EventStore(db);
  const store = new MemoryStore(db, { now: clock() });
  const memory = new MemoryService({ store, events });
  const types = () => events.since(0).map((e) => e.type);
  return { store, memory, events, types };
};

describe("MemoryService: the Commander's decisions", () => {
  it("approves a proposal as it was proposed, or as the Commander edited it", () => {
    const { store, memory, types } = make();
    const a = store.propose({ agentId: "quill", scope: "agent", text: "Prefers bullets." });
    const b = store.propose({ agentId: "quill", scope: "agent", text: "Uses UTC" });
    expect(memory.approve(a.id)).toMatchObject({ status: "approved", text: "Prefers bullets." });
    expect(memory.approve(b.id, "Works in UTC.")).toMatchObject({
      status: "approved",
      text: "Works in UTC.",
    });
    expect(types()).toEqual(["memory.approved", "memory.approved"]);
  });

  it("rejects a proposal, and decides each only once", () => {
    const { store, memory } = make();
    const a = store.propose({ agentId: "quill", scope: "agent", text: "Wrong." });
    expect(memory.reject(a.id).status).toBe("rejected");
    expect(() => memory.approve(a.id)).toThrow(ConflictError);
    expect(() => memory.reject("nope")).toThrow(NotFoundError);
  });

  it("edits and deletes a stored belief, but not a pending or rejected one", () => {
    const { store, memory, types } = make();
    const a = store.propose({ agentId: "quill", scope: "agent", text: "Old." });
    expect(() => memory.edit(a.id, "New.")).toThrow(ConflictError);
    memory.approve(a.id);
    expect(memory.edit(a.id, "New.").text).toBe("New.");
    memory.delete(a.id);
    expect(store.get(a.id)).toBeUndefined();
    expect(types()).toEqual(["memory.approved", "memory.updated", "memory.updated"]);
  });

  it("gives an agent its own beliefs and every station-wide one, newest decision first", () => {
    const { store, memory } = make();
    const own = store.propose({ agentId: "quill", scope: "agent", text: "Quill: bullets." });
    const theirs = store.propose({ agentId: "vesper", scope: "agent", text: "Vesper only." });
    const shared = store.propose({
      agentId: "vesper",
      scope: "station",
      text: "Station runs on UTC.",
    });
    const pending = store.propose({ agentId: "quill", scope: "agent", text: "Not yet." });
    memory.approve(own.id);
    memory.approve(theirs.id);
    memory.approve(shared.id);
    expect(memory.beliefsFor("quill").map((m) => m.text)).toEqual([
      "Station runs on UTC.",
      "Quill: bullets.",
    ]);
    expect(memory.view("quill")).toEqual({
      proposals: [expect.objectContaining({ id: pending.id })],
      beliefs: [
        expect.objectContaining({ id: shared.id }),
        expect.objectContaining({ id: own.id }),
      ],
    });
  });
});

describe("beliefs in the prompt", () => {
  it("puts an approved belief in the next run's prompt and never a rejected one", async () => {
    const t = setup(scripted([reply("One."), reply("Two.")]));
    const approved = t.memoryStore.propose({
      agentId: "vesper",
      scope: "agent",
      text: "The Commander prefers short answers.",
    });
    const rejected = t.memoryStore.propose({
      agentId: "vesper",
      scope: "agent",
      text: "The Commander loves long essays.",
    });
    const s = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(s.id, "Hi")).runId);
    const before = String(t.model.doStreamCalls[0]?.prompt[0]?.content);
    expect(before).not.toContain("short answers");

    t.memory.approve(approved.id);
    t.memory.reject(rejected.id);
    await t.service.settled((await t.service.send(s.id, "Again")).runId);
    const after = String(t.model.doStreamCalls[1]?.prompt[0]?.content);
    expect(after).toContain("# What you remember\n\n- The Commander prefers short answers.");
    expect(after).not.toContain("long essays");
  });
});
