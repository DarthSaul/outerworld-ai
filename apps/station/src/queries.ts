import {
  type AgentDocumentName,
  type AgentSchedule,
  type AgentView,
  type ChatMessage,
  type ConnectorClientInput,
  type ConnectorPresetId,
  type CreateAgentInput,
  type CreateLaneInput,
  type CreateRoomInput,
  type CreateScheduleInput,
  type CrewActivityEntry,
  type HealthView,
  type Lane,
  type ModelSettings,
  type Notification,
  type OnboardInput,
  type ProviderChoice,
  type ReasoningLevel,
  type Room,
  type RunState,
  type SettingsView,
  type SpendView,
  type StationView,
  type SupportedModel,
  term,
  type UpdateAgentInput,
  type UpdateBudgetsInput,
  type UpdateRoomInput,
  type UpdateScheduleInput,
} from "@darthsaul/outerworld-ai-core";
import {
  type MutateOptions,
  type Mutation,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useDaemon } from "./daemon-context.js";

/**
 * Server state for the Crew screens. Mutations mostly do not patch the cache themselves: the
 * daemon's `agent.updated` / `station.updated` events invalidate it (daemon-context), so a change
 * made in another tab or by hand on disk shows up the same way as one made here. The one exception
 * is `useUpdateAgent`, which writes the saved crew member back at once (see there).
 */
export function useStationView() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["station"], queryFn: () => api.get<StationView>("/station") });
}

export function useAgent(id: string) {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<AgentView>(`/agents/${encodeURIComponent(id)}`),
  });
}

export function useModels() {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["models"],
    queryFn: () => api.get<SupportedModel[]>("/models"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateAgent() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.send<AgentView>("POST", "/agents", input),
  });
}

/**
 * Saves a crew member's config. The daemon answers with the saved crew member, which replaces the
 * cached one before the save reports done: the next edit (another connector grant, say) builds on
 * what was saved, not on a snapshot from before it, even before the refetch arrives.
 *
 * Ordered so an older answer never lands over a newer one: every save of one crew member, from any
 * form on the page, shares a scope and goes out one at a time, in order, each answer reflecting
 * all saves before it. A refetch already in flight (started by an event before this save landed)
 * is cancelled first, so its older snapshot cannot overwrite the answer; the save's own
 * `agent.updated` event refetches afterwards.
 */
export function useUpdateAgent(id: string) {
  const { api } = useDaemon();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAgentInput) =>
      api.send<AgentView>("PATCH", `/agents/${encodeURIComponent(id)}`, input),
    scope: { id: `agent:${id}` },
    onSuccess: async (saved) => {
      if (!saved) return;
      await client.cancelQueries({ queryKey: ["agent", id] });
      client.setQueryData(["agent", id], saved);
    },
  });
}

export function useSaveDocument(id: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ name, text }: { name: AgentDocumentName; text: string }) =>
      api.send("PUT", `/agents/${encodeURIComponent(id)}/documents/${name}`, { text }),
  });
}

export function useDeleteAgent() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/agents/${encodeURIComponent(id)}`),
  });
}

export function useCreateRoom() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: CreateRoomInput) => api.send<Room>("POST", "/rooms", input),
  });
}

export function useUpdateRoom() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoomInput }) =>
      api.send<Room>("PATCH", `/rooms/${encodeURIComponent(id)}`, input),
  });
}

export function useDeleteRoom() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/rooms/${encodeURIComponent(id)}`),
  });
}

