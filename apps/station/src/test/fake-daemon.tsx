import {
  AGENT_DOCUMENTS,
  type AgentConfig,
  type AgentDocumentName,
  type AgentView,
  type ChatMessage,
  type RuntimeEvent,
  resolveGrants,
  type StationConfig,
  type StationView,
  SUPPORTED_MODELS,
  slugify,
} from "@darthsaul/outerworld-ai-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../App.js";
import { type Connect, DaemonProvider } from "../daemon-context.js";
import { type Api, ApiError } from "../lib/api.js";
import type { ConnectOptions } from "../lib/event-stream.js";
import type { RunRecord, SessionDetail, SessionRecord } from "../queries.js";

export interface Call {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

const station = (): StationConfig => ({
  schemaVersion: 1,
  name: "Test Station",
  rooms: [
    { id: "command", name: "Command", props: [{ kind: "web" }, { kind: "memory" }] },
    { id: "operations", name: "Operations", props: [{ kind: "files" }] },
  ],
  lanes: [],
  connectors: [
    { id: "notion", name: "Notion", transport: { type: "http", url: "https://mcp.example/mcp" } },
  ],
  budgets: {},
  dispatch: { maxDepth: 1, autoReview: true },
});

const agent = (over: Partial<AgentConfig>): AgentConfig => ({
  schemaVersion: 1,
  name: "A",
  roomId: "command",
  role: "crew",
  model: "anthropic/claude-sonnet-5.5",
  approvalMode: "ask",
  connectorGrants: [],
  schedules: [],
  ...over,
});

const emptyDocs = (): Record<AgentDocumentName, string> =>
  Object.fromEntries(AGENT_DOCUMENTS.map((d) => [d, ""])) as Record<AgentDocumentName, string>;

/**
 * An in-memory stand-in for the daemon's crew API, with the same status codes for the cases the
 * screens handle. `calls` records every request. Real validation lives in runtime and daemon tests.
 */
export function fakeApi() {
  const state = {
    station: station(),
    agents: new Map<string, { config: AgentConfig; documents: Record<AgentDocumentName, string> }>([
      [
        "vesper",
        {
          config: agent({ name: "Vesper", role: "overseer" }),
          documents: { ...emptyDocs(), identity: "# Vesper\n" },
        },
      ],
      [
        "quill",
        {
          config: agent({ name: "Quill", roomId: "operations", approvalMode: "full" }),
          documents: emptyDocs(),
        },
      ],
    ]),
  };
  const sessions = new Map<
    string,
    { session: SessionRecord; messages: ChatMessage[]; runs: RunRecord[] }
  >();
  const settings = {
    modelMode: "fake" as "fake" | "openrouter",
    openrouter: { configured: false, source: null as "keychain" | "env" | null },
  };
  let ids = 0;
  const nextId = (prefix: string) => `${prefix}${++ids}`;
  const calls: Call[] = [];
  const view = (id: string): AgentView => {
    const a = state.agents.get(id);
    if (!a) throw new ApiError(404, `no agent "${id}"`);
    return { id, ...a, tools: resolveGrants(a.config, state.station, {}) };
  };
  const route = (method: string, path: string, body?: unknown): unknown => {
    calls.push({ method, path, ...(body !== undefined ? { body } : {}) });
    const parts = path.split("/").filter(Boolean);
    const b = (body ?? {}) as Record<string, unknown>;
    if (method === "GET" && path === "/station") {
      const v: StationView = {
        station: state.station,
        agents: [...state.agents].map(([id, a]) => ({ id, config: a.config })),
        issues: [],
      };
      return v;
    }
    if (method === "GET" && path === "/models") return SUPPORTED_MODELS;
    if (path === "/settings") return settings;
    if (path === "/settings/openrouter") {
      if (method === "PUT") {
        if (!String(b.key).startsWith("sk-or-"))
          throw new ApiError(400, "OpenRouter did not accept this key");
        settings.openrouter = { configured: true, source: "keychain" };
      } else settings.openrouter = { configured: false, source: null };
      return undefined;
    }
    if (parts[0] === "agents" && parts[2] === "sessions") {
      const agentId = parts[1] ?? "";
      if (method === "GET") {
        return [...sessions.values()]
          .filter((x) => x.session.agentId === agentId)
          .map((x) => x.session)
          .reverse();
      }
      const session: SessionRecord = {
        id: nextId("s"),
        agentId,
        title: "New session",
        createdAt: "2026-09-29T12:00:00.000Z",
      };
      sessions.set(session.id, { session, messages: [], runs: [] });
      return session;
    }
    if (parts[0] === "sessions") {
      const entry = sessions.get(parts[1] ?? "");
      if (!entry) throw new ApiError(404, `no session "${parts[1]}"`);
      if (method === "GET") {
        const detail: SessionDetail = {
          session: entry.session,
          messages: entry.messages.map((message, i) => ({
            id: `${entry.session.id}-m${i}`,
            position: i + 1,
            message,
          })),
          runs: [...entry.runs].reverse(),
        };
        return detail;
      }
      if (method === "PATCH") {
        entry.session = {
          ...entry.session,
          ...(b.title ? { title: String(b.title) } : {}),
          ...(b.archived ? { archivedAt: "2026-09-29T12:00:00.000Z" } : {}),
        };
        return entry.session;
      }
      if (parts[2] === "messages") {
        const run: RunRecord = {
          id: nextId("r"),
          sessionId: entry.session.id,
          agentId: entry.session.agentId,
          state: "running",
          model: "anthropic/claude-sonnet-5.5",
          createdAt: "2026-09-29T12:00:00.000Z",
          steps: 0,
        };
        entry.runs.push(run);
        entry.messages.push({ role: "user", text: String(b.text) });
        return { runId: run.id };
      }
    }
    if (parts[0] === "runs" && parts[2] === "cancel") {
      for (const entry of sessions.values()) {
        entry.runs = entry.runs.map((r) => (r.id === parts[1] ? { ...r, state: "cancelled" } : r));
      }
      return undefined;
    }
    if (parts[0] === "agents") {
      const id = parts[1] ?? "";
      if (method === "GET") return view(id);
      if (method === "POST") {
        if (b.role === "overseer") throw new ApiError(409, '"vesper" is already the overseer');
        const newId = slugify(String(b.name), [...state.agents.keys()]);
        state.agents.set(newId, {
          config: agent({ name: String(b.name), roomId: String(b.roomId) }),
          documents: { ...emptyDocs(), identity: `# ${b.name}\n` },
        });
        return view(newId);
      }
      const a = state.agents.get(id);
      if (!a) throw new ApiError(404, `no agent "${id}"`);
      if (method === "PATCH") {
        if (b.role === "overseer" && id !== "vesper") {
          throw new ApiError(409, "a second overseer", [
            { path: `agents.${id}.role`, message: '"vesper" is already the overseer' },
          ]);
        }
        a.config = { ...a.config, ...(b as Partial<AgentConfig>) };
        return view(id);
      }
      if (method === "PUT") {
        a.documents[parts[3] as AgentDocumentName] = String(b.text);
        return undefined;
      }
      if (method === "DELETE") {
        state.agents.delete(id);
        return undefined;
      }
    }
    if (parts[0] === "rooms") {
      const rooms = state.station.rooms;
      if (method === "POST") {
        const room = {
          id: slugify(
            String(b.name),
            rooms.map((r) => r.id),
          ),
          name: String(b.name),
          props: [],
        };
        state.station = { ...state.station, rooms: [...rooms, room] };
        return room;
      }
      const room = rooms.find((r) => r.id === parts[1]);
      if (!room) throw new ApiError(404, "no room");
      if (method === "PATCH") {
        const next = { ...room, ...b };
        state.station = {
          ...state.station,
          rooms: rooms.map((r) => (r.id === room.id ? next : r)),
        };
        return next;
      }
      if (method === "DELETE") {
        state.station = { ...state.station, rooms: rooms.filter((r) => r.id !== room.id) };
        return undefined;
      }
    }
    throw new ApiError(404, `no route ${method} ${path}`);
  };
  const api: Api = {
    get: async <T,>(path: string) => route("GET", path) as T,
    send: async <T,>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) =>
      route(method, path, body) as T,
  };
  return { api, calls, state, sessions, settings };
}

/** Renders the whole app at `path` against the fake API, with an event stream the test drives. */
export function renderApp(path: string, fake = fakeApi()) {
  let options: ConnectOptions | undefined;
  const connect: Connect = (o) => {
    options = o;
    return { close: () => {} };
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let seq = 0;
  const emit = (event: Omit<RuntimeEvent, "seq" | "at">) =>
    act(() => {
      seq += 1;
      options?.onEvent({ ...event, seq, at: "2026-09-29T12:00:00.000Z" } as RuntimeEvent);
    });
  const view = render(
    <QueryClientProvider client={client}>
      <DaemonProvider token="tok" api={fake.api} connect={connect}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </DaemonProvider>
    </QueryClientProvider>,
  );
  return { ...view, ...fake, emit, client };
}
