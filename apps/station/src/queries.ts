import type {
  AgentDocumentName,
  AgentView,
  CreateAgentInput,
  CreateRoomInput,
  Room,
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
