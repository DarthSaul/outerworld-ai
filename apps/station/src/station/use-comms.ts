import {
  type ChatterSnapshot,
  chatterLines,
  type Dashboard,
  isLive,
  type ModelSettings,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import type { CommsMessage } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { useDaemon } from "../daemon-context.js";
import {
  type MemoryItem,
  useConsents,
  useDecideConsent,
  useDecideMemory,
  useSpend,
  useStationView,
} from "../queries.js";

type Approval =
  | {
      readonly kind: "consent";
      readonly id: string;
      readonly agentId: string;
      readonly tool: string;
      readonly at: string;
    }
  | {
      readonly kind: "memory";
      readonly id: string;
      readonly agentId: string;
      readonly text: string;
      readonly at: string;
    };

export interface Comms {
  readonly message?: CommsMessage;
  readonly approve: () => void;
  readonly deny: () => void;
  readonly next: () => void;
  /**
   * Gives the Overseer an order: always a new session (with `settings` as its model choice, if
   * any), then the message. `onStarted` gets the session id once the run is under way.
   */
  readonly order: (
    text: string,
    settings: ModelSettings | null,
    onStarted: (sessionId: string) => void,
  ) => void;
  readonly busy: boolean;
  readonly error: Error | null;
}

/**
 * The Overseer comms panel (ADR-0013 #12–14) while no order is open: approvals waiting on the
 * Commander (consents and memory proposals, oldest first), then ambient chatter made only from
 * what the runtime proves. An order opens a new session, which the panel then shows as a chat.
 */
export function useComms(
  dashboard: Dashboard | undefined,
  proposals: readonly MemoryItem[],
): Comms {
  const { api } = useDaemon();
  const station = useStationView();
  const consents = useConsents();
  const spend = useSpend();
  const overseer = dashboard?.overseer;
  const decideConsent = useDecideConsent();
  const decideMemory = useDecideMemory();
  const [chatIdx, setChatIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const nameOf = (id: string) => dashboard?.crew.find((c) => c.id === id)?.name ?? id;
  const speakerFor = (agentId: string) => {
    const member = dashboard?.crew.find((c) => c.id === agentId);
    const room = dashboard?.rooms.find((r) => r.id === member?.roomId);
    return room ? `${nameOf(agentId)} · ${room.name}` : nameOf(agentId);
  };

  const approvals: Approval[] = [
    ...(consents.data ?? []).map(
      (c): Approval => ({
        kind: "consent",
        id: c.id,
        agentId: c.agentId,
        tool: c.tool,
        at: c.createdAt,
      }),
    ),
    ...proposals.map(
      (m): Approval => ({
        kind: "memory",
        id: m.id,
        agentId: m.agentId,
        text: m.text,
        at: m.createdAt,
      }),
    ),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const [approval] = approvals;

  const snapshot: ChatterSnapshot = {
    live: (dashboard?.missions ?? [])
      .filter((m) => isLive(m.state))
      .map((m) => ({
        agent: nameOf(m.agentId),
        room: dashboard?.rooms.find((r) => r.id === m.roomId)?.name ?? "",
        title: m.title,
      })),
    waiting: (dashboard?.crew ?? []).filter((c) => c.status === "blocked").map((c) => c.name),
    ...(() => {
      const done = dashboard?.missions.find((m) => m.status === "done");
      return done ? { lastDone: { agent: nameOf(done.agentId), title: done.title } } : {};
    })(),
    spendUsd: spend.data?.stationUsd ?? 0,
    ...(station.data?.station?.budgets.stationDailyUsd !== undefined
      ? { capUsd: station.data.station.budgets.stationDailyUsd }
      : {}),
  };
  const lines = chatterLines(snapshot);
  const line = lines[chatIdx % lines.length];
  const overseerName = overseer?.name ?? term("overseer.role");

  let message: CommsMessage | undefined;
  if (approval) {
    message = {
      key: `${approval.kind}:${approval.id}`,
      speaker: speakerFor(approval.agentId),
      text:
        approval.kind === "consent"
          ? termWith("comms.consentAsk", { agent: nameOf(approval.agentId), tool: approval.tool })
          : termWith("comms.memoryAsk", { agent: nameOf(approval.agentId), text: approval.text }),
      kind: "approval",
    };
  } else if (line) {
    message = {
      key: `chatter:${chatIdx}`,
      speaker: overseerName,
      text: termWith(line.key, line.vars),
      kind: "chatter",
    };
  }

  const decide = (yes: boolean) => {
    if (!approval) return;
    if (approval.kind === "consent") {
      decideConsent.mutate({ id: approval.id, decision: yes ? "approved" : "denied" });
    } else {
      decideMemory.mutate({ id: approval.id, decision: yes ? "approve" : "reject" });
    }
  };

  const order: Comms["order"] = (text, settings, onStarted) => {
    if (!overseer || sending) return;
    setSending(true);
    setError(null);
    void (async () => {
      try {
        // Every order is its own conversation (a new session), never appended to an old one.
        const { id: sessionId } = await api.send<{ id: string }>(
          "POST",
          `/agents/${encodeURIComponent(overseer.id)}/sessions`,
          {},
        );
        if (settings) {
          await api.send("PATCH", `/sessions/${encodeURIComponent(sessionId)}`, {
            modelSettings: settings,
          });
        }
        await api.send("POST", `/sessions/${encodeURIComponent(sessionId)}/messages`, { text });
        onStarted(sessionId);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setSending(false);
      }
    })();
  };

  return {
    ...(message ? { message } : {}),
    approve: () => decide(true),
    deny: () => decide(false),
    next: () => setChatIdx((i) => i + 1),
    order,
    busy: sending || decideConsent.isPending || decideMemory.isPending,
    error: error ?? decideConsent.error ?? decideMemory.error,
  };
}
