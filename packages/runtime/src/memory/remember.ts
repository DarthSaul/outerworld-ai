import { z } from "zod";
import type { ToolImpl } from "../run/run-service.js";
import type { EventStore } from "../storage/event-store.js";
import type { MemoryStore } from "./memory-store.js";

const Input = z.strictObject({
  text: z.string().trim().min(1).max(2000),
  scope: z.enum(["agent", "station"]).optional(),
});

/**
 * The Memory prop's `remember` (brief §14): proposes a memory. It is read-class because it
 * changes nothing on its own: the Commander approves or rejects every proposal.
 */
export function createRememberTool(deps: { memories: MemoryStore; events: EventStore }): ToolImpl {
  return {
    description:
      'Propose something worth remembering for future conversations. The Commander approves or rejects each proposal; nothing is remembered until then. Use scope "station" only for facts every crew member should know.',
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "One short, self-contained fact or preference" },
        scope: { type: "string", enum: ["agent", "station"], description: "Default: agent" },
      },
      required: ["text"],
      additionalProperties: false,
    },
    class: "read",
    async execute(input, ctx) {
      const parsed = Input.safeParse(input);
      if (!parsed.success) throw new Error("invalid input: text must be 1 to 2000 characters");
      const scope = parsed.data.scope ?? "agent";
      const m = deps.memories.propose({
        agentId: ctx.agentId,
        scope,
        text: parsed.data.text,
        sourceRunId: ctx.runId,
      });
      deps.events.append({
        type: "memory.proposed",
        agentId: ctx.agentId,
        runId: ctx.runId,
        payload: { memoryId: m.id, text: m.text, scope },
      });
      return {
        status: "proposed",
        memoryId: m.id,
        note: "The Commander will approve or reject this.",
      };
    },
  };
}
