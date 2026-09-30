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
import type {
  ConnectorItem,
  ConsentRecord,
  DispatchRecord,
  MemoryItem,
  RunRecord,
  ScheduleFireItem,
  ScheduleItem,
  SessionDetail,
  SessionRecord,
  SpendTotal,
} from "../queries.js";

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
    {
      session: SessionRecord;
      messages: ChatMessage[];
      runs: RunRecord[];
      /** Run id per message index, when a test needs messages tied to runs. */
      messageRuns?: Record<number, string>;
    }
  >();
  const settings = {
    modelMode: "fake" as "fake" | "openrouter",
    openrouter: { configured: false, source: null as "keychain" | "env" | null },
  };
  const consents: ConsentRecord[] = [];
  const dispatches: DispatchRecord[] = [];
  const connectors: ConnectorItem[] = [];
  const memories: MemoryItem[] = [];
  const scheduleHistory = new Map<string, ScheduleFireItem[]>();
  const connectAnswer: {
    status: ConnectorItem["status"];
    authorizationUrl?: string;
    detail?: string;
  } = {
    status: "connected",
  };
  const control = { engaged: false };
  const spend = {
    stationUsd: 0,
    agents: {} as Record<string, number>,
    sessions: {} as Record<string, SpendTotal>,
  };
  const zero: SpendTotal = { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0, unpriced: 0 };
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
    if (path === "/consents") return consents.filter((c) => c.status === "pending");
    if (parts[0] === "consents") {
      const c = consents.find((x) => x.id === parts[1]);
      if (!c) throw new ApiError(404, "no consent");
      const decided = { ...c, status: b.decision as ConsentRecord["status"] };
      consents.splice(consents.indexOf(c), 1, decided);
      return decided;
    }
    if (path === "/kill-switch") {
      if (method === "PUT") control.engaged = Boolean(b.engaged);
      return { engaged: control.engaged };
    }
    if (path === "/spend")
      return { day: "2026-09-29", stationUsd: spend.stationUsd, agents: spend.agents };
    if (path === "/settings/openrouter") {
      if (method === "PUT") {
        if (!String(b.key).startsWith("sk-or-"))
          throw new ApiError(400, "OpenRouter did not accept this key");
        settings.openrouter = { configured: true, source: "keychain" };
      } else settings.openrouter = { configured: false, source: null };
      return undefined;
    }
    if (parts[0] === "agents" && parts[2] === "schedules") {
      const a = state.agents.get(parts[1] ?? "");
      if (!a) throw new ApiError(404, `no agent "${parts[1]}"`);
      const list = a.config.schedules;
      const sid = parts[3];
      if (method === "GET") {
        return list.map(
          (sc): ScheduleItem => ({
            id: sc.id,
            cron: sc.cron,
            timezone: sc.timezone ?? "UTC",
            timezoneSet: sc.timezone !== undefined,
            prompt: sc.prompt,
            enabled: sc.enabled,
            catchUp: sc.catchUp,
            ...(sc.enabled ? { nextRunAt: "2026-10-01T06:00:00.000Z" } : {}),
            history: scheduleHistory.get(`${parts[1]}/${sc.id}`) ?? [],
          }),
        );
      }
      if (b.cron === "61 * * * *") {
        throw new ApiError(409, "the schedule's cron cannot run", [
          { path: "schedules.0.cron", message: "CronPattern: Invalid value for minute: 61" },
        ]);
      }
      if (method === "POST" && parts[4] === "run") {
        return {
          scheduledFor: "2026-09-30T12:00:00.000Z",
          at: "2026-09-30T12:00:00.000Z",
          outcome: "fired",
          manual: true,
        };
      }
      if (method === "POST") {
        const sc = {
          id: nextId("sched"),
          catchUp: false,
          enabled: true,
          ...(b as { cron: string; prompt: string }),
        };
        a.config = { ...a.config, schedules: [...list, sc] };
        return sc;
      }
      if (method === "DELETE") {
        a.config = { ...a.config, schedules: list.filter((x) => x.id !== sid) };
        return undefined;
      }
      a.config = {
        ...a.config,
        schedules: list.map((x) => (x.id === sid ? { ...x, ...(b as object) } : x)),
      };
      return a.config.schedules.find((x) => x.id === sid);
    }
    if (parts[0] === "agents" && parts[2] === "memories") {
      const mine = (m: MemoryItem) => m.agentId === parts[1] || m.scope === "station";
      return {
        proposals: memories.filter((m) => m.agentId === parts[1] && m.status === "proposed"),
        beliefs: memories.filter((m) => mine(m) && m.status === "approved"),
      };
    }
    if (parts[0] === "memories") {
      const m = memories.find((x) => x.id === parts[1]);
      if (!m) throw new ApiError(404, "no memory");
      const i = memories.indexOf(m);
      if (method === "DELETE") {
        memories.splice(i, 1);
        return undefined;
      }
      const status = parts[2] === "reject" ? "rejected" : "approved";
      memories[i] = { ...m, status, ...(b.text ? { text: String(b.text) } : {}) };
      return memories[i];
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
            ...(entry.messageRuns?.[i] ? { runId: entry.messageRuns[i] } : {}),
          })),
          runs: [...entry.runs].reverse(),
          spend: spend.sessions[entry.session.id] ?? zero,
          runSpend: {},
          dispatches: dispatches.filter((d) => d.leadSessionId === entry.session.id),
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
    if (path === "/connectors") {
      if (method === "GET") return connectors;
      const added: ConnectorItem = {
        id: "notion",
        name: "Notion",
        url: "https://mcp.notion.com/mcp",
        status: "disconnected",
        tools: [],
        grantedTo: [],
      };
      connectors.push(added);
      return added;
    }
    if (parts[0] === "connectors") {
      const c = connectors.find((x) => x.id === parts[1]);
      if (!c) throw new ApiError(404, "no connector");
      const i = connectors.indexOf(c);
      if (parts[2] === "connect") {
        connectors[i] = { ...c, status: connectAnswer.status };
        return connectAnswer;
      }
      if (parts[2] === "disconnect") {
        connectors[i] = { ...c, status: "disconnected", tools: [] };
        return undefined;
      }
      if (method === "PATCH") {
        connectors[i] = { ...c, url: String(b.url) };
        return connectors[i];
      }
      if (method === "DELETE") {
        connectors.splice(i, 1);
        return undefined;
      }
    }
    if (path === "/activity") {
      const runs = [...sessions.values()]
        .flatMap((e) => e.runs)
        .filter((r) => r.state === "running");
      return { runs, dispatches: dispatches.filter((d) => d.status === "running") };
    }
    if (parts[0] === "runs" && parts[2] === "steer") return undefined;
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
  /** Seeds a session directly, for tests that need one without clicking through COMMS. */
  const seedSession = (agentId: string, title = "Seeded") => {
    const session: SessionRecord = {
      id: nextId("s"),
      agentId,
      title,
      createdAt: "2026-09-29T12:00:00.000Z",
    };
    sessions.set(session.id, { session, messages: [], runs: [] });
    const entry = sessions.get(session.id);
    if (!entry) throw new Error("seed failed");
    return entry;
  };
  return {
    connectors,
    connectAnswer,
    memories,
    scheduleHistory,
    api,
    calls,
    state,
    sessions,
    settings,
    consents,
    control,
    spend,
    dispatches,
    seedSession,
  };
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
