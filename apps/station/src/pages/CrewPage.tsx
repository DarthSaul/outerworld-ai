import {
  lookFor,
  overseerFirst,
  type PropKind,
  type Room,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import {
  Checkbox,
  EmptyState,
  fieldClass,
  inputClass,
  OutlineButton,
  Panel,
  PanelLabel,
  roomColor,
  Sprite,
  stVar,
  Tag,
  tabClass,
} from "@darthsaul/outerworld-ai-ui";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AbilityLogo } from "../components/AbilityLogo.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatUsd } from "../components/format.js";
import { ScrollArea } from "../components/ScrollArea.js";
import {
  useAddProjectManager,
  useCreateAgent,
  useCreateRoom,
  useDeleteRoom,
  useSpend,
  useStationView,
  useUpdateRoom,
} from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";
import { AgentDetail } from "./AgentPage.js";

const PROPS: readonly PropKind[] = ["web", "files", "memory"];

interface CrewRow {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly approvalMode: string;
  /** The stored character id; `lookFor` resolves it or picks a default. */
  readonly look: string | undefined;
}

/**
 * One crew member in the crew screen's sidenav: character, name, and room (cut short with an
 * ellipsis when long); then, at the bottom, their tags (Overseer, Full power) and today's spend.
 * Opens their setup in the main panel.
 */
