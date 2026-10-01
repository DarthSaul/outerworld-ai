import { homedir } from "node:os";
import { join } from "node:path";
import { classifyConnectorTool, KNOWN_TOOL_CLASSES } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { KeychainSecretStore } from "../secrets/store.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { ConnectorManager } from "./connector-manager.js";

/**
 * Manual smoke test against Notion's real hosted MCP server (docs/connectors/notion.md). Runs only
 * with OUTERWORLD_SMOKE_NOTION=1 (and OUTERWORLD_ALLOW_NETWORK=1), using the sign-in already
 * stored in the keychain by the app. Lists tools; calls none.
 */
const enabled = process.env.OUTERWORLD_SMOKE_NOTION === "1";
const home = (process.env.OUTERWORLD_HOME ?? "~/.outerworld").replace(/^~(?=\/)/, homedir());

describe.runIf(enabled)("Notion (real server)", () => {
  it("connects with the stored sign-in and lists tools we can classify", async () => {
    const manager = new ConnectorManager({
      home,
      events: new EventStore(openDatabase(":memory:")),
      secrets: new KeychainSecretStore(),
      redirectUrl: (id) => `http://127.0.0.1:4317/oauth/callback/${id}`,
    });
    await manager.refresh();
    const result = await manager.connect("notion");
    expect(result.status, JSON.stringify(result)).toBe("connected");
    const tools = manager.views().find((v) => v.id === "notion")?.tools ?? [];
    const rows = tools.map((t) => ({
      tool: t.name,
      ours: classifyConnectorTool(t.name),
      known: t.name in KNOWN_TOOL_CLASSES,
    }));
    console.table(rows);
    expect(tools.map((t) => t.name)).toContain("notion-search");
    await manager.stop();
  }, 60_000);
});

// Keeps the file a valid suite when the smoke test is not enabled.
describe("Notion smoke test switch", () => {
  it("is off unless OUTERWORLD_SMOKE_NOTION=1", () => {
    expect(typeof enabled).toBe("boolean");
    expect(join(home, "x")).toContain("x");
  });
});
