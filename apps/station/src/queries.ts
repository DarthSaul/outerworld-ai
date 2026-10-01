import type {
  AgentDocumentName,
  AgentSchedule,
  AgentView,
  ChatMessage,
  CreateAgentInput,
  CreateRoomInput,
  CreateScheduleInput,
  Notification,
  OnboardInput,
  Room,
  RunState,
  SettingsView,
  SpendView,
  StationView,
  SupportedModel,
  UpdateAgentInput,
  UpdateBudgetsInput,
  UpdateRoomInput,
  UpdateScheduleInput,
} from "@darthsaul/outerworld-ai-core";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useDaemon } from "./daemon-context.js";

/**
 * Server state for the Crew screens. Mutations do not patch the cache themselves: the daemon's
 * `agent.updated` / `station.updated` events invalidate it (daemon-context), so a change made in
 * another tab or by hand on disk shows up the same way as one made here.
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

export function useUpdateAgent(id: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: UpdateAgentInput) =>
      api.send<AgentView>("PATCH", `/agents/${encodeURIComponent(id)}`, input),
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
}
export interface RunRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly state: RunState;
  readonly trigger?: "user" | "dispatch" | "schedule" | "review";
  readonly depth?: number;
  readonly model: string;
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
      api.get<SessionRecord[]>(`/agents/${encodeURIComponent(agentId ?? "")}/sessions`),
    enabled: agentId !== undefined,
  });
}

export function useSession(id: string) {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => api.get<SessionDetail>(`/sessions/${encodeURIComponent(id)}`),
  });
}

export function useCreateSession() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (agentId: string) =>
      api.send<SessionRecord>("POST", `/agents/${encodeURIComponent(agentId)}/sessions`, {}),
  });
}

export function useUpdateSession(id: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (input: { title?: string; archived?: true }) =>
      api.send<SessionRecord>("PATCH", `/sessions/${encodeURIComponent(id)}`, input),
  });
}

export function useSendMessage(sessionId: string) {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (text: string) =>
      api.send<{ runId: string }>("POST", `/sessions/${encodeURIComponent(sessionId)}/messages`, {
        text,
      }),
  });
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

export function useSetApiKey() {
  const { api } = useDaemon();
  return useMutation({
    mutationFn: (key: string) => api.send("PUT", "/settings/openrouter", { key }),
  });
}

export function useClearApiKey() {
  const { api } = useDaemon();
  return useMutation({ mutationFn: () => api.send("DELETE", "/settings/openrouter") });
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
}

export function useConnectors() {
  const { api } = useDaemon();
  return useQuery({
    queryKey: ["connectors"],
    queryFn: () => api.get<ConnectorItem[]>("/connectors"),
  });
}

export function useAddNotion() {
  const { api } = useDaemon();
  return useMutation({ mutationFn: () => api.send("POST", "/connectors", { preset: "notion" }) });
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
