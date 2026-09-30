import { describe, expect, it } from "vitest";
import {
  ApiKeyInput,
  CreateSessionInput,
  SendMessageInput,
  UpdateSessionInput,
} from "./comms-api.js";

describe("comms API inputs", () => {
  it("trims a message and refuses an empty or oversized one", () => {
    expect(SendMessageInput.parse({ text: "  hi  " })).toEqual({ text: "hi" });
    expect(SendMessageInput.safeParse({ text: "   " }).success).toBe(false);
    expect(SendMessageInput.safeParse({ text: "x".repeat(100_001) }).success).toBe(false);
  });

  it("lets a session be renamed or archived, but not un-archived or given unknown fields", () => {
    expect(UpdateSessionInput.safeParse({ title: "Weekly" }).success).toBe(true);
    expect(UpdateSessionInput.safeParse({ archived: true }).success).toBe(true);
    expect(UpdateSessionInput.safeParse({ archived: false }).success).toBe(false);
    expect(UpdateSessionInput.safeParse({ owner: "x" }).success).toBe(false);
    expect(CreateSessionInput.safeParse({}).success).toBe(true);
  });

  it("accepts a key and nothing else", () => {
    expect(ApiKeyInput.parse({ key: " sk-or-abc " })).toEqual({ key: "sk-or-abc" });
    expect(ApiKeyInput.safeParse({ key: "" }).success).toBe(false);
  });
});
