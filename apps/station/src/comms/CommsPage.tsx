import { type DashboardCrew, lookFor, term, termWith } from "@darthsaul/outerworld-ai-core";
import {
  CREW_STATUS_TONE,
  EmptyState,
  lampBlink,
  OutlineButton,
  PanelLabel,
  roomColorVar,
  Sprite,
  stVar,
  toneVar,
} from "@darthsaul/outerworld-ai-ui";
import { type ReactNode, useId } from "react";
import { Link, useSearchParams } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatAgo, formatUsd } from "../components/format.js";
import { plainText } from "../components/Markdown.js";
import {
  type SessionSummary,
  useCreateSession,
  useSessions,
  useSpend,
  useStationView,
} from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";
import { ChatWindow } from "./ChatWindow.js";

/** At most this many chat windows side by side; opening another closes the oldest. */
const MAX_OPEN = 3;

export type AgentItem = NonNullable<ReturnType<typeof useStationView>["data"]>["agents"][number];

/** A status lamp in the crew member's status color; it blinks as the map's do. */
function Lamp({ crew }: { readonly crew: DashboardCrew | undefined }) {
  if (!crew) return null;
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 ${lampBlink(crew.status)}`}
      style={{ background: toneVar(CREW_STATUS_TONE[crew.status]) }}
    />
  );
}

/** One crew member in the picker: sprite, name, room, and live status. */
export function CrewButton({
  agent,
  crew,
  roomName,
  active,
  onPick,
}: {
  readonly agent: AgentItem;
  readonly crew: DashboardCrew | undefined;
  readonly roomName: string;
  readonly active: boolean;
  readonly onPick: () => void;
}) {
  const metaId = useId();
  const color = crew ? roomColorVar(crew.colorIndex) : stVar("line");
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={agent.config.name}
      aria-describedby={metaId}
      className={`flex w-full cursor-pointer items-center gap-2 border-2 py-1 pr-2 pl-1 text-left ${active ? "border-cyan bg-active-bg" : "border-line-soft bg-well hover:bg-hover"}`}
      onClick={onPick}
    >
      <Sprite look={lookFor(agent.id, agent.config.look)} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-body text-b19 text-fg-chip uppercase">
          {agent.config.name}
        </span>
        <span id={metaId} className="flex min-w-0 items-center gap-1.5 text-b15 text-fg-mute">
          <span className="truncate" style={{ color }}>
            {roomName}
          </span>
          {crew ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{term(`crewStatus.${crew.status}`)}</span>
            </>
          ) : null}
        </span>
      </span>
      <Lamp crew={crew} />
    </button>
  );
}

/** A labelled fact in the profile: ROLE, MODEL, … */
function Fact({
  label,
  wide = false,
  children,
}: {
  readonly label: string;
  /** Spans both columns (the model id is long). */
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="font-display text-d6 text-fg-mute uppercase">{label}</dt>
      <dd className="m-0 truncate text-b17 text-fg">{children}</dd>
    </div>
  );
}

/** Who you are talking to: portrait, room, role, model, approval mode, status, and spend. */
function Profile({
  agent,
  crew,
  roomName,
}: {
  readonly agent: AgentItem;
  readonly crew: DashboardCrew | undefined;
  readonly roomName: string;
}) {
  const spend = useSpend();
  const color = crew ? roomColorVar(crew.colorIndex) : stVar("line");
  const { config } = agent;
  return (
    <section
      aria-label={termWith("comms.profile", { name: config.name })}
      data-profile={agent.id}
      className="flex shrink-0 flex-col gap-2 border-2 border-line-soft bg-well p-2"
    >
      <div className="flex items-center gap-2">
        <Sprite look={lookFor(agent.id, config.look)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 truncate font-display font-normal text-d9 text-title uppercase">
            {config.name}
          </h2>
          <span className="truncate text-b15 uppercase" style={{ color }}>
            {roomName}
          </span>
        </div>
        <Link to={`/crew/${agent.id}`} className="shrink-0 self-start text-b15 text-cyan">
          {term("comms.profile.open")} →
        </Link>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Fact label={term("comms.profile.role")}>
          {config.role === "overseer" ? term("overseer.role") : term("agent")}
        </Fact>
        <Fact label={term("comms.profile.status")}>
          <span aria-live="polite" aria-atomic="true" className="flex items-center gap-1.5">
            <Lamp crew={crew} />
            {crew ? term(`crewStatus.${crew.status}`) : "—"}
          </span>
        </Fact>
        <Fact label={term("comms.profile.approval")}>
          <span className={config.approvalMode === "full" ? "text-amber" : ""}>
            {term(`approvalMode.${config.approvalMode}`)}
          </span>
        </Fact>
        <Fact label={term("comms.profile.spend")}>
          {spend.data ? formatUsd(spend.data.agents[agent.id] ?? 0) : "—"}
        </Fact>
        <Fact label={term("comms.profile.model")} wide>
          <span title={config.model}>{config.model}</span>
        </Fact>
      </dl>
      {crew?.detail ? <p className="m-0 text-b15 text-red-text">{crew.detail}</p> : null}
    </section>
  );
}

/**
 * A session in the list: title, when it last spoke, how much, the last line, and a work lamp.
 * `compact` keeps the last line to one line (the Station's crew comms).
 */
export function SessionButton({
  session,
  agentName,
  open,
  onOpen,
  compact = false,
}: {
  readonly session: SessionSummary;
  readonly agentName: string;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly compact?: boolean;
}) {
  const titleId = useId();
  const metaId = useId();
  const when = session.lastMessageAt ?? session.createdAt;
  const count =
    session.messageCount === 1
      ? term("comms.session.message")
      : termWith("comms.session.messages", { n: String(session.messageCount) });
  return (
    <button
      type="button"
      aria-labelledby={titleId}
      aria-describedby={metaId}
      aria-current={open ? "true" : undefined}
      data-session={session.id}
      className="flex w-full min-w-0 cursor-pointer flex-col gap-1 border-2 border-line-faint bg-transparent px-2 py-1.5 text-left hover:border-cyan aria-[current=true]:border-cyan aria-[current=true]:bg-active-bg"
      onClick={onOpen}
    >
      <span className="flex w-full items-baseline gap-2">
        <span id={titleId} className="min-w-0 flex-1 truncate text-b18 text-fg-hi">
          {session.title}
        </span>
        <time
          dateTime={when}
          title={new Date(when).toLocaleString()}
          className="shrink-0 text-b15 text-fg-mute"
        >
          {formatAgo(when)}
        </time>
      </span>
      <span id={metaId} className="flex w-full flex-col gap-0.5">
        <span
          className={`${compact ? "line-clamp-1" : "line-clamp-2"} text-b15 text-fg-soft [overflow-wrap:anywhere]`}
        >
          {session.lastMessage ? (
            <>
              <span className="text-fg-mute">
                {session.lastMessage.role === "user" ? term("comms.session.you") : agentName}:
              </span>{" "}
              {plainText(session.lastMessage.text)}
            </>
          ) : (
            term("comms.session.empty")
          )}
        </span>
        <span className="flex items-center gap-1.5 font-display text-d6 text-fg-mute uppercase">
          {count}
          {session.active ? (
            <span className="flex items-center gap-1 text-green">
              <span aria-hidden="true" className="st-blink size-1.5 bg-green" />
              {term("comms.session.working")}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/**
 * COMMS: pick a crew member, see who they are, open or start sessions, and talk. Several chat
 * windows can be open at once; the selection lives in the URL (`?agent=…&open=a,b`) so it
 * survives a reload. Sessions are listed most recently active first, each with its last line.
 */
export function CommsPage() {
  const [params, setParams] = useSearchParams();
  const station = useStationView();
  const { dashboard } = useDashboard();
  const agentId = params.get("agent") ?? undefined;
  const open = (params.get("open") ?? "").split(",").filter(Boolean);
  const sessions = useSessions(agentId);
  const create = useCreateSession();

  const update = (next: { agent?: string; open?: string[] }) => {
    const p = new URLSearchParams(params);
    if (next.agent !== undefined) p.set("agent", next.agent);
    if (next.open !== undefined) {
      if (next.open.length) p.set("open", next.open.join(","));
      else p.delete("open");
    }
    setParams(p);
  };
  const openSession = (id: string) => {
    if (open.includes(id)) return;
    update({ open: [...open, id].slice(-MAX_OPEN) });
  };
  const roomName = (id: string) =>
    station.data?.station?.rooms.find((r) => r.id === id)?.name ?? id;
  const crewOf = (id: string) => dashboard?.crew.find((c) => c.id === id);
  const agents = station.data?.agents ?? [];
  const selected = agents.find((a) => a.id === agentId);

  return (
    <section
      aria-labelledby="screen-title"
      className="flex min-h-0 flex-1 flex-col border-2 border-line bg-panel shadow-panel"
    >
      <h1
        id="screen-title"
        className="m-0 border-line border-b-2 bg-panel-head px-2.5 py-2 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
      >
        {term("comms")}
      </h1>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 p-3 desktop:flex-row">
        {/* One column: the crew (scrolls), who is chosen, then their sessions (scrolls). */}
        <div className="flex shrink-0 flex-col gap-3 desktop:min-h-0 desktop:w-80">
          <nav aria-label={term("agents")} className="flex min-h-0 shrink-0 flex-col gap-2">
            <h2 className="m-0 font-display font-normal text-d7 text-fg-mute uppercase">
              {term("agents")}
            </h2>
            <ul
              data-crew-list
              className="m-0 flex max-h-[26dvh] list-none flex-col gap-1.5 overflow-y-auto overscroll-y-contain p-0 pr-1"
            >
              {agents.map((a) => (
                <li key={a.id}>
                  <CrewButton
                    agent={a}
                    crew={crewOf(a.id)}
                    roomName={roomName(a.config.roomId)}
                    active={a.id === agentId}
                    onPick={() => update({ agent: a.id })}
                  />
                </li>
              ))}
            </ul>
          </nav>
          {selected ? (
            <>
              <Profile
                agent={selected}
                crew={crewOf(selected.id)}
                roomName={roomName(selected.config.roomId)}
              />
              <section
                aria-label={term("comms.sessions")}
                className="flex min-h-0 flex-1 flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <PanelLabel>
                    {term("comms.sessions")}
                    {sessions.data ? ` · ${sessions.data.length}` : ""}
                  </PanelLabel>
                  <OutlineButton
                    tone="green"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate(selected.id, { onSuccess: (s) => openSession(s.id) })
                    }
                  >
                    {term("comms.new")}
                  </OutlineButton>
                </div>
                <ErrorNote error={create.error ?? sessions.error} />
                {sessions.data?.length === 0 ? (
                  <p className="m-0 text-b17 text-fg-mute">{term("comms.none.body")}</p>
                ) : null}
                <ul
                  data-session-list
                  className="m-0 flex max-h-[40dvh] min-h-0 list-none flex-col gap-1.5 overflow-y-auto overscroll-y-contain p-0 pr-1 desktop:max-h-none desktop:flex-1"
                >
                  {sessions.data?.map((s) => (
                    <li key={s.id}>
                      <SessionButton
                        session={s}
                        agentName={selected.config.name}
                        open={open.includes(s.id)}
                        onOpen={() => openSession(s.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </div>
        {/* The conversation side: a header level with the crew list's, then the open windows
            (or what to do next), the full width of the column. */}
        <section
          aria-labelledby="comms-session-title"
          className="flex min-w-0 flex-1 flex-col gap-2 desktop:min-h-0"
        >
          <h2
            id="comms-session-title"
            className="m-0 font-display font-normal text-d7 text-fg-mute uppercase"
          >
            {term("comms.session.heading")}
          </h2>
          {open.length === 0 ? (
            selected ? (
              <EmptyState
                title={term("comms.pickSession.title")}
                body={term("comms.pickSession.body")}
              />
            ) : (
              <EmptyState title={term("comms.pick.title")} body={term("comms.pick.body")} />
            )
          ) : (
            <div className="flex min-w-0 flex-col gap-3.5 desktop:min-h-0 desktop:flex-1 desktop:flex-row desktop:items-stretch">
              {open.map((id) => (
                <ChatWindow
                  key={id}
                  sessionId={id}
                  onClose={() => update({ open: open.filter((o) => o !== id) })}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
