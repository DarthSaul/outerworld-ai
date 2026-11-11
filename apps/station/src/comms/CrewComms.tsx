import { term, termWith } from "@darthsaul/outerworld-ai-core";
import { crewOptionGroups, Dropdown, OutlineButton, PanelLabel } from "@darthsaul/outerworld-ai-ui";
import { useEffect, useId, useRef, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { useCreateSession, useSessions, useStationView } from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";
import { ChatWindow } from "./ChatWindow.js";
import { SessionButton } from "./CommsPage.js";

/**
 * COMMS, condensed for the Station's comms card (ADR-0014): a crew dropdown (the scanner's, with
 * each crew member's character), then the chosen crew member's sessions. Opening a session fills
 * the panel with the chat and a back button; going back returns focus to that session.
 */
export function CrewComms() {
  const station = useStationView();
  const { dashboard } = useDashboard();
  const agents = station.data?.agents ?? [];
  const [agentId, setAgentId] = useState<string>();
  const current = agents.find((a) => a.id === agentId) ?? agents[0];
  const sessions = useSessions(current?.id);
  const create = useCreateSession();
  const [open, setOpen] = useState<string>();
  const [returnTo, setReturnTo] = useState<string>();
  const list = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // Back from a chat: focus the session it came from.
  useEffect(() => {
    if (open || !returnTo) return;
    list.current?.querySelector<HTMLElement>(`[data-session="${returnTo}"]`)?.focus();
  }, [open, returnTo]);

  if (open) {
    return (
      <ChatWindow
        sessionId={open}
        fill
        onBack={() => {
          setReturnTo(open);
          setOpen(undefined);
        }}
      />
    );
  }

  return (
    <div ref={list} className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 border-line-faint border-b-2 px-3 py-2">
        <span id={labelId} className="font-display text-d7 text-fg-mute uppercase">
          {termWith("scanner.crewCount", { count: String(agents.length) })}
        </span>
        {dashboard ? (
          <Dropdown
            labelledBy={labelId}
            value={current?.id ?? ""}
            placeholder={term("scanner.crewPick")}
            groups={crewOptionGroups(dashboard)}
            onChange={setAgentId}
          />
        ) : null}
      </div>
      {current ? (
        <section
          aria-label={termWith("comms.crew.sessions", { name: current.config.name })}
          className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <PanelLabel>
              {termWith("comms.crew.sessions", { name: current.config.name })}
            </PanelLabel>
            <OutlineButton
              tone="green"
              className="px-1.75 py-1"
              disabled={create.isPending}
              onClick={() => create.mutate(current.id, { onSuccess: (s) => setOpen(s.id) })}
            >
              {term("comms.new")}
            </OutlineButton>
          </div>
          <ErrorNote error={create.error ?? sessions.error} />
          {sessions.data?.length === 0 ? (
            <p className="m-0 text-b17 text-fg-mute">{term("comms.none.body")}</p>
          ) : null}
          <ul className="m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-y-auto p-0">
            {sessions.data?.map((s) => (
              <li key={s.id}>
                <SessionButton
                  session={s}
                  agentName={current.config.name}
                  open={false}
                  compact
                  onOpen={() => setOpen(s.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
