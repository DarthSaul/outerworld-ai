import { type Dashboard, term, termWith } from "@darthsaul/outerworld-ai-core";
import {
  DashboardMap,
  type DashboardSelection,
  FolderTab,
  MAP_STYLES,
  OutlineButton,
  ResizeHandle,
  Scanner,
  tabClass,
} from "@darthsaul/outerworld-ai-ui";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { CommsPanel } from "../comms/CommsPanel.js";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  useActivity,
  useAllSessions,
  useCancelRun,
  useCreateLane,
  useDeleteLane,
  useKillSwitch,
} from "../queries.js";
import { CrewPanel } from "../station/CrewPanel.js";
import {
  DEFAULT_SIDE,
  percentOf,
  resizeSide,
  SIDE_LIMITS,
  splitTemplate,
  useSplit,
} from "../station/split.js";
import { useComms } from "../station/use-comms.js";
import { useDashboard, useMapStyle, usePreference } from "../station/use-dashboard.js";

const CREW_ID = "station-crew";

const STYLE_LABEL = {
  schematic: "mapStyle.schematic",
  floorplan: "mapStyle.floorplan",
  polygon: "mapStyle.polygon",
} as const;

/** Falls back to the Bridge (or the first room) when nothing, or something gone, is selected. */
function current(d: Dashboard, s: DashboardSelection | undefined): DashboardSelection | undefined {
  const exists =
    s &&
    ((s.type === "room" && d.rooms.some((r) => r.id === s.id)) ||
      (s.type === "agent" && d.crew.some((c) => c.id === s.id)) ||
      (s.type === "lane" && d.lanes.some((l) => l.id === s.id)));
  if (exists) return s;
  const first = d.bridgeId ?? d.rooms[0]?.id;
  return first ? { type: "room", id: first } : undefined;
}

const SESSION_KEY = "outerworld.commsSession";
/** Where the open order was kept before the three columns (ADR-0018); read once, as a fallback. */
const OLD_SESSION_KEY = "outerworld.overseerOrder";

