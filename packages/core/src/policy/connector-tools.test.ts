import { describe, expect, it } from "vitest";
import { classifyConnectorTool, KNOWN_TOOL_CLASSES, NOTION_PRESET } from "./connector-tools.js";

describe("classifyConnectorTool", () => {
  it("uses our map for Notion's tools, whatever the server's annotations say", () => {
    expect(
      classifyConnectorTool("notion-search", { readOnlyHint: false, destructiveHint: true }),
    ).toBe("read");
    expect(classifyConnectorTool("notion-fetch")).toBe("read");
    expect(classifyConnectorTool("notion-update-page", { readOnlyHint: true })).toBe("write");
    expect(classifyConnectorTool("notion-create-pages")).toBe("write");
    expect(classifyConnectorTool("notion-create-comment")).toBe("write");
    expect(classifyConnectorTool("notion-get-comments")).toBe("read");
  });

  it("lets a read-only hint seed a tool we do not know", () => {
    expect(classifyConnectorTool("mystery-lookup", { readOnlyHint: true })).toBe("read");
  });

  it("treats every other unknown tool as write", () => {
    expect(classifyConnectorTool("mystery-tool")).toBe("write");
    expect(
      classifyConnectorTool("mystery-tool", { readOnlyHint: true, destructiveHint: true }),
    ).toBe("write");
    expect(classifyConnectorTool("mystery-tool", { readOnlyHint: false })).toBe("write");
  });

  it("classifies every Notion tool it names, and names the write ones on purpose", () => {
    const writes = Object.entries(KNOWN_TOOL_CLASSES)
      .filter(([, c]) => c === "write")
      .map(([t]) => t)
      .sort();
    expect(writes).toEqual(
      [
        "notion-create-attachment",
        "notion-create-comment",
        "notion-create-database",
        "notion-create-file-upload",
        "notion-create-folder",
        "notion-create-pages",
        "notion-create-view",
        "notion-duplicate-page",
        "notion-move-pages",
        "notion-update-data-source",
        "notion-update-page",
        "notion-update-view",
      ].sort(),
    );
  });
});

describe("NOTION_PRESET", () => {
  it("points at Notion's hosted MCP server over HTTP (ADR-0012)", () => {
    expect(NOTION_PRESET).toEqual({
      id: "notion",
      name: "Notion",
      transport: { type: "http", url: "https://mcp.notion.com/mcp" },
    });
  });
});
