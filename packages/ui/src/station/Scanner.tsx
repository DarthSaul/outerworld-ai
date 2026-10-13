import {
  type Dashboard,
  type DashboardCrew,
  type DashboardMission,
  type DashboardRoom,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import type { ReactNode } from "react";
import { stVar } from "../tokens/tokens.js";
import { Avatar } from "./Avatar.js";
import { Diamond, OutlineButton } from "./buttons.js";
import { type DashboardSelection, grantName, roomColor } from "./DashboardMap.js";
import { Panel, PanelLabel } from "./Panel.js";
import { SegmentBar } from "./SegmentBar.js";
import { CREW_STATUS_TONE, RUN_STATUS_TONE, toneVar } from "./tone.js";

export interface ScannerProps {
  readonly dashboard: Dashboard;
  readonly selection: DashboardSelection;
  readonly onSelect: (selection: DashboardSelection) => void;
  /** Cancel the crew member's live runs (STOP RUN, ADR-0013 #5). */
  readonly onStopRun?: (agentId: string) => void;
  /** Close a hallway (DEMOLISH, ADR-0013 #8). */
  readonly onDemolish?: (laneId: string) => void;
  /** An action is in flight; its buttons are disabled. */
  readonly busy?: boolean;
  readonly className?: string;
}

const LIVE = new Set(["running", "queued", "blocked"]);
const BRIDGE_MISSIONS = 6;
const ROOM_MISSIONS = 8;

function Section({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <PanelLabel>{label}</PanelLabel>
      {children}
    </div>
  );
}

const rowButton =
  "flex w-full cursor-pointer items-center gap-2 border border-line-faint bg-transparent p-1 text-left text-b19 text-fg hover:border-cyan";

function CrewRow({
  member,
  color,
  onSelect,
}: {
  readonly member: DashboardCrew;
  readonly color: string;
  readonly onSelect: () => void;
}) {
  return (
    <li>
      <button type="button" className={rowButton} onClick={onSelect}>
        <Avatar name={member.name} color={member.overseer ? stVar("white") : color} />
        <span className="flex-1 uppercase">{member.name}</span>
        <span
          className="font-display text-d7 uppercase"
          style={{ color: toneVar(CREW_STATUS_TONE[member.status]) }}
        >
          {term(`crewStatus.${member.status}`)}
        </span>
      </button>
    </li>
  );
}

function MissionCard({
  mission,
  agentName,
  onSelect,
}: {
  readonly mission: DashboardMission;
  readonly agentName: string;
  readonly onSelect?: () => void;
}) {
  const color = toneVar(RUN_STATUS_TONE[mission.status]);
  const percent = mission.status === "done" ? 100 : mission.status === "queued" ? 0 : undefined;
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-b17">{mission.title}</span>
        <span className="shrink-0 font-display text-d7 uppercase" style={{ color }}>
          {term(`missionStatus.${mission.status}`)}
        </span>
      </span>
      <span className="flex justify-between gap-2 text-b15 text-fg-mute">
        <span className="uppercase">{agentName}</span>
        <span>{termWith("mission.step", { n: String(mission.steps) })}</span>
      </span>
      <SegmentBar
        color={color}
        active={mission.status === "running"}
        {...(percent === undefined ? {} : { percent })}
      />
    </>
  );
  const box = "flex w-full flex-col gap-1 border border-line-faint bg-well-2 px-2 py-1.5 text-left";
  return (
    <li>
      {onSelect ? (
        <button
          type="button"
          className={`${box} cursor-pointer text-fg hover:border-cyan`}
          onClick={onSelect}
        >
          {body}
        </button>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

function RoomScan({ room, props }: { readonly room: DashboardRoom; readonly props: ScannerProps }) {
  const { dashboard, onSelect } = props;
  const color = roomColor(room);
  const nameOf = (id: string) => dashboard.crew.find((c) => c.id === id)?.name ?? id;
  const roomName = (id: string) => dashboard.rooms.find((r) => r.id === id)?.name ?? id;
  const missions = room.bridge
    ? dashboard.missions.slice(0, BRIDGE_MISSIONS)
    : dashboard.missions.filter((m) => m.roomId === room.id).slice(0, ROOM_MISSIONS);
  const lanes = dashboard.lanes.filter((l) => l.from === room.id || l.to === room.id);
  const crew = room.bridge ? [...room.crew].sort((a) => (a.overseer ? -1 : 1)) : room.crew;
  return (
    <div className="flex flex-col gap-3.5 p-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className="px-1.25 py-1 font-display text-d8 text-ink"
            style={{ background: color }}
          >
            {room.sector}
          </span>
          <span className="font-display text-d10 uppercase" style={{ color }}>
            {room.name}
          </span>
        </div>
        {room.description ? <p className="m-0 text-b18 text-fg-soft">{room.description}</p> : null}
      </div>
      <Section label={term("scanner.crew")}>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {crew.map((c) => (
            <CrewRow
              key={c.id}
              member={c}
              color={color}
              onSelect={() => onSelect({ type: "agent", id: c.id })}
            />
          ))}
        </ul>
      </Section>
      {room.grants.length ? (
        <Section label={term("scanner.grants")}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {room.grants.map((g) => (
              <li
                key={g.key}
                className="grid grid-cols-[10px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 border border-dashed p-1.5"
                style={{ borderColor: color }}
              >
                <Diamond color={color} size={7} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-d7 uppercase" style={{ color }}>
                    {term(g.object)}
                  </span>
                  <span className="text-b17">
                    {grantName(g)} ·{" "}
                    <span className="text-fg-mute">{term(`grant.${g.scope}`)}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section label={term("scanner.lanes")}>
        {lanes.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {lanes.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={`${rowButton} px-1.5`}
                  onClick={() => onSelect({ type: "lane", id: l.id })}
                >
                  <span className="font-display text-d7 text-lane-auth">{l.label}</span>
                  <span className="flex-1 text-b17">
                    ⇄ {roomName(l.from === room.id ? l.to : l.from)}
                  </span>
                  <span className="font-display text-d7 text-lane-auth uppercase">
                    {term("lane.authorized")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-b17 text-fg-mute">{term("scanner.noLanes")}</p>
        )}
      </Section>
      <Section label={term(room.bridge ? "scanner.missions.bridge" : "scanner.missions")}>
        {missions.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {missions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                agentName={nameOf(m.agentId)}
                onSelect={() => onSelect({ type: "agent", id: m.agentId })}
              />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-b17 text-fg-mute">{term("scanner.noMissions")}</p>
        )}
      </Section>
    </div>
  );
}

function AgentScan({
  member,
  props,
}: {
  readonly member: DashboardCrew;
  readonly props: ScannerProps;
}) {
  const { dashboard, onSelect } = props;
  const room = dashboard.rooms.find((r) => r.id === member.roomId);
  const color = member.overseer ? stVar("white") : room ? roomColor(room) : stVar("cyan");
  const missions = dashboard.missions.filter((m) => m.agentId === member.id);
  const live = missions.some((m) => LIVE.has(m.status)) || member.status === "active";
  return (
    <div className="flex flex-col gap-3.5 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} color={color} size={52} ring={color} ringGap={stVar("room")} />
        <div className="flex flex-col gap-1">
          <span className="font-display text-d11 text-fg-hi uppercase">{member.name}</span>
          <span className="text-b18 text-fg-soft">
            {term(member.overseer ? "overseer.role" : "agent")} · {room?.name ?? member.roomId}
          </span>
          <span
            className="font-display text-d7 uppercase"
            style={{ color: toneVar(CREW_STATUS_TONE[member.status]) }}
          >
            {term(`crewStatus.${member.status}`)}
          </span>
        </div>
      </div>
      <Section label={term("scanner.taskLog")}>
        {missions.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {missions.map((m) => (
              <MissionCard key={m.id} mission={m} agentName={member.name} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-b17 text-fg-mute">{term("scanner.noMissions")}</p>
        )}
      </Section>
      {room?.grants.length ? (
        <Section label={term("scanner.canUse")}>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {room.grants.map((g) => (
              <li
                key={g.key}
                className="border border-dashed px-1.5 py-px text-b16"
                style={{ borderColor: color }}
              >
                {grantName(g)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {props.onStopRun ? (
          <OutlineButton
            tone="amber"
            disabled={!live || props.busy}
            onClick={() => props.onStopRun?.(member.id)}
          >
            {term("scanner.stopRun")}
          </OutlineButton>
        ) : null}
        {room ? (
          <OutlineButton tone="line" onClick={() => onSelect({ type: "room", id: room.id })}>
            {termWith("scanner.back", { room: room.name })}
          </OutlineButton>
        ) : null}
      </div>
    </div>
  );
}

function LaneScan({ laneId, props }: { readonly laneId: string; readonly props: ScannerProps }) {
  const { dashboard, onSelect } = props;
  const lane = dashboard.lanes.find((l) => l.id === laneId);
  if (!lane) return null;
  const from = dashboard.rooms.find((r) => r.id === lane.from);
  const to = dashboard.rooms.find((r) => r.id === lane.to);
  const traffic =
    lane.traffic === 0
      ? term("scanner.traffic.quiet")
      : lane.traffic === 1
        ? term("scanner.traffic.one")
        : termWith("scanner.traffic.many", { count: String(lane.traffic) });
  const end = (room: DashboardRoom | undefined, id: string) => (
    <button
      type="button"
      className="cursor-pointer bg-transparent p-0 text-b20 uppercase"
      style={{ color: room ? roomColor(room) : stVar("text") }}
      onClick={() => onSelect({ type: "room", id })}
    >
      {room?.name ?? id}
    </button>
  );
  return (
    <div className="flex flex-col gap-3.5 p-3">
      <div className="flex items-center gap-2">
        <span className="border-2 border-lane-auth px-1.5 py-1 font-display text-d9 text-lane-auth">
          {lane.label}
        </span>
        <span className="font-display text-d8 text-lane-auth uppercase">
          {term("lane.authorized")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {end(from, lane.from)}
        <span className="text-b20 text-fg-mute">⇄</span>
        {end(to, lane.to)}
      </div>
      <div className="flex flex-col gap-0.5">
        <PanelLabel>{term("scanner.carries")}</PanelLabel>
        <span className="text-b18">{lane.note ?? "—"}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <PanelLabel>{term("scanner.traffic")}</PanelLabel>
        <span className="text-b18">{traffic}</span>
      </div>
      {props.onDemolish ? (
        <div className="flex flex-wrap gap-2">
          <OutlineButton
            tone="line"
            className="py-2"
            disabled={props.busy}
            onClick={() => props.onDemolish?.(lane.id)}
          >
            {term("scanner.demolish")}
          </OutlineButton>
        </div>
      ) : null}
    </div>
  );
}

/** Column 3, below comms: what is selected on the map, in detail. */
export function Scanner(props: ScannerProps) {
  const { dashboard, selection, className = "" } = props;
  const kind = term(`scanner.kind.${selection.type}`);
  let body: ReactNode = null;
  if (selection.type === "room") {
    const room = dashboard.rooms.find((r) => r.id === selection.id);
    if (room) body = <RoomScan room={room} props={props} />;
  } else if (selection.type === "agent") {
    const member = dashboard.crew.find((c) => c.id === selection.id);
    if (member) body = <AgentScan member={member} props={props} />;
  } else {
    body = <LaneScan laneId={selection.id} props={props} />;
  }
  return (
    <Panel title={term("scanner.title")} meta={kind} className={className}>
      {body}
    </Panel>
  );
}
