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

  it("gives every connector preset a logo and a description of its own, as an MCP server", () => {
    for (const id of CONNECTOR_PRESET_IDS) {
      const shown = abilityDisplay(id, CONNECTOR_PRESETS[id].name);
      expect(shown.brand, id).toBe(id);
      expect(ABILITY_BRANDS).toContain(shown.brand);
      expect(shown.kind).toBe("mcp");
      expect(shown.description, id).not.toBe(connectorDisplay(id).description);
    }
    expect(abilityDisplay("github", "GitHub").title).toBe("GitHub");
  });

  it("shows a connector with no preset as a plain MCP server without a logo", () => {
    expect(abilityDisplay("acme", "Acme")).toEqual({
      title: "Acme",
      description: "An MCP server installed on this station.",
      kind: "mcp",
    });
  });
});
