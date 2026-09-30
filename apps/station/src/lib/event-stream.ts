import {
  createSseParser,
  parseRuntimeEvent,
  type RuntimeEvent,
} from "@darthsaul/outerworld-ai-core";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unauthorized"
  | "closed";

export interface ConnectOptions {
  readonly url: string;
  readonly token: string;
  readonly onEvent: (event: RuntimeEvent) => void;
  readonly onStatus?: (status: ConnectionStatus) => void;
  /** A message that did not parse as a runtime event (e.g. from a newer daemon). */
  readonly onInvalid?: (data: string) => void;
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly backoff?: { readonly initialMs: number; readonly maxMs: number };
}

export interface Connection {
  close(): void;
}

class Unauthorized extends Error {}

/**
 * Reads the daemon's SSE stream through `fetch` (so it can send the bearer token), hands each
 * valid runtime event to `onEvent`, and reconnects with `Last-Event-ID` after any drop, backing
 * off exponentially up to a cap; the backoff resets after a successful connect. A 401 stops for
 * good: a wrong token will not fix itself.
 */
export function connectEvents(options: ConnectOptions): Connection {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const { initialMs, maxMs } = options.backoff ?? { initialMs: 1000, maxMs: 30_000 };
  const controller = new AbortController();
  let lastEventId: string | undefined;
  let delay = initialMs;
  let status: ConnectionStatus | undefined;
  const report = (s: ConnectionStatus) => {
    if (s === status) return;
    status = s;
    options.onStatus?.(s);
  };

  const once = async () => {
    const headers: Record<string, string> = { authorization: `Bearer ${options.token}` };
    if (lastEventId !== undefined) headers["last-event-id"] = lastEventId;
    const res = await fetchImpl(options.url, { headers, signal: controller.signal });
    if (res.status === 401) throw new Unauthorized();
    if (!res.ok || !res.body) throw new Error(`event stream: HTTP ${res.status}`);
    report("connected");
    delay = initialMs;
    const parser = createSseParser((m) => {
      if (m.id !== undefined) lastEventId = m.id;
      let parsed: ReturnType<typeof parseRuntimeEvent>;
      try {
        parsed = parseRuntimeEvent(JSON.parse(m.data));
      } catch {
        parsed = { ok: false, issues: [] };
      }
      if (parsed.ok) options.onEvent(parsed.value);
      else options.onInvalid?.(m.data);
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      parser.push(decoder.decode(value, { stream: true }));
    }
  };

  const loop = async () => {
    report("connecting");
    while (!controller.signal.aborted) {
      try {
        await once();
      } catch (error) {
        if (error instanceof Unauthorized) {
          report("unauthorized");
          return;
        }
      }
      if (controller.signal.aborted) break;
      report("reconnecting");
      await sleep(delay);
      delay = Math.min(delay * 2, maxMs);
    }
    report("closed");
  };
  void loop();

  return {
    close() {
      controller.abort();
      report("closed");
    },
  };
}
