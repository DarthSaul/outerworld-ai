import { describe, expect, it } from "vitest";
import { GLOSSARY_KEYS } from "../glossary.js";
import {
  CONNECTOR_PRESET_IDS,
  CONNECTOR_PRESETS,
  classifyConnectorTool,
  GITHUB_PRESET,
  GMAIL_PRESET,
  KNOWN_TOOL_CLASSES,
  NOTION_PRESET,
  needsOwnClient,
  ownClientProfile,
} from "./connector-tools.js";

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

describe("connector presets", () => {
  it("offers Notion, GitHub, and Gmail, each over HTTP to its hosted MCP server", () => {
    expect(CONNECTOR_PRESET_IDS).toEqual(["notion", "github", "gmail"]);
    expect(GITHUB_PRESET).toEqual({
      id: "github",
      name: "GitHub",
      transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
    });
    expect(GMAIL_PRESET).toEqual({
      id: "gmail",
      name: "Gmail",
      transport: { type: "http", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    });
    for (const id of CONNECTOR_PRESET_IDS) expect(CONNECTOR_PRESETS[id].id).toBe(id);
  });

  it("knows which servers need the Commander's own OAuth client (no dynamic registration)", () => {
    expect(needsOwnClient(NOTION_PRESET)).toBe(false);
    expect(needsOwnClient(GITHUB_PRESET)).toBe(true);
    expect(needsOwnClient(GMAIL_PRESET)).toBe(true);
    // The same server however its URL is spelled: default port, host case, trailing slash.
    const at = (url: string) =>
      needsOwnClient({ ...GITHUB_PRESET, transport: { type: "http", url } });
    expect(at("https://api.githubcopilot.com:443/mcp/")).toBe(true);
    expect(at("https://API.githubcopilot.com/mcp")).toBe(true);
    expect(at("https://gmailmcp.googleapis.com:443/mcp/v1/")).toBe(true);
    // Another port, host, or path is another server.
    expect(at("https://api.githubcopilot.com:8443/mcp/")).toBe(false);
    expect(at("https://api.githubcopilot.com/other/")).toBe(false);
    expect(at("https://evil.example/mcp/")).toBe(false);
    // Keyed by the server, not the id: a GitHub id pointed elsewhere registers as usual.
    expect(
      needsOwnClient({ ...GITHUB_PRESET, transport: { type: "http", url: "https://x.test/mcp" } }),
    ).toBe(false);
  });
});

describe("ownClientProfile", () => {
  it("has none for a server that registers its own clients, or no server at all", () => {
    expect(ownClientProfile(undefined)).toBeUndefined();
    expect(ownClientProfile("https://mcp.notion.com/mcp")).toBeUndefined();
    expect(ownClientProfile("not a url")).toBeUndefined();
  });

  it("asks Gmail for one scope that covers its tools, and for a refresh token", () => {
    const gmail = ownClientProfile("https://gmailmcp.googleapis.com:443/mcp/v1/");
    // Google offers a refresh token only with access_type=offline (and again only with consent).
    expect(gmail).toMatchObject({
      scope: "https://www.googleapis.com/auth/gmail.modify",
      authorizationParams: { access_type: "offline", prompt: "consent" },
    });
  });

  it("leaves GitHub's scopes to the server", () => {
    const github = ownClientProfile("https://api.githubcopilot.com/mcp/");
    expect(github).toBeDefined();
    expect(github?.scope).toBeUndefined();
    expect(github?.authorizationParams).toBeUndefined();
  });

  it("gives setup steps in glossary words, with links only to the provider's own consoles", () => {
    for (const url of [
      "https://gmailmcp.googleapis.com/mcp/v1",
      "https://api.githubcopilot.com/mcp/",
    ]) {
      const steps = ownClientProfile(url)?.setup ?? [];
      expect(steps.length).toBeGreaterThan(2);
      for (const s of steps) {
        expect(GLOSSARY_KEYS).toContain(s.step);
        if (s.href) expect(new URL(s.href).hostname).toMatch(/(^|\.)(google\.com|github\.com)$/);
      }
    }
    // Gmail's steps name the scope the sign-in asks for, and the MCP API that is easy to miss.
    const gmail = ownClientProfile("https://gmailmcp.googleapis.com/mcp/v1");
    expect(gmail?.setup.some((s) => s.href?.includes("gmailmcp.googleapis.com"))).toBe(true);
    // Before anything else: the server refuses projects outside the Developer Preview Program.
    expect(gmail?.setup[0]?.step).toBe("connector.setup.google.preview");
  });

  it("matches needsOwnClient", () => {
    for (const preset of [NOTION_PRESET, GITHUB_PRESET, GMAIL_PRESET]) {
      const url = preset.transport.type === "http" ? preset.transport.url : undefined;
      expect(ownClientProfile(url) !== undefined).toBe(needsOwnClient(preset));
    }
  });
});
