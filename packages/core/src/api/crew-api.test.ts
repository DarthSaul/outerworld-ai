import { describe, expect, it } from "vitest";
import {
  AGENT_DOCUMENTS,
  CreateAgentInput,
  CreateRoomInput,
  DocumentInput,
  slugify,
  UpdateAgentInput,
  UpdateRoomInput,
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
});