function CrewItem({
  row,
  roomName,
  color,
  spendUsd,
  current,
}: {
  readonly row: CrewRow;
  readonly roomName: string;
  readonly color: string;
  readonly spendUsd: number | undefined;
  readonly current: boolean;
}) {
  const tagged = row.role === "overseer" || row.approvalMode === "full";
  return (
    <li data-agent={row.id}>
      <Link
        to={`/crew/${row.id}`}
        aria-current={current ? "page" : undefined}
        className={`flex flex-col gap-1 border-2 px-2 py-1.5 text-fg no-underline ${current ? "border-cyan bg-active-bg" : "border-line-soft bg-well hover:bg-hover"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Sprite look={lookFor(row.id, row.look)} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span data-agent-name className="min-w-0 truncate text-b19 text-fg-chip uppercase">
              {row.name}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-b15 uppercase">
              <span aria-hidden="true" className="size-2 shrink-0" style={{ background: color }} />
              <span data-room-name className="min-w-0 truncate" style={{ color }} title={roomName}>
                {roomName}
              </span>
            </span>
          </span>
        </span>
        {/* The bottom row: tags on the left, today's spend on the right. */}
        {tagged || spendUsd ? (
          <span data-agent-foot className="flex min-w-0 flex-wrap items-center gap-1.5">
            {row.role === "overseer" ? <Tag tone="white">{term("overseer.role")}</Tag> : null}
            {row.approvalMode === "full" ? (
              <Tag tone="amber" data-flag="full-power">
                {term("approvalMode.full")}
              </Tag>
            ) : null}
            {spendUsd ? (
              <span className="ml-auto text-b15 text-fg-mute" data-agent-spend>
                {term("spend.today")} {formatUsd(spendUsd)}
              </span>
            ) : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * One room in the crew screen's sidenav: its color, sector, name, and how many crew it holds. A
 * long name wraps onto more lines rather than being cut short.
 */
function RoomItem({
  room,
  sector,
  color,
  crew,
  current,
}: {
  readonly room: Room;
  readonly sector: string;
  readonly color: string;
  readonly crew: number;
  readonly current: boolean;
}) {
  return (
    <li data-room-item={room.id}>
      <Link
        to={`/crew?listing=rooms&room=${encodeURIComponent(room.id)}`}
        aria-current={current ? "page" : undefined}
        className={`flex items-center gap-2.5 border-2 px-2.5 py-3 no-underline ${current ? "border-cyan bg-active-bg" : "border-line-soft bg-well hover:bg-hover"}`}
      >
        <span
          className="shrink-0 px-1 py-0.5 font-display text-d7 text-ink"
          style={{ background: color }}
        >
          {sector}
        </span>
        <span
          data-room-name
          className="min-w-0 flex-1 wrap-break-word text-b19 uppercase"
          style={{ color }}
        >
          {room.name}
        </span>
        <span className="shrink-0 font-display text-d6 text-fg-mute uppercase">
          {termWith("scanner.roomCrew", { count: String(crew) })}
        </span>
      </Link>
    </li>
  );
}

/** Crew first, and the default; Rooms second (`?listing=rooms`). */
const LISTINGS = ["agents", "rooms"] as const;
type Listing = (typeof LISTINGS)[number];

function RoomSection({
  room,
  color,
  crew,
}: {
  readonly room: Room;
  /** The room's color on the map. */
  readonly color: string;
  readonly crew: readonly CrewRow[];
}) {
  const update = useUpdateRoom();
  const remove = useDeleteRoom();
  const spend = useSpend();
  const placed = new Set(room.props.map((p) => p.kind));
  const toggle = (kind: PropKind) =>
    update.mutate({
      id: room.id,
      input: {
        props: placed.has(kind)
          ? room.props.filter((p) => p.kind !== kind)
          : [...room.props, { kind }],
      },
    });
  const blocked = crew.length > 0;
  return (
    <div data-room={room.id} className="flex min-w-0">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: color }} />
            {room.name}
          </span>
        }
        className="flex-1"
        dense
        meta={
          <OutlineButton
            tone="line"
            disabled={blocked || remove.isPending}
            title={blocked ? term("room.delete.blocked") : undefined}
            onClick={() => remove.mutate(room.id)}
          >
            {term("room.delete")}
          </OutlineButton>
        }
      >
        <div className="flex flex-1 flex-col gap-3 p-3">
          {room.description ? (
            <p className="m-0 text-b18 text-fg-soft">{room.description}</p>
          ) : null}
          {/* One full-width row per prop, laid out like Config's connector grants. */}
          <section aria-label={term("grants")} className="flex flex-col gap-2">
            <PanelLabel>{term("grants")}</PanelLabel>
            <p className="m-0 text-b17 text-fg-soft">{term("room.props.hint")}</p>
            <ul data-room-props className="m-0 flex list-none flex-col gap-2 p-0">
              {PROPS.map((kind) => {
                const on = placed.has(kind);
                return (
                  <li
                    key={kind}
                    data-room-prop={kind}
                    data-placed={on}
                    className={`flex min-w-0 items-start gap-3 border-2 p-2.5 ${on ? "border-cyan bg-active-bg" : "border-line-faint bg-well"}`}
                  >
                    <AbilityLogo icon={kind} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-cyan text-d9 uppercase">
                          {term(`prop.${kind}`)}
                        </span>
                        <Tag>{term(`object.${kind}`)}</Tag>
                      </div>
                      <p className="m-0 text-b17 text-fg-soft">{term(`item.prop.${kind}.hint`)}</p>
                    </div>
                    <Checkbox
                      label={term("room.props.place")}
                      aria-label={termWith("room.props.placeName", { name: term(`prop.${kind}`) })}
                      checked={on}
                      disabled={update.isPending}
                      onChange={() => toggle(kind)}
                      className="shrink-0 self-center"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
          <ErrorNote error={update.error ?? remove.error} />
          <div className="flex flex-col gap-1.5">
            <PanelLabel>{term("scanner.crew")}</PanelLabel>
            {crew.length === 0 ? (
              <p className="m-0 text-b17 text-fg-mute">{term("room.crew.none")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {crew.map((a) => (
                  <li
                    key={a.id}
                    data-agent={a.id}
                    className="flex flex-wrap items-center gap-2 border-2 border-line-faint bg-well px-1.5 py-1"
                  >
                    <Sprite look={lookFor(a.id, a.look)} />
                    <Link to={`/crew/${a.id}`} className="text-b19 uppercase">
                      {a.name}
                    </Link>
                    {a.role === "overseer" ? <Tag tone="white">{term("overseer.role")}</Tag> : null}
                    {a.approvalMode === "full" ? (
                      <Tag tone="amber" data-flag="full-power">
                        {term("approvalMode.full")}
                      </Tag>
                    ) : null}
                    {spend.data?.agents[a.id] ? (
                      <span className="ml-auto text-b17 text-fg-mute" data-agent-spend>
                        {term("spend.today")} {formatUsd(spend.data.agents[a.id] ?? 0)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** A titled panel holding one add form: what it does, the fields in a row, then any error. */
function AddPanel({
  title,
  hint,
  onSubmit,
  children,
  after,
}: {
  readonly title: string;
  readonly hint: string;
  readonly onSubmit: (e: FormEvent) => void;
  readonly children: ReactNode;
  /** Below the form, inside the panel (the template shortcut). */
  readonly after?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col border-2 border-line bg-panel shadow-panel"
    >
      <h3
        id={titleId}
        className="m-0 border-line border-b-2 bg-panel-head px-2.5 py-2 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
      >
        {title}
      </h3>
      <div className="flex flex-col gap-3 p-3">
        <p className="m-0 text-b17 text-fg-soft">{hint}</p>
        <form aria-labelledby={titleId} onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">{children}</div>
        </form>
        {after}
      </div>
    </section>
  );
}

/**
 * The crew screen (`/crew`, `/crew/:id`): one panel laid out like COMMS. The sidenav lists crew or
 * rooms (Crew first, the default), each list with its Add button at the top; the main panel shows
 * the chosen crew member's setup (`/crew/:id`), the chosen room (`?listing=rooms&room=…`), or an
 * add form (`?add=agent`, `?listing=rooms&add=room`).
 */
export function CrewPage() {
  const { id } = useParams();
  const station = useStationView();
  const { dashboard } = useDashboard();
  const createAgent = useCreateAgent();
  const createRoom = useCreateRoom();
  const addPm = useAddProjectManager();
  const navigate = useNavigate();
  const client = useQueryClient();
  const spend = useSpend();
  const [params] = useSearchParams();
  const listing: Listing = !id && params.get("listing") === "rooms" ? "rooms" : "agents";
  const adding = params.get("add");
  const roomId = params.get("room");
  const [agentName, setAgentName] = useState("");
  const [agentRoom, setAgentRoom] = useState("");
  const [roomName, setRoomName] = useState("");

  if (station.isPending) return <p className="text-b19 text-fg-mute">{term("loading")}</p>;
  if (station.error) return <ErrorNote error={station.error} />;
  const view = station.data;
  if (!view.station) {
    return <EmptyState title={term("empty.station.title")} body={term("empty.station.body")} />;
  }
  const rooms = view.station.rooms;
  const roomForNew = agentRoom || rooms[0]?.id || "";
  const colorOf = (room: string) => {
    const mapped = dashboard?.rooms.find((r) => r.id === room);
    return mapped ? roomColor(mapped) : stVar("line");
  };
  const rowOf = (a: (typeof view.agents)[number]): CrewRow => ({
    id: a.id,
    name: a.config.name,
    role: a.config.role,
    approvalMode: a.config.approvalMode,
    look: a.config.look,
  });

  const addAgent = (e: FormEvent) => {
    e.preventDefault();
    createAgent.mutate(
      { name: agentName, roomId: roomForNew },
      {
        onSuccess: (agent) => {
          setAgentName("");
          void navigate(`/crew/${agent.id}`);
        },
      },
    );
  };
  const addRoom = (e: FormEvent) => {
    e.preventDefault();
    createRoom.mutate(
      { name: roomName },
      {
        onSuccess: async (room) => {
          setRoomName("");
          // Open it once the station includes it, so the main panel can show it.
          await client.invalidateQueries({ queryKey: ["station"] });
          void navigate(`/crew?listing=rooms&room=${encodeURIComponent(room.id)}`);
        },
      },
    );
  };
  const submit = (label: string, busy: boolean) => (
    <OutlineButton type="submit" tone="green" disabled={busy} className="h-9">
      {label}
    </OutlineButton>
  );

  let main: ReactNode;
  if (adding === "agent" && listing === "agents") {
    main = (
      <ScrollArea>
        <AddPanel
          title={term("agent.verb")}
          hint={term("agent.add.hint")}
          onSubmit={addAgent}
          after={
            <>
              <ErrorNote error={createAgent.error} />
              <div className="flex flex-wrap items-center gap-2 border-line-faint border-t-2 pt-3">
                <span className="text-b17 text-fg-mute">{term("template.hint")}</span>
                <OutlineButton
                  tone="cyan"
                  disabled={addPm.isPending}
                  onClick={() =>
                    addPm.mutate(undefined, {
                      onSuccess: (pm) => void navigate(`/crew/${pm.id}`),
                    })
                  }
                >
                  {term("template.projectManager")}
                </OutlineButton>
              </div>
              <ErrorNote error={addPm.error} />
            </>
          }
        >
          <label className={`${fieldClass} flex-1`}>
            {term("field.name")}
            <input
              className={inputClass}
              value={agentName}
              required
              onChange={(e) => setAgentName(e.target.value)}
            />
          </label>
          <label className={fieldClass}>
            {term("room")}
            <select
              className={inputClass}
              value={roomForNew}
              onChange={(e) => setAgentRoom(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {submit(term("agent.verb"), createAgent.isPending)}
        </AddPanel>
      </ScrollArea>
    );
  } else if (adding === "room" && listing === "rooms") {
    main = (
      <ScrollArea>
        <AddPanel
          title={term("room.verb")}
          hint={term("room.add.hint")}
          onSubmit={addRoom}
          after={<ErrorNote error={createRoom.error} />}
        >
          <label className={`${fieldClass} flex-1`}>
            {term("room.name")}
            <input
              className={inputClass}
              value={roomName}
              required
              onChange={(e) => setRoomName(e.target.value)}
            />
          </label>
          {submit(term("room.verb"), createRoom.isPending)}
        </AddPanel>
      </ScrollArea>
    );
  } else if (id) {
    main = <AgentDetail key={id} id={id} />;
  } else if (listing === "rooms" && roomId && rooms.some((r) => r.id === roomId)) {
    const room = rooms.find((r) => r.id === roomId) as Room;
    main = (
      <ScrollArea>
        <RoomSection
          room={room}
          color={colorOf(room.id)}
          crew={view.agents.filter((a) => a.config.roomId === room.id).map(rowOf)}
        />
      </ScrollArea>
    );
  } else {
    main =
      listing === "rooms" ? (
        <EmptyState title={term("crewPage.pickRoom.title")} body={term("crewPage.pickRoom.body")} />
      ) : view.agents.length === 0 ? (
        <EmptyState title={term("empty.crew.title")} body={term("empty.crew.body")} />
      ) : (
        <EmptyState
          title={term("crewPage.pickAgent.title")}
          body={term("crewPage.pickAgent.body")}
        />
      );
  }

  const crewItem = (a: (typeof view.agents)[number]) => (
    <CrewItem
      key={a.id}
      row={rowOf(a)}
      roomName={rooms.find((r) => r.id === a.config.roomId)?.name ?? a.config.roomId}
      color={colorOf(a.config.roomId)}
      spendUsd={spend.data?.agents[a.id]}
      current={a.id === id && !adding}
    />
  );
  const roomItem = (room: Room) => (
    <RoomItem
      key={room.id}
      room={room}
      sector={dashboard?.rooms.find((r) => r.id === room.id)?.sector ?? ""}
      color={colorOf(room.id)}
      crew={view.agents.filter((a) => a.config.roomId === room.id).length}
      current={room.id === roomId && !adding}
    />
  );
  // The Overseer heads the crew list, and Command (the Overseer's room) the rooms list, above
  // Add; everything else follows Add, below a thin rule.
  const crew = overseerFirst(view.agents);
  const overseers = crew.filter((a) => a.config.role === "overseer");
  const commandId = overseers[0]?.config.roomId;
  const head =
    listing === "agents"
      ? overseers.map(crewItem)
      : rooms.filter((r) => r.id === commandId).map(roomItem);
  const rest =
    listing === "agents"
      ? crew.filter((a) => !overseers.includes(a)).map(crewItem)
      : rooms.filter((r) => r.id !== commandId).map(roomItem);

  const listLink = (next: Listing) => (next === "agents" ? "/crew" : "/crew?listing=rooms");
  const addLink = listing === "agents" ? "/crew?add=agent" : "/crew?listing=rooms&add=room";
  const addCurrent = adding === (listing === "agents" ? "agent" : "room");

  return (
    <section
      aria-labelledby="screen-title"
      className="flex min-h-0 flex-1 flex-col border-2 border-line bg-panel shadow-panel"
    >
      {/* The title strip: the screen title on the left, the Crew / Rooms toggle on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-line border-b-2 bg-panel-head px-2.5 py-1.5">
        <h1
          id="screen-title"
          className="m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
        >
          {term("crewPage.rooms")}
        </h1>
        <fieldset className="m-0 flex gap-1.5 border-0 p-0">
          <legend className="sr-only">{term("crewPage.view")}</legend>
          {LISTINGS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={listing === v}
              className={tabClass(listing === v, "map")}
              onClick={() => void navigate(listLink(v))}
            >
              {term(v)}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-3 desktop:min-h-0 desktop:flex-row">
        <nav
          aria-label={term("crewPage.nav")}
          className="flex shrink-0 flex-col gap-2 desktop:min-h-0 desktop:w-60"
        >
          <h2 className="sr-only">{term("crewPage.nav")}</h2>
          {head.length > 0 ? (
            <>
              <ul
                {...{ [listing === "agents" ? "data-overseer-list" : "data-command-list"]: "" }}
                className="m-0 mr-1 flex list-none flex-col gap-1.5 p-0"
              >
                {head}
              </ul>
              <hr data-head-rule className="m-0 mr-1 border-0 border-line-faint border-t" />
            </>
          ) : null}
          {/* mr-1 matches the list's pr-1 (room for its scrollbar), so both are the same width. */}
          <Link
            to={addLink}
            aria-current={addCurrent ? "page" : undefined}
            className={`mr-1 block border-2 border-cyan px-2.25 py-2.5 text-center font-display text-d7 uppercase no-underline ${
              addCurrent ? "bg-cyan text-ink" : "bg-transparent text-cyan hover:bg-btn-hover"
            }`}
          >
            + {term(listing === "agents" ? "agent.verb" : "room.verb")}
          </Link>
          <ul
            data-listing={listing}
            className="m-0 flex list-none flex-col gap-1.5 overflow-y-auto overscroll-y-contain p-0 pr-1 desktop:min-h-0 desktop:flex-1"
          >
            {rest}
          </ul>
          {view.issues.length > 0 ? (
            <section aria-label={term("issues")} className="flex shrink-0 flex-col gap-1">
              <PanelLabel>{term("issues")}</PanelLabel>
              {view.issues.map((i) => (
                <p key={`${i.path}:${i.message}`} className="m-0 text-b17 text-red-text">
                  {i.level}: {i.path}: {i.message}
                </p>
              ))}
            </section>
          ) : null}
        </nav>
        <div data-crew-main className="flex min-w-0 flex-1 flex-col desktop:min-h-0">
          {main}
        </div>
      </div>
    </section>
  );
}
