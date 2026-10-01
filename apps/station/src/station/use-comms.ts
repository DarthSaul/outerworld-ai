import {
  type ChatterSnapshot,
  chatterLines,
  type Dashboard,
  isLive,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import type { CommsMessage } from "@darthsaul/outerworld-ai-ui";
import { useEffect, useState } from "react";
import { useDaemon } from "../daemon-context.js";
import {
  type MemoryItem,
  useConsents,
  useDecideConsent,
  useDecideMemory,
  useSessions,
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

interface Reply {
  readonly runId: string;
  readonly text: string;
  readonly done: boolean;
}

export interface Comms {
  readonly message?: CommsMessage;
  readonly approve: () => void;
  readonly deny: () => void;
  readonly next: () => void;
  readonly order: (text: string) => void;
  readonly busy: boolean;
  readonly error: Error | null;
}

const ENDED = new Set(["run.completed", "run.failed", "run.cancelled", "run.interrupted"]);

/**
 * The Overseer comms panel (ADR-0013 #12–14): a streamed reply to the Commander's order comes
 * first, then approvals waiting on the Commander (consents and memory proposals, oldest first),
 * then ambient chatter made only from what the runtime proves.
 */
export function useComms(
  dashboard: Dashboard | undefined,
  proposals: readonly MemoryItem[],
): Comms {
  const { api, subscribe } = useDaemon();
  const station = useStationView();
  const consents = useConsents();
  const spend = useSpend();
  const overseer = dashboard?.overseer;
  const sessions = useSessions(overseer?.id);
  const decideConsent = useDecideConsent();
  const decideMemory = useDecideMemory();
  const [chatIdx, setChatIdx] = useState(0);
  const [reply, setReply] = useState<Reply | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stream the reply to the order: deltas append, the run's end lets it move on.
  const replyRun = reply?.runId;
  useEffect(() => {
    if (!replyRun) return;
    return subscribe((e) => {
      if (e.runId !== replyRun) return;
      if (e.type === "run.delta") {
        setReply((r) => (r && r.runId === replyRun ? { ...r, text: r.text + e.payload.text } : r));
      } else if (ENDED.has(e.type)) {
        setReply((r) => (r && r.runId === replyRun ? { ...r, done: true } : r));
      }
    });
  }, [replyRun, subscribe]);

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
  if (reply) {
    message = {
      key: `reply:${reply.runId}`,
      speaker: overseerName,
      text: reply.text,
      kind: "reply",
      ...(reply.done ? {} : { streaming: true }),
    };
  } else if (approval) {
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

  const order = (text: string) => {
    if (!overseer || sending) return;
    setSending(true);
    setError(null);
    void (async () => {
      try {
        const open = sessions.data?.find((s) => !s.archivedAt);
        const sessionId =
          open?.id ??
          (
            await api.send<{ id: string }>(
              "POST",
              `/agents/${encodeURIComponent(overseer.id)}/sessions`,
              {},
            )
          ).id;
        const { runId } = await api.send<{ runId: string }>(
          "POST",
          `/sessions/${encodeURIComponent(sessionId)}/messages`,
          { text },
        );
        setReply({ runId, text: "", done: false });
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
    next: () => {
      if (reply) setReply(undefined);
      else setChatIdx((i) => i + 1);
    },
    order,
    busy: sending || decideConsent.isPending || decideMemory.isPending,
    error: error ?? decideConsent.error ?? decideMemory.error,
  };
}
