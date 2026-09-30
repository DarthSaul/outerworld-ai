import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import {
  assemblePrompt,
  type ChatMessage,
  ChatMessage as ChatMessageSchema,
  estimateTokens,
  historyBudget,
  roleBriefing,
  UNTRUSTED_DATA_NOTICE,
} from "./prompt.js";

const docs = {
  identity: "# Vesper\nCalm and brief.",
  purpose: "Lead the station.",
  "standing-orders": "",
  context: "Fictional.",
};

const user = (text: string): ChatMessage => ({ role: "user", text });
const assistant = (text: string): ChatMessage => ({ role: "assistant", text });

describe("assemblePrompt: system prompt", () => {
  it("puts the documents in order under headings, skips empty ones, and ends with the data notice", () => {
    const { system } = assemblePrompt({
      documents: docs,
      history: [user("hi")],
      budgetTokens: 10_000,
    });
    expect(system).toBe(
      [
        "# Identity\n\n# Vesper\nCalm and brief.",
        "# Purpose\n\nLead the station.",
        "# Context\n\nFictional.",
        UNTRUSTED_DATA_NOTICE,
      ].join("\n\n"),
    );
  });

  it("adds the role briefing and approved beliefs, newest first, capped by a token share", () => {
    const { system } = assemblePrompt({
      documents: docs,
      roleBriefing: "You lead: Quill (operations).",
      beliefs: ["Prefers bullet points.", "Works in UTC."],
      history: [user("hi")],
      budgetTokens: 10_000,
    });
    expect(system).toContain("# Your role\n\nYou lead: Quill (operations).");
    expect(system).toContain("# What you remember\n\n- Prefers bullet points.\n- Works in UTC.");
  });

  it("drops the oldest beliefs first when they exceed their share of the budget", () => {
    const beliefs = ["newest", "x".repeat(4000), "oldest"];
    const { system } = assemblePrompt({
      documents: docs,
      beliefs,
      history: [],
      budgetTokens: 2_000,
    });
    expect(system).toContain("- newest");
    expect(system).not.toContain("- oldest");
  });
});

describe("assemblePrompt: history window", () => {
  it("keeps the whole history when it fits", () => {
    const history = [user("a"), assistant("b"), user("c")];
    const out = assemblePrompt({ documents: docs, history, budgetTokens: 10_000 });
    expect(out.messages).toEqual(history);
    expect(out.dropped).toBe(0);
  });

  it("drops whole oldest turns, never splitting a tool call from its result", () => {
    const history: ChatMessage[] = [
      user("x".repeat(400)),
      assistant("y".repeat(400)),
      user("look it up"),
      {
        role: "assistant",
        text: "",
        toolCalls: [{ id: "c1", name: "web_fetch", input: { url: "u" } }],
      },
      { role: "tool", toolCallId: "c1", name: "web_fetch", output: "page" },
      assistant("found it"),
      user("thanks"),
    ];
    const system = estimateTokens(
      assemblePrompt({ documents: docs, history: [], budgetTokens: 1e6 }).system,
    );
    const out = assemblePrompt({ documents: docs, history, budgetTokens: system + 60 });
    expect(out.messages[0]).toEqual(user("look it up"));
    expect(out.messages).toHaveLength(5);
    expect(out.dropped).toBe(2);
  });

  it("always keeps the current turn, even when it alone exceeds the budget", () => {
    const history = [user("old"), user("z".repeat(10_000))];
    const out = assemblePrompt({ documents: docs, history, budgetTokens: 10 });
    expect(out.messages).toEqual([user("z".repeat(10_000))]);
  });

  it("drops tool messages that come before any user message rather than orphaning them", () => {
    const history: ChatMessage[] = [
      { role: "tool", toolCallId: "c0", name: "t", output: 1 },
      user("hi"),
    ];
    expect(assemblePrompt({ documents: docs, history, budgetTokens: 10_000 }).messages).toEqual([
      user("hi"),
    ]);
  });
});

describe("roleBriefing", () => {
  const station: StationConfig = {
    schemaVersion: 1,
    name: "Demo",
    rooms: [
      { id: "command", name: "Command", props: [] },
      { id: "ops", name: "Operations", description: "Projects.", props: [] },
    ],
    lanes: [],
    connectors: [],
    budgets: {},
    dispatch: { maxDepth: 1, autoReview: true },
  };
  const a = (name: string, roomId: string, role: "overseer" | "crew"): AgentConfig => ({
    schemaVersion: 1,
    name,
    roomId,
    role,
    model: "m",
    approvalMode: "ask",
    connectorGrants: [],
    schedules: [],
  });
  const crew = [
    { id: "vesper", config: a("Vesper", "command", "overseer") },
    { id: "quill", config: a("Quill", "ops", "crew") },
  ];

  it("gives the Overseer the station and its crew roster", () => {
    const b = roleBriefing("vesper", station, crew);
    expect(b).toContain("You are the Overseer of Demo");
    expect(b).toContain("- Quill (id: quill), Operations: Projects.");
    expect(b).not.toContain("(id: vesper)");
  });

  it("tells crew their room and who leads the station", () => {
    expect(roleBriefing("quill", station, crew)).toBe(
      "You are a crew member of Demo, in the Operations room. Vesper is the Overseer.",
    );
  });
});

describe("helpers", () => {
  it("estimates tokens as characters over four, rounded up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });

  it("gives history half the context window, capped to keep prompts affordable", () => {
    expect(historyBudget(1_000_000)).toBe(32_000);
    expect(historyBudget(40_000)).toBe(20_000);
  });

  it("validates stored messages", () => {
    expect(ChatMessageSchema.safeParse({ role: "user", text: "hi" }).success).toBe(true);
    expect(ChatMessageSchema.safeParse({ role: "system", text: "hi" }).success).toBe(false);
  });
});
