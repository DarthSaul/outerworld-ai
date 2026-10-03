import { type Dashboard, term, termWith } from "@darthsaul/outerworld-ai-core";
import { roomColorVar, stVar } from "../tokens/tokens.js";
import { Avatar } from "./Avatar.js";
import type { DashboardSelection } from "./DashboardMap.js";
import { Panel } from "./Panel.js";
import { CREW_STATUS_TONE, toneVar } from "./tone.js";

export interface CrewRosterProps {
  readonly dashboard: Dashboard;
  readonly selection?: DashboardSelection;
  readonly onSelectAgent?: (id: string) => void;
  readonly className?: string;
}

/**
 * Column 1: every crew member but the Overseer ("N + OV"), with room and status. No fuel bar:
 * budgets are per agent per day in dollars, not a token tank (ADR-0013 #2).
 */
export function CrewRoster({
  dashboard,
  selection,
  onSelectAgent,
  className = "",
}: CrewRosterProps) {
  const crew = dashboard.crew.filter((c) => !c.overseer);
  const roomName = (id: string) => dashboard.rooms.find((r) => r.id === id)?.name ?? id;
  return (
    <Panel
      title={term("roster.title")}
      meta={termWith("roster.meta", { crew: String(crew.length) })}
      className={className}
    >
      <ul className="m-0 flex list-none flex-col p-1.5">
        {crew.map((c) => {
          const selected = selection?.type === "agent" && selection.id === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectAgent?.(c.id)}
                className={`grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 border-2 bg-transparent p-1.5 text-left hover:bg-hover ${selected ? "border-cyan" : "border-transparent"}`}
              >
                <Avatar
                  name={c.name}
                  color={
                    c.roomId === dashboard.bridgeId ? stVar("cyan") : roomColorVar(c.colorIndex)
                  }
                  size={30}
                />
                <span className="truncate text-b19 text-fg-hi">
                  <span className="uppercase">{c.name}</span>{" "}
                  <span className="text-b16 text-fg-mute">{roomName(c.roomId)}</span>
                </span>
                <span
                  className="font-display text-d7 uppercase"
                  style={{ color: toneVar(CREW_STATUS_TONE[c.status]) }}
                >
                  {term(`crewStatus.${c.status}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
