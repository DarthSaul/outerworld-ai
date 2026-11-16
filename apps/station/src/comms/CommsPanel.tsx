import {
  type Dashboard,
  isTerminal,
  type ModelSettings,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import {
  crewOptionGroups,
  Dropdown,
  OutlineButton,
  OverseerCommsBody,
  Panel,
  Sprite,
} from "@darthsaul/outerworld-ai-ui";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { ModelPicker } from "../components/ModelPicker.js";
import { useAllSessions, useSession, useStationView, useUpdateSession } from "../queries.js";
import type { Comms } from "../station/use-comms.js";
import { ChatWindow } from "./ChatWindow.js";

/**
 * The row under the COMMS strip: who answers, as a crew dropdown (or their name alone, with why,
 * when they can't be switched now).
 */
function AgentRow({
  dashboard,
  agentId,
  onPick,
  locked,
  title,
}: {
  readonly dashboard: Dashboard;
  readonly agentId: string;
  readonly onPick: (agentId: string) => void;
  /** Why the crew member can't be switched right now, if they can't. */
  readonly locked?: string;
  /** The open conversation's title, under the dropdown. */
  readonly title?: string;
}) {
  const labelId = useId();
  const member = dashboard.crew.find((c) => c.id === agentId);
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-line-faint border-b-2 px-2.5 py-2">
      {/* The dropdown draws the crew member's character itself; the plain name needs one here. */}
      {member && locked ? (
        <span aria-hidden="true" className="flex shrink-0">
          <Sprite look={member.look} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={labelId} className="sr-only">
          {term("comms.agent")}
        </span>
        {locked ? (
          <>
            <span className="truncate font-display text-d9 text-title uppercase">
              {member?.name ?? agentId}
            </span>
            <span role="note" className="text-b15 text-fg-mute">
              {locked}
            </span>
          </>
        ) : (
          <Dropdown
            labelledBy={labelId}
            value={agentId}
            placeholder={term("comms.agent.pick")}
            groups={crewOptionGroups(dashboard)}
            onChange={onPick}
          />
        )}
        {title ? <span className="truncate text-b15 text-fg-mute">{title}</span> : null}
      </div>
    </div>
  );
}

/** An open session: the agent row (switching hands the conversation over), then the chat. */
function SessionComms({
  dashboard,
  sessionId,
}: {
  readonly dashboard: Dashboard;
  readonly sessionId: string;
}) {
  const detail = useSession(sessionId);
  const all = useAllSessions();
  const update = useUpdateSession(sessionId);
  const client = useQueryClient();
  const session = detail.data?.session;
  const latest = detail.data?.runs[0];
  const running = latest !== undefined && !isTerminal(latest.state);
  const dispatched = all.data?.find((s) => s.id === sessionId)?.origin === "dispatch";
  const locked = dispatched
    ? term("comms.agent.dispatched")
    : running
      ? term("comms.agent.busy")
      : undefined;
  return (
    <>
      {session ? (
        <AgentRow
          dashboard={dashboard}
          agentId={session.agentId}
          title={session.title}
          {...(locked ? { locked } : {})}
          onPick={(agentId) => {
            if (agentId === session.agentId) return;
            update.mutate(
              { agentId },
              {
                onSuccess: () => {
                  void client.invalidateQueries({ queryKey: ["session", sessionId] });
                  void client.invalidateQueries({ queryKey: ["sessions"] });
                },
              },
            );
          }}
        />
      ) : null}
      <ErrorNote error={update.error} />
      <ChatWindow sessionId={sessionId} fill bare />
    </>
  );
}

/**
 * No session open: pick who to talk to (the Overseer by default), the approvals and chatter card,
 * and the message box. The first message starts a session with them, which then opens.
 */
function NewComms({
  dashboard,
  comms,
  paused,
  onStarted,
}: {
  readonly dashboard: Dashboard;
  readonly comms: Comms;
  readonly paused: boolean;
  readonly onStarted: (sessionId: string) => void;
}) {
  const station = useStationView();
  const fallback = dashboard.overseer?.id ?? dashboard.crew[0]?.id ?? "";
  const [picked, setPicked] = useState<string>();
  const agentId = picked && dashboard.crew.some((c) => c.id === picked) ? picked : fallback;
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const agentModel = station.data?.agents.find((a) => a.id === agentId)?.config.model ?? "";
  const name = dashboard.crew.find((c) => c.id === agentId)?.name ?? agentId;
  return (
    <>
      {agentId ? <AgentRow dashboard={dashboard} agentId={agentId} onPick={setPicked} /> : null}
      <OverseerCommsBody
        {...(comms.message ? { message: comms.message } : {})}
        {...(dashboard.overseer ? { overseerLook: dashboard.overseer.look } : {})}
        onApprove={comms.approve}
        onDeny={comms.deny}
        onNext={comms.next}
        orderPlaceholder={termWith("comms.agent.to", { name })}
        onOrder={(text) => {
          if (!agentId) return;
          comms.start(agentId, text, settings, (sessionId) => {
            setSettings(null);
            onStarted(sessionId);
          });
        }}
        busy={comms.busy}
        paused={paused}
        orderFoot={
          agentId ? (
            <ModelPicker
              compact
              value={settings ?? undefined}
              agentModel={agentModel}
              onChange={setSettings}
            />
          ) : null
        }
      />
    </>
  );
}

/**
 * The Station's COMMS column (ADR-0018): one conversation at a time, chosen in the crew column.
 * The agent row says who answers and can hand the conversation to another crew member; with none
 * open, it starts a new one. Expand widens it across the station.
 */
export function CommsPanel({
  dashboard,
  comms,
  sessionId,
  onStarted,
  expanded,
  onToggleExpanded,
  paused = false,
  className = "",
}: {
  readonly dashboard: Dashboard;
  readonly comms: Comms;
  /** The open session, if any. */
  readonly sessionId?: string;
  /** A new conversation started here: open it. */
  readonly onStarted: (sessionId: string) => void;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  /** Hold the chatter rather than move on unseen. */
  readonly paused?: boolean;
  readonly className?: string;
}) {
  return (
    <Panel
      title={term("comms")}
      className={className}
      meta={
        <OutlineButton
          tone="line"
          className="hidden px-1.75 py-1 desktop:inline-flex"
          title={term(expanded ? "comms.collapse.label" : "comms.expand.label")}
          data-expand={expanded ? "on" : "off"}
          onClick={onToggleExpanded}
        >
          {term(expanded ? "comms.collapse" : "comms.expand")}
        </OutlineButton>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {sessionId ? (
          <SessionComms key={sessionId} dashboard={dashboard} sessionId={sessionId} />
        ) : (
          <NewComms dashboard={dashboard} comms={comms} paused={paused} onStarted={onStarted} />
        )}
        <ErrorNote error={comms.error} />
      </div>
    </Panel>
  );
}
