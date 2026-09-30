import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NewRuntimeEvent, RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { createRedactor } from "../secrets/redact.js";
import { openDatabase } from "./database.js";
import { EventStore } from "./event-store.js";

const fixedClock = () => {
  let t = Date.parse("2026-09-29T12:00:00.000Z");
  return () => {
    t += 1000;
    return new Date(t);
  };
};

const store = (path = ":memory:") => new EventStore(openDatabase(path), { now: fixedClock() });

const delta = (text: string): NewRuntimeEvent => ({
  type: "run.delta",
  agentId: "pm",
  sessionId: "s1",
  runId: "r1",
  payload: { text },
});

describe("EventStore", () => {
  it("assigns monotonically increasing seq starting at 1, and the clock's time", () => {
    const s = store();
    const a = s.append({ type: "station.started", payload: {} });
    const b = s.append(delta("hi"));
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(a.at).toBe("2026-09-29T12:00:01.000Z");
    expect(s.latestSeq()).toBe(2);
  });

  it("replays everything after a seq, in order, exactly as appended", () => {
    const s = store();
    const appended = ["a", "b", "c", "d"].map((t) => s.append(delta(t)));
    expect(s.since(0)).toEqual(appended);
    expect(s.since(2)).toEqual(appended.slice(2));
    expect(s.since(4)).toEqual([]);
  });

  it("redacts secrets from payloads before storing or sending them", () => {
    const seen: RuntimeEvent[] = [];
    const s = new EventStore(openDatabase(":memory:"), {
      now: fixedClock(),
      redact: createRedactor(() => ["known-secret-value"]),
    });
    s.subscribe((e) => seen.push(e));
    s.append(delta("key sk-or-v1-abcdefghijklmnop and known-secret-value"));
    expect(s.since(0)[0]?.payload).toEqual({ text: "key [redacted] and [redacted]" });
    expect(seen[0]?.payload).toEqual({ text: "key [redacted] and [redacted]" });
  });

  it("publishes ephemeral events to subscribers without storing them", () => {
    const s = store();
    const seen: RuntimeEvent[] = [];
    s.subscribe((e) => seen.push(e));
    s.append({ type: "station.started", payload: {} });
    s.publish(delta("He"));
    expect(seen[1]).toMatchObject({ seq: 1, ephemeral: true, payload: { text: "He" } });
    expect(s.since(0).map((e) => e.type)).toEqual(["station.started"]);
    expect(s.latestSeq()).toBe(1);
  });

  it("pages a replay with a limit", () => {
    const s = store();
    for (const t of ["a", "b", "c"]) s.append(delta(t));
    expect(s.since(0, 2).map((e) => e.seq)).toEqual([1, 2]);
  });

  it("rejects an event that does not match the schema and writes nothing", () => {
    const s = store();
    expect(() =>
      s.append({ type: "run.delta", payload: { text: "x" } } as unknown as NewRuntimeEvent),
    ).toThrow(/run\.delta/);
    expect(s.latestSeq()).toBe(0);
  });

  it("notifies subscribers after the event is durable, and stops after unsubscribe", () => {
    const s = store();
    const seen: RuntimeEvent[] = [];
    const off = s.subscribe((e) => {
      seen.push(e);
      expect(s.latestSeq()).toBe(e.seq);
    });
    s.append(delta("a"));
    off();
    s.append(delta("b"));
    expect(seen.map((e) => e.seq)).toEqual([1]);
  });

  it("keeps a throwing subscriber from breaking the append or other subscribers, and reports it", () => {
    const failures: unknown[] = [];
    const s = new EventStore(openDatabase(":memory:"), {
      now: fixedClock(),
      onListenerError: (e) => failures.push(e),
    });
    const seen: number[] = [];
    s.subscribe(() => {
      throw new Error("bad listener");
    });
    s.subscribe((e) => seen.push(e.seq));
    expect(() => s.append(delta("a"))).not.toThrow();
    expect(seen).toEqual([1]);
    expect(failures).toHaveLength(1);
  });

  it("survives a reopen: seq continues where it left off, nothing is lost or duplicated", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ow-db-")), "station.db");
    const first = store(path);
    first.append(delta("a"));
    first.append(delta("b"));
    first.close();
    const second = store(path);
    expect(second.since(0).map((e) => e.payload)).toEqual([{ text: "a" }, { text: "b" }]);
    expect(second.append(delta("c")).seq).toBe(3);
    second.close();
  });
});

describe("openDatabase", () => {
  it("applies migrations once and records them, however often it is opened", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ow-db-")), "station.db");
    openDatabase(path).close();
    const db = openDatabase(path);
    const applied = db.prepare("select version from schema_migrations order by version").all();
    expect(applied).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
    ]);
    db.close();
  });

  it("uses WAL journaling and enforces foreign keys for a file database", () => {
    const path = join(mkdtempSync(join(tmpdir(), "ow-db-")), "station.db");
    const db = openDatabase(path);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
  });

  it("refuses to update or delete an event: the log is append-only", () => {
    const db = openDatabase(":memory:");
    const s = new EventStore(db, { now: fixedClock() });
    s.append(delta("a"));
    expect(() => db.prepare("update events set type = 'x'").run()).toThrow(/append-only/);
    expect(() => db.prepare("delete from events").run()).toThrow(/append-only/);
  });
});
