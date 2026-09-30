/** One dispatched server-sent event. `id` and `event` are present only when the block set them. */
export interface SseMessage {
  readonly id?: string;
  readonly event?: string;
  readonly data: string;
}

export interface SseParser {
  /** Feed decoded text; complete messages are dispatched as they end. */
  push(chunk: string): void;
  /** The last `id` field seen, for reconnecting with `Last-Event-ID`. */
  lastEventId(): string | undefined;
}

/**
 * Incremental parser for the `text/event-stream` format (HTML Living Standard, "Parsing an event
 * stream"), for clients that read SSE through `fetch` so they can send an Authorization header.
 * Comments (`: ping`) and blocks without data are ignored; `retry` is not used.
 */
export function createSseParser(onMessage: (message: SseMessage) => void): SseParser {
  let buffer = "";
  let pendingCr = false;
  let data: string[] = [];
  let id: string | undefined;
  let event: string | undefined;
  let lastId: string | undefined;

  const dispatch = () => {
    if (data.length > 0) {
      onMessage({
        ...(id !== undefined ? { id } : {}),
        ...(event !== undefined ? { event } : {}),
        data: data.join("\n"),
      });
    }
    data = [];
    id = undefined;
    event = undefined;
  };

  const line = (text: string) => {
    if (text === "") return dispatch();
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    else if (field === "id") {
      id = value;
      lastId = value;
    }
  };

  return {
    push(chunk) {
      let text = chunk;
      // A CR at the end of the previous chunk already ended a line; drop its LF half.
      if (pendingCr && text.startsWith("\n")) text = text.slice(1);
      pendingCr = text.endsWith("\r");
      buffer += text;
      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop() ?? "";
      for (const p of parts) line(p);
    },
    lastEventId: () => lastId,
  };
}
