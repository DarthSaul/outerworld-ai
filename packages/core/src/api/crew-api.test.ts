import { describe, expect, it } from "vitest";
import {
  AGENT_DOCUMENTS,
  CreateAgentInput,
  CreateRoomInput,
  CreateScheduleInput,
  DocumentInput,
  slugify,
  UpdateAgentInput,
  UpdateRoomInput,
  UpdateScheduleInput,
} from "./crew-api.js";

describe("slugify", () => {
  it("makes a lowercase kebab id from a display name", () => {
    expect(slugify("Project Manager", [])).toBe("project-manager");
    expect(slugify("  Überbot 3000!  ", [])).toBe("uberbot-3000");
  });

  it("adds the first free numeric suffix when the id is taken", () => {
    expect(slugify("Quill", ["quill"])).toBe("quill-2");
    expect(slugify("Quill", ["quill", "quill-2"])).toBe("quill-3");
  });

  it("falls back to a generic id when the name has no usable characters", () => {
    expect(slugify("✨✨", [])).toBe("item");
    expect(slugify("✨", ["item"])).toBe("item-2");
  });

  it("never returns a JavaScript object property name", () => {
    expect(slugify("constructor", [])).toBe("constructor-2");
  });
});

describe("crew API inputs", () => {
  it("names the four agent documents", () => {
    expect(AGENT_DOCUMENTS).toEqual(["identity", "purpose", "standing-orders", "context"]);
  });

  it("creates an agent from a name and a room; everything else defaults later", () => {
    expect(CreateAgentInput.safeParse({ name: "Quill", roomId: "ops" }).success).toBe(true);
    expect(CreateAgentInput.safeParse({ name: "", roomId: "ops" }).success).toBe(false);
    expect(CreateAgentInput.safeParse({ name: "Q", roomId: "Bad Room" }).success).toBe(false);
  });

  it("rejects unknown fields on updates, so a typo is not silently ignored", () => {
    expect(UpdateAgentInput.safeParse({ approvalMode: "full" }).success).toBe(true);
    expect(UpdateAgentInput.safeParse({ aproovalMode: "full" }).success).toBe(false);
    expect(UpdateRoomInput.safeParse({ props: [{ kind: "files" }] }).success).toBe(true);
    expect(UpdateRoomInput.safeParse({ props: [{ kind: "terminal" }] }).success).toBe(false);
  });

  it("caps a document at 256 KiB", () => {
    expect(DocumentInput.safeParse({ text: "x".repeat(256 * 1024) }).success).toBe(true);
    expect(DocumentInput.safeParse({ text: "x".repeat(256 * 1024 + 1) }).success).toBe(false);
  });

  it("creates a room from a name with optional description and props", () => {
    expect(CreateRoomInput.safeParse({ name: "Research" }).success).toBe(true);
    expect(
      CreateRoomInput.safeParse({ name: "R", description: "d", props: [{ kind: "web" }] }).success,
    ).toBe(true);
  });

  it("creates a schedule from cron and prompt; the time zone is optional and checked", () => {
    expect(CreateScheduleInput.parse({ cron: "0 9 * * 1-5", prompt: " Brief me. " })).toEqual({
      cron: "0 9 * * 1-5",
      prompt: "Brief me.",
    });
    expect(
      CreateScheduleInput.safeParse({ cron: "0 9 * * *", prompt: "x", timezone: "Nowhere/Land" })
        .success,
    ).toBe(false);
    expect(CreateScheduleInput.safeParse({ cron: "daily", prompt: "x" }).success).toBe(false);
    expect(CreateScheduleInput.safeParse({ cron: "0 9 * * *", prompt: "  " }).success).toBe(false);
    expect(
      CreateScheduleInput.safeParse({ cron: "0 9 * * *", prompt: "x", id: "mine" }).success,
    ).toBe(false);
  });

  it("updates a schedule partly; a null time zone clears it", () => {
    expect(UpdateScheduleInput.parse({ enabled: false })).toEqual({ enabled: false });
    expect(UpdateScheduleInput.parse({ timezone: null })).toEqual({ timezone: null });
    expect(UpdateScheduleInput.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(UpdateScheduleInput.safeParse({ sessionId: "s1" }).success).toBe(false);
  });
});