/** A stored session as the daemon returns it (mirrors the daemon's SessionDetail). */
export interface SessionRecord {
  readonly id: string;
  readonly agentId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly archivedAt?: string;
  /** This conversation's model choice over the crew member's default (ADR-0016). */
  readonly modelSettings?: ModelSettings;
}
/** A session in a list: `GET /agents/:id/sessions`, most recently active first. */
export interface SessionSummary extends SessionRecord {
  readonly messageCount: number;
  readonly lastMessageAt?: string;
  readonly lastMessage?: { readonly role: "user" | "assistant"; readonly text: string };
  readonly active: boolean;
  /** `dispatch`: the Overseer opened it to hand a crew member work. */
  readonly origin: "commander" | "dispatch";
}
export interface RunRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly state: RunState;
  readonly trigger?: "user" | "dispatch" | "schedule" | "review";
  readonly depth?: number;
  readonly model: string;
  readonly provider?: ProviderChoice;
  readonly reasoning?: ReasoningLevel;
  readonly createdAt: string;
  readonly error?: string;
  readonly steps: number;
}
export interface SessionDetail {
  readonly session: SessionRecord;
  readonly messages: readonly {
    id: string;
    position: number;
    runId?: string;
    message: ChatMessage;
  }[];
  readonly runs: readonly RunRecord[];
  readonly spend: SpendTotal;
  readonly runSpend: Readonly<Record<string, SpendTotal>>;
  readonly dispatches: readonly DispatchRecord[];
}
export interface DispatchRecord {
  readonly id: string;
  readonly leadAgentId: string;
  readonly leadSessionId: string;
  readonly leadRunId: string;
  readonly workerAgentId: string;
  readonly workerSessionId: string;
  readonly workerRunId?: string;
  readonly task: string;
  readonly status: "running" | "completed" | "failed" | "cancelled" | "blocked" | "interrupted";
  readonly summary?: string;
  readonly createdAt: string;
}
export interface ActivityView {
  readonly runs: readonly RunRecord[];
  readonly dispatches: readonly DispatchRecord[];
  /** What each crew member is doing now (D24); absent means idle. */
  readonly crew: Readonly<Record<string, CrewActivityEntry>>;
}
export interface SpendTotal {
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly calls: number;
  readonly unpriced: number;
}
export interface ConsentRecord {
  readonly id: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly toolCallId: string;
  readonly tool: string;
  readonly input: unknown;
  readonly status: "pending" | "approved" | "denied" | "expired";
  readonly createdAt: string;
}

export function useSessions(agentId: string | undefined) {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["sessions", agentId],
    queryFn: () =>
      api.get<SessionSummary[]>(`/agents/${encodeURIComponent(agentId ?? "")}/sessions`),
    enabled: agentId !== undefined,
  });
}

/** Every crew member's sessions, newest activity first (the Station's session list). */
export function useAllSessions() {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["sessions", "*"],
    queryFn: () => api.get<SessionSummary[]>("/sessions"),
  });
}

/** One session and its history; with no id, nothing is fetched. */
export function useSession(id: string | undefined) {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => api.get<SessionDetail>(`/sessions/${encodeURIComponent(id ?? "")}`),
    enabled: id !== undefined,
  });
}

export function useCreateSession() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (agentId: string) =>
      api.send<SessionRecord>("POST", `/agents/${encodeURIComponent(agentId)}/sessions`, {}),
  });
}

const sessionUpdateKey = (id: string) => ["session", id, "update"] as const;

export function useUpdateSession(id: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationKey: sessionUpdateKey(id),
    mutationFn: (input: {
      title?: string;
      archived?: true;
      modelSettings?: ModelSettings | null;
      /** Hands the conversation to another crew member (ADR-0018). */
      agentId?: string;
    }) => api.send<SessionRecord>("PATCH", `/sessions/${encodeURIComponent(id)}`, input),
    // One session's writes go out one at a time, in order: a later one never lands first.
    scope: { id: `session:${id}` },
  });
}

interface QueuedMessage {
  readonly text: string;
  /** Handovers still in flight when the message was sent: it goes out only if they all land. */
  readonly after: readonly Mutation<unknown, Error, unknown, unknown>[];
}

export function useSendMessage(sessionId: string) {
  const { api } = useDaemon();
  const client = useQueryClient();
  const send = useMutation({
    mutationFn: async ({ text, after }: QueuedMessage) => {
      // A failed handover leaves the session with its old crew member: the message was meant for
      // the new one, so it is not sent, and stays in the box.
      if (after.some((h) => h.state.status === "error"))
        throw new Error(term("comms.agent.notSent"));
      return api.send<{ runId: string }>(
        "POST",
        `/sessions/${encodeURIComponent(sessionId)}/messages`,
        { text },
      );
    },
    // The same scope as the session's own writes: a message waits for a handover in flight, so
    // it goes to the crew member the Commander just picked.
    scope: { id: `session:${sessionId}` },
  });
  const mutate = (
    text: string,
    options?: MutateOptions<{ runId: string }, Error, QueuedMessage>,
  ) => {
    const after = client
      .getMutationCache()
      .findAll({ mutationKey: sessionUpdateKey(sessionId), status: "pending" })
      .filter(
        (m) => (m.state.variables as { agentId?: string } | undefined)?.agentId !== undefined,
      );
    send.mutate({ text, after }, options);
  };
  return { ...send, mutate };
}

export function useCancelRun() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (runId: string) => api.send("POST", `/runs/${encodeURIComponent(runId)}/cancel`),
  });
}

