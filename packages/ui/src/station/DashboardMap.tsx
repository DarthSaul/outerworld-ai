import {
  type Dashboard,
  type DashboardCrew,
  type DashboardGrant,
  type DashboardLane,
  type DashboardRoom,
  pointAlong,
  routeLength,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { type CSSProperties, useRef } from "react";
import { PACKET_SPEED, roomColorVar, stVar } from "../tokens/tokens.js";
import { Avatar, overseerAvatarProps } from "./Avatar.js";
import { Diamond } from "./buttons.js";
import { Sprite } from "./Sprite.js";
import { CREW_STATUS_TONE, lampBlink, toneVar } from "./tone.js";
import { useAnimationClock } from "./useClock.js";
import { useMapView, ZOOM_STEP } from "./useMapView.js";

export type MapStyle = "schematic" | "floorplan" | "polygon";
export const MAP_STYLES: readonly MapStyle[] = ["schematic", "floorplan", "polygon"];

/** What the scanner shows: a room, a crew member, or a hallway. */
export type DashboardSelection = {
  readonly type: "room" | "agent" | "lane";
  readonly id: string;
};

export interface DashboardMapProps {
  readonly dashboard: Dashboard;
  readonly selection?: DashboardSelection;
  readonly mapStyle?: MapStyle;
  /** Drawing a hallway: `null` before the first room is picked, its id after. Absent: not drawing. */
  readonly drawFrom?: string | null;
  /** The kill switch is on: packets hold, a scrim covers the map. */
  readonly paused?: boolean;
  readonly onSelectRoom?: (id: string) => void;
  readonly onSelectAgent?: (id: string) => void;
  readonly onSelectLane?: (id: string) => void;
}

const pct = (n: number) => `${n}%`;

export function roomColor(room: Pick<DashboardRoom, "bridge" | "colorIndex">): string {
  return room.bridge ? stVar("cyan") : roomColorVar(room.colorIndex);
}

export function grantName(grant: DashboardGrant): string {
  return "term" in grant.real ? term(grant.real.term) : grant.real.name;
}

/** Where in the stroll cycle a crew member starts (0–1), steady per id so it never jumps. */
export function walkPhase(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 997) / 997;
}

function CrewChip({
  member,
  color,
  selected,
  onSelect,
}: {
  readonly member: DashboardCrew;
  readonly color: string;
  readonly selected: boolean;
  readonly onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      aria-pressed={selected}
      aria-label={`${member.name}, ${term(`crewStatus.${member.status}`)}`}
      data-crew={member.id}
      className="pointer-events-auto relative z-10 flex cursor-pointer flex-col items-center gap-0.5 bg-transparent p-0"
    >
      {/* The character stands on its own, its status lamp at its shoulder; the name below. */}
      <span aria-hidden="true" data-look={member.look} className="relative inline-flex">
        <Sprite look={member.look} />
        <span
          className={`-right-1 absolute top-0 size-1.5 ${lampBlink(member.status)}`}
          style={{ background: toneVar(CREW_STATUS_TONE[member.status]) }}
        />
      </span>
      <span
        className={`max-w-24 truncate border-b-2 bg-chip-bg px-1 text-b15 uppercase ${selected ? "text-fg-hi" : "text-fg-chip"}`}
        style={{ borderColor: selected ? stVar("text-hi") : color }}
      >
        {member.name}
      </span>
    </button>
  );
}

function GrantChip({ grant, color }: { readonly grant: DashboardGrant; readonly color: string }) {
  return (
    <li
      title={term(grant.object)}
      className="flex items-center gap-1.25 border border-dashed bg-chip-bg px-1.25 py-px"
      style={{ borderColor: color }}
    >
      <Diamond color={color} />
      <span className="text-b14 text-fg-grant">{grantName(grant)}</span>
    </li>
  );
}

