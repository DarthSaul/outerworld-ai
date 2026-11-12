import {
  type Dashboard,
  type DashboardCrew,
  type DashboardMission,
  type DashboardRoom,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { stVar } from "../tokens/tokens.js";
import { Diamond, OutlineButton, tabClass } from "./buttons.js";
import { crewOptionGroups } from "./crew-options.js";
import { type DashboardSelection, grantName, roomColor } from "./DashboardMap.js";
import { Dropdown, type DropdownGroup } from "./Dropdown.js";
import { Panel, PanelLabel } from "./Panel.js";
import { SegmentBar } from "./SegmentBar.js";
import { Sprite } from "./Sprite.js";
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
  /** Folded to its title strip: no picker, no body, no Crew / Rooms toggle. */
  readonly collapsed?: boolean;
  /** Shows a caret beside the title that folds and unfolds the scanner. */
  readonly onToggleCollapsed?: () => void;
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
      <button type="button" className={rowButton} onClick={onSelect} data-crew={member.id}>
        <Sprite look={member.look} />
        <span
          className="flex-1 uppercase"
          style={{ color: member.overseer ? stVar("white") : color }}
        >
          {member.name}
        </span>
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
        {/* The crew member's own character, standing on its own (no lettered badge). */}
        <span data-look={member.look} className="flex shrink-0">
          <Sprite look={member.look} scale={2} />
        </span>
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

/** One picker row: its label (with a count) and the dropdown, on the pickers' shared grid. */
function PickerRow({
  label,
  value,
  placeholder,
  groups,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly groups: readonly DropdownGroup[];
  readonly onChange: (value: string) => void;
}) {
  const labelId = useId();
  return (
    <>
      <span id={labelId} className="font-display text-d7 text-fg-mute uppercase">
        {label}
      </span>
      <Dropdown
        labelledBy={labelId}
        value={value}
        placeholder={placeholder}
        groups={groups}
        onChange={onChange}
      />
    </>
  );
}

/** What the scanner's picker shows: the crew dropdown or the rooms dropdown. */
type PickerView = "crew" | "rooms";
const PICKER_VIEWS: readonly PickerView[] = ["crew", "rooms"];

/**
 * The picker at the top of the scanner: the dropdown for the list the title strip's Crew / Rooms
 * toggle shows (Crew first, and the default): crew grouped by room with character and status, or rooms with sector,
 * color, and crew count. Picking scans it. Selecting a room or a crew member elsewhere (the map)
 * turns the toggle to match, so the dropdown always names what is being scanned.
 */
function Pickers({ props, view }: { readonly props: ScannerProps; readonly view: PickerView }) {
  const { dashboard, selection, onSelect } = props;
  const crewGroups = crewOptionGroups(dashboard);
  const roomGroups = [
    {
      id: "rooms",
      label: "",
      options: dashboard.rooms.map((room) => {
        const color = roomColor(room);
        const crew = termWith("scanner.roomCrew", { count: String(room.crew.length) });
        return {
          value: room.id,
          text: `${room.name} · ${room.sector} · ${crew}`,
          label: (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="shrink-0 px-1 py-0.5 font-display text-d7 text-ink"
                style={{ background: color }}
              >
                {room.sector}
              </span>
              <span className="min-w-0 flex-1 truncate uppercase" style={{ color }}>
                {room.name}
              </span>
              <span className="shrink-0 font-display text-d7 text-fg-mute uppercase">{crew}</span>
            </span>
          ),
        };
      }),
    },
  ];
  const showCrew = view === "crew" && dashboard.crew.length > 0;
  return (
    <div className="border-line-faint border-b-2 px-3 py-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5">
        {showCrew ? (
          <PickerRow
            label={termWith("scanner.crewCount", { count: String(dashboard.crew.length) })}
            value={selection.type === "agent" ? selection.id : ""}
            placeholder={term("scanner.crewPick")}
            groups={crewGroups}
            onChange={(id) => onSelect({ type: "agent", id })}
          />
        ) : (
          <PickerRow
            label={termWith("scanner.roomCount", { count: String(dashboard.rooms.length) })}
            value={selection.type === "room" ? selection.id : ""}
            placeholder={term("scanner.roomPick")}
            groups={roomGroups}
            onChange={(id) => onSelect({ type: "room", id })}
          />
        )}
      </div>
    </div>
  );
}

/** Beside the map, below comms: pick a crew member, or what is selected on the map, in detail. */
export function Scanner(props: ScannerProps) {
  const { dashboard, selection, collapsed = false, onToggleCollapsed, className = "" } = props;
  const bodyId = useId();
  const [view, setView] = useState<PickerView>("crew");
  const first = useRef(true);
  // Any new selection (another room, too) turns the toggle to its list.
  const selected = `${selection.type}:${selection.id}`;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (selected.startsWith("agent:")) setView("crew");
    else if (selected.startsWith("room:")) setView("rooms");
  }, [selected]);
  const pickers = dashboard.rooms.length > 0 && !collapsed;
  // The Crew / Rooms toggle sits in the title strip, where the scanned kind used to be.
  const toggle = pickers ? (
    <fieldset className="m-0 flex gap-1.5 border-0 p-0">
      <legend className="sr-only">{term("scanner.view")}</legend>
      {PICKER_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          className={tabClass(view === v, "map")}
          onClick={() => setView(v)}
        >
          {term(v === "crew" ? "agents" : "rooms")}
        </button>
      ))}
    </fieldset>
  ) : undefined;
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
    <Panel
      title={term("scanner.title")}
      titleAction={
        onToggleCollapsed ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={term(collapsed ? "scanner.expand" : "scanner.collapse")}
            title={term(collapsed ? "scanner.expand" : "scanner.collapse")}
            onClick={onToggleCollapsed}
            data-caret
            className="inline-flex size-5 cursor-pointer items-center justify-center border-2 border-transparent bg-transparent p-0 text-cyan hover:border-line-soft hover:text-fg-hi focus-visible:border-cyan"
          >
            {/* A pixel triangle: down while open, turned to point right while folded. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 5 3"
              shapeRendering="crispEdges"
              className={`h-1.5 w-2.5 fill-current ${collapsed ? "-rotate-90" : ""}`}
            >
              <rect x="0" y="0" width="5" height="1" />
              <rect x="1" y="1" width="3" height="1" />
              <rect x="2" y="2" width="1" height="1" />
            </svg>
          </button>
        ) : undefined
      }
      meta={toggle}
      dense
      className={className}
    >
      <div id={bodyId} hidden={collapsed} className={collapsed ? "hidden" : "contents"}>
        {pickers ? <Pickers props={props} view={view} /> : null}
        <div data-scanner-body className="min-h-0 flex-1 overflow-y-auto">
          {body}
        </div>
      </div>
    </Panel>
  );
}