export function useSettings() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<SettingsView>("/settings") });
}

/** A model provider whose key the Commander can set (ADR-0015). */
export type KeyProviderName = "openrouter" | "anthropic";

export function useSetApiKey(provider: KeyProviderName = "openrouter") {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (key: string) => api.send("PUT", `/settings/${provider}`, { key }),
  });
}

export function useClearApiKey(provider: KeyProviderName = "openrouter") {
  const { api } = useDaemon();
  return useMutation({ mutationFn: () => api.send("DELETE", `/settings/${provider}`) });
}

export function useConsents() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["consents"], queryFn: () => api.get<ConsentRecord[]>("/consents") });
}

export function useDecideConsent() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "denied" }) =>
      api.send<ConsentRecord>("POST", `/consents/${encodeURIComponent(id)}`, { decision }),
  });
}

export function useKillSwitch() {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["kill-switch"],
    queryFn: () => api.get<{ engaged: boolean }>("/kill-switch"),
  });
}

export function useSetKillSwitch() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (engaged: boolean) =>
      api.send<{ engaged: boolean }>("PUT", "/kill-switch", { engaged }),
  });
}

export function useSpend() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["spend"], queryFn: () => api.get<SpendView>("/spend") });
}

export function useActivity() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["activity"], queryFn: () => api.get<ActivityView>("/activity") });
}

export function useSteer() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ runId, text }: { runId: string; text: string }) =>
      api.send("POST", `/runs/${encodeURIComponent(runId)}/steer`, { text }),
  });
}

export interface ConnectorItem {
  readonly id: string;
  readonly name: string;
  readonly url?: string;
  readonly status: "disconnected" | "needs_auth" | "connected" | "error";
  readonly detail?: string;
  readonly tools: readonly { name: string; class: "read" | "write"; description: string }[];
  readonly grantedTo: readonly string[];
  /** For a server that registers no clients: whether the Commander's OAuth app is saved. */
  readonly ownClient?: { readonly set: boolean; readonly redirectUrl: string };
  /** While it needs sign-in: where to sign in. */
  readonly authorizationUrl?: string;
}

export function useConnectors() {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.get<ConnectorItem[]>("/connectors"),
  });
}

export function useAddConnector() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (preset: ConnectorPresetId) => api.send("POST", "/connectors", { preset }),
  });
}

/** The Commander's own OAuth app for a server that registers none (ADR-0019). */
export function useSetConnectorClient() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, ...client }: { id: string } & ConnectorClientInput) =>
      api.send("PUT", `/connectors/${encodeURIComponent(id)}/client`, client),
  });
}

export function useUpdateConnector() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      api.send("PATCH", `/connectors/${encodeURIComponent(id)}`, { url }),
  });
}

export function useRemoveConnector() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/connectors/${encodeURIComponent(id)}`),
  });
}

export function useConnect() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) =>
      api.send<{ status: ConnectorItem["status"]; authorizationUrl?: string; detail?: string }>(
        "POST",
        `/connectors/${encodeURIComponent(id)}/connect`,
      ),
  });
}

export function useDisconnect() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, forget }: { id: string; forget: boolean }) =>
      api.send("POST", `/connectors/${encodeURIComponent(id)}/disconnect`, { forget }),
  });
}

export interface MemoryItem {
  readonly id: string;
  readonly agentId: string;
  readonly scope: "agent" | "station";
  readonly text: string;
  readonly status: "proposed" | "approved" | "rejected";
  readonly sourceRunId?: string;
  readonly createdAt: string;
  readonly decidedAt?: string;
}

export interface MemoryView {
  readonly proposals: readonly MemoryItem[];
  readonly beliefs: readonly MemoryItem[];
}

export function useMemories(agentId: string | undefined) {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["memories", agentId],
    queryFn: () => api.get<MemoryView>(`/agents/${encodeURIComponent(agentId ?? "")}/memories`),
    enabled: agentId !== undefined,
  });
}

/** Approve (with `text` when the Commander edited it) or reject a proposal. */
export function useDecideMemory() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      text,
    }: {
      id: string;
      decision: "approve" | "reject";
      text?: string;
    }) =>
      api.send<MemoryItem>(
        "POST",
        `/memories/${encodeURIComponent(id)}/${decision}`,
        text !== undefined ? { text } : undefined,
      ),
  });
}

export function useEditMemory() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.send<MemoryItem>("PATCH", `/memories/${encodeURIComponent(id)}`, { text }),
  });
}

export function useForgetMemory() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/memories/${encodeURIComponent(id)}`),
  });
}

