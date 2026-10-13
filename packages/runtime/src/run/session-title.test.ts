import { TITLE_INSTRUCTIONS } from "@darthsaul/outerworld-ai-core";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createRedactor } from "../secrets/redact.js";
import { apiError, reply, type Step, setup } from "../test/loop.js";

/** A model that answers title requests from `titles` and everything else from `runs`. */
const titled = (titles: Step[], runs: Step[]) => {
  const next = { title: 0, run: 0 };
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const isTitle = prompt.find((m) => m.role === "system")?.content === TITLE_INSTRUCTIONS;
      const step = isTitle ? titles[next.title++] : runs[next.run++];
      if (step === undefined) throw new Error("script exhausted");
      if (step instanceof Error) throw step;
      return step as never;
    },
  });
};

const titleOf = (t: ReturnType<typeof setup>, id: string) => t.sessions.getSession(id)?.title;

describe("RunService: session titles (ADR-0014)", () => {
  it("names a new session from the first message, as spend of that run", async () => {
    const t = setup(titled([reply('"Launch email plan."')], [reply("On it.")]), { titles: true });
    const session = t.service.createSession("vesper");
    const { runId } = await t.service.send(session.id, "Help me plan the launch email");
    await t.service.settled(runId);
    await vi.waitFor(() => expect(titleOf(t, session.id)).toBe("Launch email plan"));
    const title = t.model.doStreamCalls.find(
      (c) => c.prompt[0]?.role === "system" && c.prompt[0].content === TITLE_INSTRUCTIONS,
    );
    expect(title?.prompt.at(-1)).toMatchObject({ role: "user" });
    expect(JSON.stringify(title?.prompt.at(-1))).toContain("Help me plan the launch email");
    expect(t.spend.forRun(runId).calls).toBe(2);
    expect(t.events.since(0).find((e) => e.type === "session.renamed")?.payload).toEqual({
      title: "Launch email plan",
    });
  });

  it("names a session once: later messages and a Commander's own name are left alone", async () => {
    const t = setup(titled([reply("First title")], [reply("One"), reply("Two")]), {
      titles: true,
    });
    const session = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(session.id, "First")).runId);
    await vi.waitFor(() => expect(titleOf(t, session.id)).toBe("First title"));
    await t.service.settled((await t.service.send(session.id, "Second")).runId);
    expect(t.model.doStreamCalls).toHaveLength(3);

    const named = t.service.createSession("vesper", "My own name");
    await t.service.settled((await t.service.send(named.id, "Hello")).runId);
    expect(titleOf(t, named.id)).toBe("My own name");
  });

  it("falls back to the message itself when the model fails or says nothing", async () => {
    const t = setup(titled([apiError(500), reply("  ")], [reply("One"), reply("Two")]), {
      titles: true,
    });
    const a = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(a.id, "Summarize\nthe week")).runId);
    await vi.waitFor(() => expect(titleOf(t, a.id)).toBe("Summarize the week"));
    const b = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(b.id, "Draft notes")).runId);
    await vi.waitFor(() => expect(titleOf(t, b.id)).toBe("Draft notes"));
  });

  it("redacts a known secret from a title", async () => {
    const secret = "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const t = setup(titled([reply(`Key ${secret}`)], [reply("ok")]), {
      titles: true,
      redact: createRedactor(() => [secret]),
    });
    const session = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(session.id, "hello")).runId);
    await vi.waitFor(() => expect(titleOf(t, session.id)).not.toBe("New session"));
    expect(titleOf(t, session.id)).not.toContain(secret);
  });

  it("is off unless asked for: the model sees only the run", async () => {
    const t = setup(titled([], [reply("ok")]));
    const session = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(session.id, "hello")).runId);
    expect(t.model.doStreamCalls).toHaveLength(1);
    expect(titleOf(t, session.id)).toBe("New session");
  });
});
