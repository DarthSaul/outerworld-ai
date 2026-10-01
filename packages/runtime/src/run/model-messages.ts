import type { ChatMessage } from "@darthsaul/outerworld-ai-core";
import type { ModelMessage } from "ai";

/** Our stored messages (core `ChatMessage`) as AI SDK v7 model messages. */
export function toModelMessages(messages: readonly ChatMessage[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === "user") return { role: "user", content: m.text };
    if (m.role === "report") {
      // A worker's result reaches the lead as input from outside, clearly labelled as such.
      return {
        role: "user",
        content: `[Result of dispatch ${m.dispatchId} from ${m.from}: ${m.status}]\n${m.text}`,
      };
    }
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: [
          ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
          ...(m.toolCalls ?? []).map((c) => ({
            type: "tool-call" as const,
            toolCallId: c.id,
            toolName: c.name,
            input: c.input,
          })),
        ],
      };
    }
    const value = m.output === undefined ? null : m.output;
    return {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: m.toolCallId,
          toolName: m.name,
          output: m.isError
            ? {
                type: "error-text",
                value: typeof value === "string" ? value : JSON.stringify(value),
              }
            : { type: "json", value: value as never },
        },
      ],
    };
  });
}