/** A fire in a schedule's history (mirrors the runtime's ScheduleFire). */
export interface ScheduleFireItem {
  readonly scheduledFor: string;
  readonly at: string;
  readonly outcome: "fired" | "missed";
  readonly reason?: "down" | "busy" | "stopped" | "error";
  readonly detail?: string;
  readonly manual: boolean;
  readonly sessionId?: string;
  readonly runId?: string;
  readonly runState?: string;
}

/** `GET /api/agents/:id/schedules` (mirrors the runtime's ScheduleView). */
export interface ScheduleItem {
  readonly id: string;
  readonly cron: string;
  readonly timezone: string;
  readonly timezoneSet: boolean;
  readonly prompt: string;
  readonly enabled: boolean;
  readonly catchUp: boolean;
  readonly modelSettings?: ModelSettings;
  readonly sessionId?: string;
  readonly nextRunAt?: string;
  readonly error?: string;
  readonly history: readonly ScheduleFireItem[];
}

const schedulePath = (agentId: string, scheduleId?: string) =>
  `/agents/${encodeURIComponent(agentId)}/schedules${scheduleId ? `/${encodeURIComponent(scheduleId)}` : ""}`;

export function useSchedules(agentId: string) {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["schedules", agentId],
    queryFn: () => api.get<ScheduleItem[]>(schedulePath(agentId)),
  });
}

export function useAddSchedule(agentId: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      api.send<AgentSchedule>("POST", schedulePath(agentId), input),
  });
}

export function useUpdateSchedule(agentId: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateScheduleInput }) =>
      api.send<AgentSchedule>("PATCH", schedulePath(agentId, id), input),
  });
}

export function useRemoveSchedule(agentId: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", schedulePath(agentId, id)),
  });
}

export function useRunSchedule(agentId: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) =>
      api.send<ScheduleFireItem>("POST", `${schedulePath(agentId, id)}/run`),
  });
}

export function useUpdateBudgets() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: UpdateBudgetsInput) => api.send("PUT", "/budgets", input),
  });
}

/** A page of the Notifications feed (mirrors the runtime's NotificationPage). */
export interface NotificationPage {
  readonly items: readonly Notification[];
  readonly unread: number;
  readonly readSeq: number;
  readonly nextBefore?: number;
}

/** The feed, newest first, one page at a time; the first page also carries the unread count. */
export function useNotifications() {
  const { api } = useDaemon();
  return useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api.get<NotificationPage>(
        pageParam === undefined ? "/notifications" : `/notifications?before=${pageParam}`,
      ),
    getNextPageParam: (last) => last.nextBefore,
  });
}

export function useMarkRead() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (seq: number) =>
      api.send<{ readSeq: number; unread: number }>("POST", "/notifications/read", { seq }),
  });
}

export function useOnboard() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: OnboardInput) => api.send<AgentView>("POST", "/onboarding", input),
  });
}

export function useAddProjectManager() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: () => api.send<AgentView>("POST", "/templates/project-manager", {}),
  });
}

/** Sets which pixel character a crew member appears as (Crew Select). */
export function useSetLook() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: ({ agentId, look }: { agentId: string; look: string }) =>
      api.send<AgentView>("PATCH", `/agents/${encodeURIComponent(agentId)}`, { look }),
  });
}

/** A recent run with its title (mirrors the daemon's RecentRun): the dashboard's missions. */
export type RecentRun = RunRecord & { readonly title: string };

export function useRecentRuns() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["runs"], queryFn: () => api.get<RecentRun[]>("/runs") });
}

export function useHealth() {
  const { api } = useDaemon();
  return useQuery({ queryKey: ["health"], queryFn: () => api.get<HealthView>("/health") });
}

export function useCreateLane() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: CreateLaneInput) => api.send<Lane>("POST", "/lanes", input),
  });
}

export function useDeleteLane() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (id: string) => api.send("DELETE", `/lanes/${encodeURIComponent(id)}`),
  });
}

/** Memory proposals awaiting a decision from every crew member, oldest first. */
export function useMemoryProposals(agentIds: readonly string[]): MemoryItem[] {
  const { api } = useDaemon();
  return useQueries({
    queries: agentIds.map((id) => ({
      queryKey: ["memories", id],
      queryFn: () => api.get<MemoryView>(`/agents/${encodeURIComponent(id)}/memories`),
    })),
    combine: (results) =>
      results
        .flatMap((r) => r.data?.proposals ?? [])
        .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  });
}
