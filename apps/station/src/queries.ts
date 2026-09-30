import type {
  AgentDocumentName,
  AgentView,
  ChatMessage,
  CreateAgentInput,
  CreateRoomInput,
  Room,
  RunState,
  SettingsView,
  SpendView,
  StationView,
  SupportedModel,
  UpdateAgentInput,
  UpdateRoomInput,
} from "@darthsaul/outerworld-ai-core";
import { useMutation, useQuery } from "@tanstack/react-query";
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
