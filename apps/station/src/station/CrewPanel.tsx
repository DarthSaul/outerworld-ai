import { type Dashboard, term, termWith } from "@darthsaul/outerworld-ai-core";
import { OutlineButton, Panel, PanelLabel, tabClass } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { CrewButton, SessionButton } from "../comms/CommsPage.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { type SessionSummary, useAllSessions, useStationView } from "../queries.js";

const FILTERS = ["all", "dispatch"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The Station's left column (ADR-0018): the crew roster over every session on the station. A crew
 * member picks them on the map and in the scanner; a session opens in COMMS; New clears COMMS for
 * a new conversation. The caret folds the column away (the page shows a folder tab instead).
 */
export function CrewPanel({
  id,
  dashboard,
  selectedAgent,
  onPickAgent,
  openSession,
  onOpenSession,
  onNew,
  onCollapse,
  className = "",
}: {
  /** The column's id, for the controls that fold and unfold it. */
  readonly id: string;
  readonly dashboard: Dashboard;
  readonly selectedAgent?: string;
  readonly onPickAgent: (agentId: string) => void;
  readonly openSession?: string;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onNew: () => void;
  readonly onCollapse: () => void;
  readonly className?: string;
}) {
  const station = useStationView();
  const sessions = useAllSessions();
  const [filter, setFilter] = useState<Filter>("all");
  const agents = station.data?.agents ?? [];
  const roomName = (roomId: string) => dashboard.rooms.find((r) => r.id === roomId)?.name ?? "";
  const nameOf = (agentId: string) => agents.find((a) => a.id === agentId)?.config.name ?? agentId;
  const working = dashboard.crew.filter((c) => c.status === "active").length;
  const idle = dashboard.crew.filter((c) => c.status === "idle").length;
  const shown: readonly SessionSummary[] =
    sessions.data?.filter((s) => filter === "all" || s.origin === "dispatch") ?? [];

  return (
    <div id={id} className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <Panel
        title={term("agents")}
        className="min-h-0 flex-1"
        titleAction={
          <button
            type="button"
            aria-expanded={true}
            aria-controls={id}
            aria-label={term("station.crew.collapse")}
            title={term("station.crew.collapse")}
            onClick={onCollapse}
            data-caret
            className="hidden size-5 cursor-pointer items-center justify-center border-2 border-transparent bg-transparent p-0 text-cyan hover:border-line-soft hover:text-fg-hi focus-visible:border-cyan desktop:inline-flex"
          >
            <span aria-hidden="true">◂</span>
          </button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ul
            aria-label={term("agents")}
            className="m-0 flex max-h-[40%] shrink-0 list-none flex-col gap-1.5 overflow-y-auto p-2.5"
          >
            {agents.map((a) => {
              const crew = dashboard.crew.find((c) => c.id === a.id);
              return (
                <li key={a.id}>
                  <CrewButton
                    agent={a}
                    crew={crew}
                    roomName={crew ? roomName(crew.roomId) : ""}
                    active={a.id === selectedAgent}
                    onPick={() => onPickAgent(a.id)}
                  />
                </li>
              );
            })}
          </ul>
          <p className="m-0 flex shrink-0 justify-between gap-2 border-line-faint border-y-2 px-2.5 py-1 font-display text-d6 uppercase">
            <span className="text-green">
              {termWith("station.crew.working", { count: String(working) })}
            </span>
            <span className="text-fg-mute">
              {termWith("station.crew.idle", { count: String(idle) })}
            </span>
          </p>
          <section
            aria-label={term("sessions")}
            className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <PanelLabel>{term("sessions")}</PanelLabel>
              <OutlineButton tone="green" className="px-1.75 py-1" onClick={onNew}>
                <span aria-hidden="true">+ </span>
                {term("station.sessions.new")}
              </OutlineButton>
            </div>
            <fieldset className="m-0 flex gap-1.5 border-0 p-0">
              <legend className="sr-only">{term("station.sessions.filter")}</legend>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  className={`flex-1 ${tabClass(filter === f, "map")}`}
                  onClick={() => setFilter(f)}
                >
                  {term(f === "all" ? "station.sessions.all" : "station.sessions.dispatched")}
                </button>
              ))}
            </fieldset>
            <ErrorNote error={sessions.error} />
            {sessions.data && shown.length === 0 ? (
              <p className="m-0 text-b17 text-fg-mute">
                {term(
                  filter === "all" ? "station.sessions.none" : "station.sessions.noneDispatched",
                )}
              </p>
            ) : null}
            <ul className="m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-y-auto p-0">
              {shown.map((s) => (
                <li key={s.id}>
                  <SessionButton
                    session={s}
                    agentName={nameOf(s.agentId)}
                    open={s.id === openSession}
                    compact
                    onOpen={() => onOpenSession(s.id)}
                    meta={
                      <>
                        <span className="text-amber">{nameOf(s.agentId)}</span>
                        {s.origin === "dispatch" ? (
                          <span className="text-cyan">
                            {term("station.sessions.dispatchedTag")}
                          </span>
                        ) : null}
                        <span aria-hidden="true">·</span>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Panel>
    </div>
  );
}
