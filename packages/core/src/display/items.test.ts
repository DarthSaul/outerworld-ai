import { describe, expect, it } from "vitest";
import { CONNECTOR_PRESET_IDS, CONNECTOR_PRESETS } from "../policy/connector-tools.js";
import { BUILTIN_TOOLS } from "../policy/grants.js";
import {
  ABILITY_BRANDS,
  abilityDisplay,
  connectorDisplay,
  ITEM_ICONS,
  propDisplay,
  toolDisplay,
} from "./items.js";

describe("item display catalog", () => {
  it("gives every built-in tool a title, a description, and a known icon", () => {
    for (const tools of Object.values(BUILTIN_TOOLS)) {
      for (const tool of tools) {
        const shown = toolDisplay(tool.name);
        expect(shown.title, tool.name).not.toBe(tool.name);
        expect(shown.description.length, tool.name).toBeGreaterThan(0);
        expect(ITEM_ICONS, tool.name).toContain(shown.icon);
      }
    }
  });

  it("names web_fetch for people", () => {
    expect(toolDisplay("web_fetch")).toEqual({
      title: "Web & Browser",
      description: "Reads public web pages by their address.",
      icon: "web",
    });
  });

  it("falls back to the raw name for a tool it does not know (a connector's own tools)", () => {
    expect(toolDisplay("notion__search")).toEqual({
      title: "notion__search",
      description: "",
      icon: "tool",
    });
  });

  it("describes props and connectors with the same shape", () => {
    expect(propDisplay("files").icon).toBe("files");
    expect(propDisplay("memory").title).toBe("Memory");
    expect(connectorDisplay("Notion")).toEqual({
      title: "Notion",
      description: "An MCP server installed on this station.",
      icon: "connector",
    });
  });

  it("gives every connector preset a logo, a kind, and a description of its own", () => {
    for (const id of CONNECTOR_PRESET_IDS) {
      const shown = abilityDisplay(id, CONNECTOR_PRESETS[id].name);
      expect(ABILITY_BRANDS).toContain(shown.brand);
      expect(shown.description, id).not.toBe(connectorDisplay(id).description);
    }
    const kinds = Object.fromEntries(
      CONNECTOR_PRESET_IDS.map((id) => [id, abilityDisplay(id, id).kind]),
    );
    expect(kinds).toEqual({ notion: "mcp", github: "mcp", gmail: "api", "gmail-mcp": "mcp" });
    // Both Gmail abilities draw Gmail's logo.
    expect(abilityDisplay("gmail", "Gmail").brand).toBe("gmail");
    expect(abilityDisplay("gmail-mcp", "Gmail MCP").brand).toBe("gmail");
    expect(abilityDisplay("github", "GitHub").title).toBe("GitHub");
  });

  it("treats names inherited from Object.prototype as unknown, not as entries", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(toolDisplay(name), name).toEqual({ title: name, description: "", icon: "tool" });
      expect(abilityDisplay(name, name), name).toEqual({
        title: name,
        description: "An MCP server installed on this station.",
        kind: "mcp",
      });
    }
  });

  it("shows a connector with no preset as a plain MCP server without a logo", () => {
    expect(abilityDisplay("acme", "Acme")).toEqual({
      title: "Acme",
      description: "An MCP server installed on this station.",
      kind: "mcp",
    });
  });
});