function Room({
  room,
  props,
  linking,
}: {
  readonly room: DashboardRoom;
  readonly props: DashboardMapProps;
  readonly linking: boolean;
}) {
  const color = roomColor(room);
  const { selection, onSelectRoom, onSelectAgent } = props;
  const drawing = props.drawFrom !== undefined;
  const selectedRoom =
    (selection?.type === "room" && selection.id === room.id) ||
    (selection?.type === "agent" && room.crew.some((c) => c.id === selection.id));
  const overseer = room.bridge ? room.crew.find((c) => c.overseer) : undefined;
  const crew = room.crew.filter((c) => c !== overseer);
  const style = {
    left: pct(room.rect.x),
    top: pct(room.rect.y),
    width: pct(room.rect.w),
    height: pct(room.rect.h),
    "--st-room-color": color,
  } as CSSProperties;
  return (
    <div
      className="st-map-room absolute flex flex-col gap-1.5 overflow-hidden p-1.5"
      style={style}
      data-room={room.id}
      {...(selectedRoom ? { "data-selected": "" } : {})}
      {...(linking ? { "data-linking": "" } : {})}
      {...(room.alert ? { "data-alert": "" } : {})}
      {...(room.bridge ? { "data-bridge": "" } : {})}
    >
      <button
        type="button"
        aria-label={`${room.bridge ? term("map.bridge") : room.sector} ${room.name}`}
        aria-pressed={selectedRoom}
        onClick={() => onSelectRoom?.(room.id)}
        className="absolute inset-0 cursor-pointer bg-transparent"
      />
      <span className="st-map-room-alert st-blink" aria-hidden="true" />
      {room.bridge ? (
        <div className="pointer-events-none relative flex flex-1 flex-col items-center justify-center gap-1.5">
          <span className="bg-chip-bg px-1 py-0.75 font-display text-d7 text-fg-quiet uppercase">
            {term("map.bridge")}
          </span>
          {overseer ? (
            <>
              <button
                type="button"
                aria-label={`${overseer.name}, ${term("overseer.role")}`}
                aria-pressed={selection?.type === "agent" && selection.id === overseer.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!drawing) onSelectAgent?.(overseer.id);
                }}
                className="pointer-events-auto z-10 cursor-pointer bg-transparent"
              >
                <Avatar
                  name={overseer.name}
                  look={overseer.look}
                  size={38}
                  {...overseerAvatarProps()}
                />
              </button>
              <span className="bg-chip-bg px-1 py-0.75 font-display text-d8 text-title uppercase">
                {overseer.name}
              </span>
            </>
          ) : null}
          {crew.length ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {crew.map((c) => (
                <CrewChip
                  key={c.id}
                  member={c}
                  color={color}
                  selected={selection?.type === "agent" && selection.id === c.id}
                  {...(drawing ? {} : { onSelect: () => onSelectAgent?.(c.id) })}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="pointer-events-none relative flex items-center gap-1.5">
            <span
              className="px-1 py-0.75 font-display text-d7 text-ink"
              style={{ background: color }}
            >
              {room.sector}
            </span>
            <span
              className="truncate bg-chip-bg px-1 py-0.75 font-display text-d7 uppercase"
              style={{ color }}
            >
              {room.name}
            </span>
            {room.alert ? (
              <span className="ml-auto bg-red-text px-1 py-0.75 font-display text-d6 text-ink uppercase">
                {term("map.alert")}
              </span>
            ) : null}
          </div>
          <div className="pointer-events-none relative flex flex-wrap gap-x-1.5 gap-y-1">
            {room.crew.map((c) => (
              <div key={c.id} className="st-walk-slot min-w-16 flex-1">
                <div
                  className="st-walker"
                  style={{ "--st-walk-phase": walkPhase(c.id) } as CSSProperties}
                >
                  <CrewChip
                    member={c}
                    color={color}
                    selected={selection?.type === "agent" && selection.id === c.id}
                    {...(drawing ? {} : { onSelect: () => onSelectAgent?.(c.id) })}
                  />
                </div>
              </div>
            ))}
          </div>
          <ul className="pointer-events-none relative mt-auto flex flex-wrap gap-1.25">
            {room.grants.map((g) => (
              <GrantChip key={g.key} grant={g} color={color} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Lane({
  lane,
  selected,
  name,
  onSelect,
}: {
  readonly lane: DashboardLane;
  readonly selected: boolean;
  readonly name: string;
  readonly onSelect?: () => void;
}) {
  const color = selected ? stVar("lane-selected") : "var(--st-map-lane-auth)";
  const segments = lane.route.slice(1).map((q, i) => {
    const p = lane.route[i] ?? q;
    const horizontal = p[1] === q[1];
    const style: CSSProperties = horizontal
      ? { left: pct(Math.min(p[0], q[0])), top: pct(p[1]), width: pct(Math.abs(q[0] - p[0])) }
      : { left: pct(p[0]), top: pct(Math.min(p[1], q[1])), height: pct(Math.abs(q[1] - p[1])) };
    return { key: `${i}`, horizontal, style };
  });
  return (
    <div className="contents" data-lane={lane.id}>
      {segments.map((s) => (
        <button
          key={s.key}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onSelect}
          className={`st-lane ${s.horizontal ? "st-lane-h" : "st-lane-v"}`}
          style={{ ...s.style, "--st-lane-color": color } as CSSProperties}
        />
      ))}
      {lane.tag ? (
        <button
          type="button"
          onClick={onSelect}
          aria-label={name}
          aria-pressed={selected}
          className="-translate-x-1/2 -translate-y-1/2 absolute z-10 cursor-pointer whitespace-nowrap border bg-map-bg px-1 py-0.5 font-display text-d6"
          style={{
            left: pct(lane.tag[0]),
            top: pct(lane.tag[1]),
            borderColor: color,
            color: selected ? color : "var(--st-map-lane-tag)",
          }}
        >
          {lane.label}
        </button>
      ) : null}
    </div>
  );
}

/** Packets on a hallway with traffic: up to two, every second one running the other way. */
function packetsFor(lane: DashboardLane, t: number): { id: string; left: string; top: string }[] {
  const count = Math.min(2, lane.traffic);
  const total = routeLength(lane.route);
  if (!count || !total) return [];
  const seed = (lane.label.charCodeAt(lane.label.length - 1) * 0.13) % 1;
  return Array.from({ length: count }, (_, k) => {
    let u = ((t * PACKET_SPEED) / total + k / count + seed) % 1;
    if (k % 2 === 1) u = 1 - u;
    const at = pointAlong(lane.route, u) ?? [0, 0];
    return { id: `${lane.id}:${k}`, left: pct(at[0]), top: pct(at[1]) };
  });
}

const viewButton =
  "cursor-pointer border-2 border-line-soft bg-chip-bg px-2 py-1 font-display text-d7 text-fg-chip uppercase hover:border-cyan hover:text-cyan disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The station map (ADR-0013): rooms placed around the Bridge, hallways between them, packets
 * where a dispatch is running, all from `Dashboard`. Three styles. The plane is never smaller
 * than --st-map-min-*: drag to pan it, zoom, or recenter to fit every room in view (ADR-0014).
 */
export function DashboardMap(props: DashboardMapProps) {
  const { dashboard, selection, mapStyle = "schematic", drawFrom, paused = false } = props;
  const t = useAnimationClock(!paused && dashboard.lanes.some((l) => l.traffic > 0));
  const roomName = (id: string) => dashboard.rooms.find((r) => r.id === id)?.name ?? id;
  const drawing = drawFrom !== undefined;
  const viewport = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const { view, dragging, recenter, zoom, handlers } = useMapView(viewport, plane);
  // Narrow screens: the viewport takes the plane's 860 × 580 shape, so the fitted map fills it.
  return (
    <div
      ref={viewport}
      data-map-style={mapStyle}
      data-map-viewport=""
      title={term("map.pan.hint")}
      className={`relative aspect-[43/29] w-full min-w-0 flex-1 desktop:aspect-auto desktop:min-h-0 touch-none select-none overflow-hidden ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ background: "var(--st-map-viewport-bg)" }}
      {...handlers}
    >
      <div
        ref={plane}
        className="st-map-plane"
        data-map-plane=""
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "var(--st-map-plane-bg)",
            transform: "var(--st-map-plane-transform)",
            transformOrigin: "50% 55%",
          }}
        >
          {dashboard.lanes.map((lane) => (
            <Lane
              key={lane.id}
              lane={lane}
              selected={selection?.type === "lane" && selection.id === lane.id}
              name={`${term("lane")} ${lane.label}: ${roomName(lane.from)} ⇄ ${roomName(lane.to)}`}
              {...(props.onSelectLane ? { onSelect: () => props.onSelectLane?.(lane.id) } : {})}
            />
          ))}
          {dashboard.lanes.flatMap((lane) => {
            const room = dashboard.rooms.find((r) => r.id === lane.packetRoom);
            const color = room ? roomColor(room) : stVar("cyan");
            return packetsFor(lane, t).map(({ id, ...p }) => (
              <span
                key={id}
                data-packet={lane.id}
                className="st-packet"
                style={{ ...p, "--st-packet-color": color } as CSSProperties}
              />
            ));
          })}
          {dashboard.rooms.map((room) => (
            <Room key={room.id} room={room} props={props} linking={drawFrom === room.id} />
          ))}
        </div>
      </div>
      {/* Presses here never start a drag. */}
      <div
        role="toolbar"
        aria-label={term("map.view")}
        className="absolute right-2.5 bottom-2.5 z-20 flex gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={viewButton}
          aria-label={term("map.zoomOut")}
          title={term("map.zoomOut")}
          onClick={() => zoom(1 / ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className={viewButton}
          aria-label={term("map.zoomIn")}
          title={term("map.zoomIn")}
          onClick={() => zoom(ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className={viewButton}
          title={term("map.recenter.hint")}
          onClick={recenter}
        >
          ⌖ {term("map.recenter")}
        </button>
      </div>
      {drawing ? (
        <div
          role="status"
          className="-translate-x-1/2 absolute top-2.5 left-1/2 z-20 whitespace-nowrap bg-amber px-2.5 py-1.5 font-display text-d8 text-ink uppercase"
        >
          {drawFrom
            ? termWith("map.drawSecond", { room: roomName(drawFrom) })
            : term("map.drawFirst")}
        </div>
      ) : null}
      {paused ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3.5 bg-scrim">
          <div className="st-map-scrim-title font-display text-d30 text-fg-hi uppercase tracking-st-4">
            {term("station.stopped.title")}
          </div>
          <div className="text-b20 text-fg-soft">{term("station.stopped.body")}</div>
        </div>
      ) : null}
    </div>
  );
}
