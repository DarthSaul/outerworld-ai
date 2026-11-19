import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import {
  assemblePrompt,
  type ChatMessage,
  ChatMessage as ChatMessageSchema,
  estimateTokens,
  historyBudget,
  type PromptSkill,
  roleBriefing,
  SKILLS_CHAR_BUDGET,
  skillsSection,
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

  it("starts a turn at a worker's report, like a message from the Commander", () => {
    const history: ChatMessage[] = [
      user("x".repeat(4000)),
      {
        role: "report",
        dispatchId: "d1",
        from: "quill",
        status: "completed",
        text: "Hub updated.",
      },
      assistant("Reviewed."),
    ];
    const out = assemblePrompt({ documents: docs, history, budgetTokens: 400 });
    expect(out.messages.map((m) => m.role)).toEqual(["report", "assistant"]);
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
    skills: [],
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

describe("assemblePrompt: installed skills", () => {
  const skill = (id: string, body = `Steps for ${id}.`): PromptSkill => ({
    id,
    name: id.toUpperCase(),
    description: `When ${id} is asked for.`,
    body,
  });
  const base = {
    documents: docs,
    roleBriefing: "Crew.",
    history: [user("hi")],
    budgetTokens: 10_000,
  };

  it("is byte-identical to a skill-less prompt when no skill is offered", () => {
    const without = assemblePrompt(base).system;
    expect(assemblePrompt({ ...base, skills: { entries: [], mode: "index" } }).system).toBe(
      without,
    );
    expect(skillsSection({ entries: [], mode: "inline" })).toBeUndefined();
    expect(skillsSection(undefined)).toBeUndefined();
  });

  it("lists one line per skill in index mode, pointing at skill_view, between role and beliefs", () => {
    const { system } = assemblePrompt({
      ...base,
      beliefs: ["Works in UTC."],
      skills: { entries: [skill("plan"), skill("humanizer")], mode: "index" },
    });
    expect(system).toContain(
      "- PLAN (id: plan): When plan is asked for.\n- HUMANIZER (id: humanizer): When humanizer is asked for.",
    );
    expect(system).toContain("call skill_view with its id and follow that recipe");
    expect(system).toContain("skill_view returns the station's own installed recipes");
    expect(system).not.toContain("Steps for plan.");
    const role = system.indexOf("# Your role");
    const skills = system.indexOf("# Installed skills");
    const beliefs = system.indexOf("# What you remember");
    expect(role).toBeLessThan(skills);
    expect(skills).toBeLessThan(beliefs);
    expect(system.endsWith(UNTRUSTED_DATA_NOTICE)).toBe(true);
  });

  it("includes each body in inline mode and never mentions skill_view", () => {
    const text = skillsSection({ entries: [skill("plan")], mode: "inline" });
    expect(text).toBe(
      [
        "# Installed skills",
        "These are recipes the Commander installed on this station. When a task matches one, follow that recipe instead of improvising.",
        "## PLAN (id: plan)",
        "When plan is asked for.",
        "Steps for plan.",
      ].join("\n\n"),
    );
    expect(text).not.toContain("skill_view");
  });

  it("keeps entries in priority order within the budget and counts the rest", () => {
    const entries = ["mine", "a", "b", "c"].map((id) => skill(id, "x".repeat(400)));
    const text = skillsSection({ entries, mode: "inline", charBudget: 1_200 }) ?? "";
    expect(text.length).toBeLessThanOrEqual(1_200);
    expect(text).toContain("## MINE (id: mine)");
    expect(text).toContain("## A (id: a)");
    expect(text).not.toContain("## B (id: b)");
    expect(text.endsWith("(2 more skills not listed.)")).toBe(true);
  });

  it("never lets a later, shorter entry jump ahead of one that did not fit", () => {
    const entries = [skill("first"), skill("big", "x".repeat(2_000)), skill("small", "y")];
    const text = skillsSection({ entries, mode: "inline", charBudget: 1_000 }) ?? "";
    expect(text).toContain("## FIRST (id: first)");
    expect(text).not.toContain("SMALL");
    expect(text.endsWith("(2 more skills not listed.)")).toBe(true);
  });

  it("fits exactly one index entry in a small budget, and gives no section below that", () => {
    const entries = [skill("a"), skill("b")];
    const head = `# Installed skills\n\n${skillsSection({ entries: [skill("a")], mode: "index" })?.split("\n\n")[1]}`;
    const line = "- A (id: a): When a is asked for.";
    const note = "\n\n(1 more skill not listed.)";
    const exact = head.length + 2 + line.length + note.length;
    const one = skillsSection({ entries, mode: "index", charBudget: exact });
    expect(one).toBe(`${head}\n\n${line}${note}`);
    expect(one?.length).toBe(exact);
    expect(skillsSection({ entries, mode: "index", charBudget: exact - 1 })).toBeUndefined();
    expect(skillsSection({ entries, mode: "index", charBudget: 10 })).toBeUndefined();
  });

  it("caps the index at the default 12k budget, and counts one skill in the singular", () => {
    const entries = Array.from({ length: 400 }, (_, i) => skill(`skill-${i}`));
    const text = skillsSection({ entries, mode: "index" }) ?? "";
    expect(text.length).toBeLessThanOrEqual(SKILLS_CHAR_BUDGET);
    expect(text).toMatch(/\(\d+ more skills not listed\.\)$/);
    const one = skillsSection({
      entries: [skill("a"), skill("b", "z".repeat(500))],
      mode: "inline",
      charBudget: 400,
    });
    expect(one?.endsWith("(1 more skill not listed.)")).toBe(true);
  });
});
