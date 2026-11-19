import { describe, expect, it } from "vitest";
import type { Connector } from "../config/station-config.js";
import { GLOSSARY_KEYS } from "../glossary.js";
import {
  AVAILABLE_PRESET_IDS,
  CONNECTOR_PRESET_IDS,
  CONNECTOR_PRESETS,
  classifyConnectorTool,
  GITHUB_PRESET,
  GMAIL_MCP_PRESET,
  GMAIL_PRESET,
  isPresetAvailable,
  KNOWN_TOOL_CLASSES,
  migrateLegacyGmail,
  NOTION_PRESET,
  needsOwnClient,
  ownClientProfile,
  ownClientProfileOf,
  profileSource,
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

  it("classifies the Gmail service's tools: reading is read, anything that changes mail is write", () => {
    for (const t of ["search_threads", "get_thread", "list_labels"]) {
      expect(classifyConnectorTool(t, { readOnlyHint: false }, "gmail"), t).toBe("read");
    }
    for (const t of ["create_draft", "modify_thread_labels", "trash_thread"]) {
      expect(classifyConnectorTool(t, { readOnlyHint: true }, "gmail"), t).toBe("write");
    }
  });

  it("applies the Gmail service's classes to that service only, not to a server's same names", () => {
    // Another MCP server's `get_thread` that says it is destructive stays write.
    expect(classifyConnectorTool("get_thread", { readOnlyHint: true, destructiveHint: true })).toBe(
      "write",
    );
    expect(classifyConnectorTool("list_labels")).toBe("write");
    // The service's map stands in for the Notion one, and an unknown service has none.
    expect(classifyConnectorTool("notion-search", {}, "gmail")).toBe("write");
    expect(classifyConnectorTool("get_thread", {}, "outlook")).toBe("write");
    expect(classifyConnectorTool("toString", {}, "gmail")).toBe("write");
  });

  it("lets a read-only hint seed a tool we do not know", () => {
    expect(classifyConnectorTool("mystery-lookup", { readOnlyHint: true })).toBe("read");
  });

  it("treats every other unknown tool as write, including names on Object.prototype", () => {
    expect(classifyConnectorTool("mystery-tool")).toBe("write");
    expect(
      classifyConnectorTool("mystery-tool", { readOnlyHint: true, destructiveHint: true }),
    ).toBe("write");
    expect(classifyConnectorTool("mystery-tool", { readOnlyHint: false })).toBe("write");
    expect(classifyConnectorTool("toString")).toBe("write");
  });

  it("classifies every tool it names, and names the write ones on purpose", () => {
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
  it("offers Notion, GitHub, Gmail, and Gmail MCP, in that order", () => {
    expect(CONNECTOR_PRESET_IDS).toEqual(["notion", "github", "gmail", "gmail-mcp"]);
    expect(GITHUB_PRESET).toEqual({
      id: "github",
      name: "GitHub",
      transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
    });
    // Gmail is the station's own service over the REST API (ADR-0022), not an MCP server.
    expect(GMAIL_PRESET).toEqual({
      id: "gmail",
      name: "Gmail",
      transport: { type: "builtin", service: "gmail" },
    });
    expect(GMAIL_MCP_PRESET).toEqual({
      id: "gmail-mcp",
      name: "Gmail MCP",
      transport: { type: "http", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    });
    for (const id of CONNECTOR_PRESET_IDS) expect(CONNECTOR_PRESETS[id].id).toBe(id);
  });

  it("shows Gmail MCP but cannot add it until Google's preview access", () => {
    expect(isPresetAvailable("gmail-mcp")).toBe(false);
    for (const id of ["notion", "github", "gmail"] as const)
      expect(isPresetAvailable(id)).toBe(true);
    expect(AVAILABLE_PRESET_IDS).toEqual(["notion", "github", "gmail"]);
  });

  it("knows which servers need the Commander's own OAuth client (no dynamic registration)", () => {
    expect(needsOwnClient(NOTION_PRESET)).toBe(false);
    expect(needsOwnClient(GITHUB_PRESET)).toBe(true);
    expect(needsOwnClient(GMAIL_PRESET)).toBe(true);
    expect(needsOwnClient(GMAIL_MCP_PRESET)).toBe(true);
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
    // A stdio server never does.
    expect(
      needsOwnClient({ id: "x", name: "X", transport: { type: "stdio", command: "x", args: [] } }),
    ).toBe(false);
  });
});

describe("ownClientProfile", () => {
  it("has none for a server that registers its own clients, or no server at all", () => {
    expect(ownClientProfile(undefined)).toBeUndefined();
    expect(ownClientProfile("https://mcp.notion.com/mcp")).toBeUndefined();
    expect(ownClientProfile("not a url")).toBeUndefined();
  });

  it("asks Gmail MCP for one scope that covers its tools, and for a refresh token", () => {
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
    const profiles = [
      ownClientProfile("https://gmailmcp.googleapis.com/mcp/v1"),
      ownClientProfile("https://api.githubcopilot.com/mcp/"),
      ownClientProfileOf({ service: "gmail" }),
    ];
    for (const profile of profiles) {
      const steps = profile?.setup ?? [];
      expect(steps.length).toBeGreaterThan(2);
      for (const s of steps) {
        expect(GLOSSARY_KEYS).toContain(s.step);
        if (s.href) expect(new URL(s.href).hostname).toMatch(/(^|\.)(google\.com|github\.com)$/);
      }
    }
    // Gmail MCP's steps name the MCP API that is easy to miss, after the preview program.
    const gmail = ownClientProfile("https://gmailmcp.googleapis.com/mcp/v1");
    expect(gmail?.setup.some((s) => s.href?.includes("gmailmcp.googleapis.com"))).toBe(true);
    expect(gmail?.setup[0]?.step).toBe("connector.setup.google.preview");
  });

  it("matches needsOwnClient for every preset", () => {
    for (const id of CONNECTOR_PRESET_IDS) {
      const preset = CONNECTOR_PRESETS[id];
      expect(ownClientProfileOf(profileSource(preset.transport)) !== undefined, id).toBe(
        needsOwnClient(preset),
      );
    }
  });
});

describe("ownClientProfileOf", () => {
  it("asks the Gmail service for gmail.modify and offline access, without the preview program", () => {
    const gmail = ownClientProfileOf({ service: "gmail" });
    expect(gmail).toMatchObject({
      scope: "https://www.googleapis.com/auth/gmail.modify",
      authorizationParams: { access_type: "offline", prompt: "consent" },
    });
    const steps = gmail?.setup.map((s) => s.step) ?? [];
    expect(steps[0]).toBe("connector.setup.gmailApi.enable");
    expect(steps).not.toContain("connector.setup.google.preview");
    expect(steps).toContain("connector.setup.google.scope");
    expect(gmail?.setup[0]?.href).toBe(
      "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    );
  });

  it("looks a server up by its URL, and knows no other service", () => {
    expect(ownClientProfileOf({ url: "https://api.githubcopilot.com/mcp/" })).toBe(
      ownClientProfile("https://api.githubcopilot.com/mcp/"),
    );
    expect(ownClientProfileOf({ service: "outlook" })).toBeUndefined();
    expect(ownClientProfileOf({ service: "toString" })).toBeUndefined();
    expect(ownClientProfileOf({})).toBeUndefined();
  });
});

describe("migrateLegacyGmail", () => {
  const legacy: Connector = {
    id: "gmail",
    name: "Gmail",
    transport: { type: "http", url: "https://gmailmcp.googleapis.com/mcp/v1" },
  };

  it("moves a gmail connector at the MCP server onto the Gmail service, keeping its id", () => {
    const out = migrateLegacyGmail([NOTION_PRESET, { ...legacy, name: "My mail" }]);
    expect(out).toEqual([NOTION_PRESET, GMAIL_PRESET]);
  });

  it("matches the MCP server however its URL is spelled", () => {
    const spelled = {
      ...legacy,
      transport: { type: "http" as const, url: "https://GMAILMCP.googleapis.com:443/mcp/v1/" },
    };
    expect(migrateLegacyGmail([spelled])).toEqual([GMAIL_PRESET]);
  });

  it("leaves everything else alone, returning the same list", () => {
    const already = [NOTION_PRESET, GMAIL_PRESET, GMAIL_MCP_PRESET];
    expect(migrateLegacyGmail(already)).toBe(already);
    // Another server under the gmail id is the Commander's choice.
    const other = [{ ...legacy, transport: { type: "http" as const, url: "https://x.test/mcp" } }];
    expect(migrateLegacyGmail(other)).toBe(other);
    // The MCP server under another id stays where it is.
    const renamed = [{ ...legacy, id: "mail" }];
    expect(migrateLegacyGmail(renamed)).toBe(renamed);
  });
});