function readSession(): string | undefined {
  try {
    const old = localStorage.getItem(OLD_SESSION_KEY);
    if (old !== null) {
      // Moved once to the new key, so the old one never overrides a later choice.
      localStorage.removeItem(OLD_SESSION_KEY);
      if (localStorage.getItem(SESSION_KEY) === null) localStorage.setItem(SESSION_KEY, old);
    }
    return localStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeSession(sessionId: string | undefined): void {
  try {
    if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be blocked (private windows); the conversation stays open until the tab closes.
  }
}

/**
 * The open conversation, kept per browser, but only while its session still exists and is not
 * archived. One just started here is trusted before the list has been refetched to include it.
 */
function useOpenSession(): [
  string | undefined,
  (id: string | undefined) => void,
  (id: string) => void,
] {
  const sessions = useAllSessions();
  const [open, setOpenState] = useState(readSession);
  const [started, setStarted] = useState<string>();
  const setOpen = (id: string | undefined) => {
    setOpenState(id);
    storeSession(id);
  };
  // Trusted only until the list includes it: from then on the list alone decides (archived, gone).
  const startedListed =
    started !== undefined && (sessions.data?.some((s) => s.id === started) ?? false);
  useEffect(() => {
    if (startedListed) setStarted(undefined);
  }, [startedListed]);
  const listed = sessions.data?.some((s) => s.id === open) ?? false;
  const live = open !== undefined && (listed || open === started || sessions.data === undefined);
  return [
    live ? open : undefined,
    setOpen,
    (id) => {
      setStarted(id);
      setOpen(id);
    },
  ];
}

/**
 * The Station (ADR-0013, ADR-0018): crew and every session, the station map, and one conversation
 * over the scanner, every piece a projection of runtime state. Drawing a hallway opens one in
 * station.json.
 */
export function StationPage() {
  const { dashboard, proposals, error } = useDashboard();
  const comms = useComms(dashboard, proposals);
  const activity = useActivity();
  const kill = useKillSwitch();
  const createLane = useCreateLane();
  const deleteLane = useDeleteLane();
  const cancelRun = useCancelRun();
  const [mapStyle, setMapStyle] = useMapStyle();
  const [picked, setPicked] = useState<DashboardSelection>();
  const [draw, setDraw] = useState<{ from: string | null }>();
  const [note, setNote] = useState<string>();
  const [side, setSide] = useSplit();
  const [session, setSession, startedSession] = useOpenSession();
  const [expanded, setExpanded] = useState(false);
  // Folded or open, per viewer (ADR-0013 #19, like the map style). The scanner starts folded.
  const [scanner, setScanner] = usePreference<"open" | "closed">(
    "outerworld.scanner",
    ["open", "closed"],
    "closed",
  );
  const [crewColumn, setCrewColumn] = usePreference<"open" | "closed">(
    "outerworld.crewColumn",
    ["open", "closed"],
    "open",
  );
  const grid = useRef<HTMLDivElement>(null);

  if (!dashboard) return <ErrorNote error={error} />;
  const selection = current(dashboard, picked);
  const roomName = (id: string) => dashboard.rooms.find((r) => r.id === id)?.name ?? id;

  const clickRoom = (id: string) => {
    setNote(undefined);
    if (!draw) return setPicked({ type: "room", id });
    if (!draw.from) return setDraw({ from: id });
    if (draw.from === id) return setDraw({ from: null });
    const from = draw.from;
    setDraw(undefined);
    const linked = dashboard.lanes.some(
      (l) => (l.from === from && l.to === id) || (l.from === id && l.to === from),
    );
    if (linked) {
      setNote(termWith("map.alreadyLinked", { from: roomName(from), to: roomName(id) }));
      return;
    }
    createLane.mutate(
      {
        from,
        to: id,
        note: termWith("map.laneNote", { from: roomName(from), to: roomName(id) }),
      },
      { onSuccess: (lane) => setPicked({ type: "lane", id: lane.id }) },
    );
  };

  const stopRuns = (agentId: string) => {
    for (const run of activity.data?.runs ?? []) {
      if (run.agentId === agentId) cancelRun.mutate(run.id);
    }
  };

  const paused = kill.data?.engaged ?? false;
  const mapControls = (
    <div className="flex flex-wrap items-center gap-1.5">
      {MAP_STYLES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === mapStyle}
          className={tabClass(s === mapStyle, "map")}
          onClick={() => setMapStyle(s)}
        >
          {term(STYLE_LABEL[s])}
        </button>
      ))}
      <span aria-hidden="true" className="h-5 w-0.5 bg-line" />
      <OutlineButton
        tone="amber"
        filled={draw !== undefined}
        aria-pressed={draw !== undefined}
        className="px-2 py-1.25"
        onClick={() => {
          setNote(undefined);
          setDraw(draw ? undefined : { from: null });
        }}
      >
        {term(draw ? "map.drawCancel" : "map.draw")}
      </OutlineButton>
    </div>
  );

  const crewOpen = crewColumn === "open";
  // Expanded, comms is the only column; the others stay mounted, hidden, so they keep their place.
  const desktopHidden = expanded ? "desktop:hidden" : "";
  // Desktop: crew (or its folder tab), the map, the handle, and comms over the scanner, 1fr / 2fr
  // / 1fr by default; the handle resizes comms against the map, kept per viewer. Phones stack
  // the map, crew, comms, then the scanner.
  return (
    <div
      ref={grid}
      style={
        {
          "--st-station-cols": splitTemplate(side, { crew: crewOpen, expanded }),
        } as CSSProperties
      }
      className="relative grid flex-1 grid-cols-1 items-stretch gap-3.5 py-3.5 desktop:min-h-0 desktop:grid-cols-(--st-station-cols) desktop:grid-rows-[minmax(0,1fr)] desktop:gap-0"
    >
      <h1 className="sr-only">{term("tab.station")}</h1>
      {crewOpen ? (
        <CrewPanel
          id={CREW_ID}
          dashboard={dashboard}
          {...(selection?.type === "agent" ? { selectedAgent: selection.id } : {})}
          onPickAgent={(id) => setPicked({ type: "agent", id })}
          {...(session ? { openSession: session } : {})}
          onOpenSession={setSession}
          onNew={() => setSession(undefined)}
          onCollapse={() => setCrewColumn("closed")}
          className={`desktop:mr-3.5 desktop:contain-size ${desktopHidden}`}
        />
      ) : (
        <>
          {/* Phones have no folder tab: there the crew column is always shown. */}
          <CrewPanel
            id={CREW_ID}
            dashboard={dashboard}
            {...(selection?.type === "agent" ? { selectedAgent: selection.id } : {})}
            onPickAgent={(id) => setPicked({ type: "agent", id })}
            {...(session ? { openSession: session } : {})}
            onOpenSession={setSession}
            onNew={() => setSession(undefined)}
            onCollapse={() => setCrewColumn("closed")}
            className="desktop:hidden"
          />
          {/* Desktop: the folded column's tab lies over the map's left edge, halfway down. It takes
              no column of its own. */}
          <div
            className={`absolute top-1/2 left-0 z-10 -translate-y-1/2 ${expanded ? "hidden" : "hidden desktop:flex"}`}
          >
            <FolderTab
              controls={CREW_ID}
              aria-label={term("station.crew.expand")}
              title={term("station.crew.expand")}
              onClick={() => setCrewColumn("open")}
            >
              {term("agents")}
            </FolderTab>
          </div>
        </>
      )}
      {/* Phones put the map first, then crew, comms, and the scanner. */}
      <div
        className={`order-first flex min-w-0 flex-col gap-3.5 desktop:order-none desktop:min-h-0 ${desktopHidden}`}
      >
        <section
          aria-labelledby="map-title"
          className="flex min-w-0 flex-1 flex-col border-2 border-line bg-panel shadow-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-line border-b-2 bg-panel-head px-2.5 py-1.5 font-display text-d9 text-panel-title uppercase tracking-st-1">
            <h2 id="map-title" className="m-0 font-normal text-inherit">
              {term("map.title")}
            </h2>
            {mapControls}
          </div>
          {note ? (
            <p role="status" className="m-0 px-2.5 py-1 text-b17 text-fg-mute">
              {note}
            </p>
          ) : null}
          <ErrorNote error={createLane.error ?? deleteLane.error ?? cancelRun.error} />
          <DashboardMap
            dashboard={dashboard}
            {...(selection ? { selection } : {})}
            mapStyle={mapStyle}
            {...(draw ? { drawFrom: draw.from } : {})}
            paused={paused}
            onSelectRoom={clickRoom}
            onSelectAgent={(id) => setPicked({ type: "agent", id })}
            onSelectLane={(id) => setPicked({ type: "lane", id })}
          />
        </section>
      </div>
      <ResizeHandle
        label={term("station.resize")}
        valueNow={percentOf(side)}
        valueMin={percentOf(SIDE_LIMITS.min)}
        valueMax={percentOf(SIDE_LIMITS.max)}
        onResize={(dx) => setSide(resizeSide(side, dx, grid.current?.clientWidth ?? 0))}
        onReset={() => setSide(DEFAULT_SIDE)}
        className={expanded ? "hidden" : "hidden desktop:block"}
      />
      {/* Comms fills the column over the scanner, which starts folded to its strip and opens to at
          most half the column. Neither sets the row's height (contain-size); each scrolls inside. */}
      <div className="flex min-w-0 flex-col gap-3.5 desktop:min-h-0 desktop:contain-size">
        <CommsPanel
          dashboard={dashboard}
          comms={comms}
          {...(session ? { sessionId: session } : {})}
          onStarted={(id) => {
            startedSession(id);
            if (dashboard.bridgeId) setPicked({ type: "room", id: dashboard.bridgeId });
          }}
          expanded={expanded}
          onToggleExpanded={() => setExpanded(!expanded)}
          className="min-h-0 flex-1"
        />
        {selection ? (
          <Scanner
            dashboard={dashboard}
            selection={selection}
            onSelect={setPicked}
            collapsed={scanner === "closed"}
            onToggleCollapsed={() => setScanner(scanner === "closed" ? "open" : "closed")}
            className={`min-w-0 shrink-0 ${scanner === "closed" ? "" : "min-h-0 desktop:max-h-1/2"}`}
            onStopRun={stopRuns}
            onDemolish={(id) =>
              deleteLane.mutate(id, {
                onSuccess: () =>
                  setPicked(
                    dashboard.bridgeId ? { type: "room", id: dashboard.bridgeId } : undefined,
                  ),
              })
            }
            busy={deleteLane.isPending || cancelRun.isPending}
          />
        ) : null}
      </div>
    </div>
  );
}
