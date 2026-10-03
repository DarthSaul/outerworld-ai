import { type Dashboard, term, termWith } from "@darthsaul/outerworld-ai-core";
import {
  CrewRoster,
  DashboardMap,
  type DashboardSelection,
  MAP_STYLES,
  OutlineButton,
  OverseerComms,
  Scanner,
  tabClass,
} from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  useActivity,
  useCancelRun,
  useCreateLane,
  useDeleteLane,
  useKillSwitch,
} from "../queries.js";
import { useComms } from "../station/use-comms.js";
import { useDashboard, useMapStyle } from "../station/use-dashboard.js";

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

/**
 * The Station (ADR-0013): crew roster, the station map, Overseer comms and the scanner, every
 * piece a projection of runtime state. Drawing a hallway opens one in station.json.
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

  return (
    <div className="grid grid-cols-1 items-stretch gap-3.5 p-3.5 desktop:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,2fr)]">
      <h1 className="sr-only">{term("tab.station")}</h1>
      <div className="flex min-w-0 flex-col">
        <CrewRoster
          dashboard={dashboard}
          {...(selection ? { selection } : {})}
          onSelectAgent={(id) => setPicked({ type: "agent", id })}
          className="flex-1"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">
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
      <div className="flex min-w-0 flex-col gap-3.5">
        <OverseerComms
          {...(comms.message ? { message: comms.message } : {})}
          {...(dashboard.overseer ? { overseerLook: dashboard.overseer.look } : {})}
          onApprove={comms.approve}
          onDeny={comms.deny}
          onNext={comms.next}
          onOrder={(text) => {
            comms.order(text);
            if (dashboard.bridgeId) setPicked({ type: "room", id: dashboard.bridgeId });
          }}
          busy={comms.busy}
        />
        <ErrorNote error={comms.error} />
        {selection ? (
          <Scanner
            dashboard={dashboard}
            selection={selection}
            onSelect={setPicked}
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
