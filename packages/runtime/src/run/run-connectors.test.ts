import { describe, expect, it } from "vitest";
import { callTool, reply, scripted, setup } from "../test/loop.js";
import type { ConnectorBridge } from "./run-service.js";

/** A connected Notion with one read and one write tool; records what was called. */
const notion = () => {
  const calls: Array<{ tool: string; input: unknown }> = [];
  const bridge: ConnectorBridge = {
    catalog: () => ({
      notion: [
        { name: "notion-search", class: "read" },
        { name: "notion-update-page", class: "write" },
      ],
    }),
    describe: (_id, tool) => ({
      description: `Notion ${tool}`,
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    }),
    call: async (_id, tool, input) => {
      calls.push({ tool, input });
      return tool === "notion-search" ? "Found: Project hub" : "updated";
    },
  };
  return { bridge, calls };
};

describe("connector tools in the loop", () => {
  it("offers a granted connector's tools, namespaced, and calls them through the connector", async () => {
    const n = notion();
    const t = setup(
      scripted([callTool("notion__notion-search", { query: "hub" }), reply("Found it.")]),
      {
        connectors: n.bridge,
      },
    );
    const s = t.service.createSession("quill");
    const run = await t.service.settled((await t.service.send(s.id, "Find the hub")).runId);
    expect(run.state).toBe("completed");
    const offered = (t.model.doStreamCalls[0]?.tools ?? []).map((x) => x.name);
    expect(offered).toEqual(
      expect.arrayContaining(["notion__notion-search", "notion__notion-update-page"]),
    );
    expect(n.calls).toEqual([{ tool: "notion-search", input: { query: "hub" } }]);
    const result = t.sessions.messages(s.id).find((m) => m.message.role === "tool")?.message;
    expect(result).toMatchObject({ name: "notion__notion-search", output: "Found: Project hub" });
  });

  it("asks for consent before a Notion write under Ask first", async () => {
    const n = notion();
    const t = setup(
      scripted([callTool("notion__notion-update-page", { id: "p" }), reply("Done.")]),
      {
        connectors: n.bridge,
      },
    );
    const s = t.service.createSession("quill");
    const { runId } = await t.service.send(s.id, "Update it");
    for (let i = 0; i < 200 && t.consents.pending().length === 0; i++)
      await new Promise((r) => setTimeout(r, 2));
    expect(t.consents.pending()[0]).toMatchObject({ tool: "notion__notion-update-page" });
    expect(n.calls).toEqual([]);
    t.service.resolveConsent(t.consents.pending()[0]?.id ?? "", "approved");
    await t.service.settled(runId);
    expect(n.calls).toEqual([{ tool: "notion-update-page", input: { id: "p" } }]);
  });

  it("offers nothing from a connector the agent is not granted", async () => {
    const n = notion();
    const t = setup(scripted([callTool("notion__notion-search", {}), reply("Cannot.")]), {
      connectors: n.bridge,
    });
    const s = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(s.id, "Search Notion")).runId);
    const offered = (t.model.doStreamCalls[0]?.tools ?? []).map((x) => x.name);
    expect(offered.some((x) => x.startsWith("notion__"))).toBe(false);
    expect(n.calls).toEqual([]);
  });
});
