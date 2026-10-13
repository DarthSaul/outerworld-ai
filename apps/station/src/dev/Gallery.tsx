import {
  CHARACTERS,
  CREW_DISPLAY_STATUSES,
  type DashboardInput,
  type DashboardRun,
  dashboardModel,
  RUN_DISPLAY_STATUSES,
  term,
} from "@darthsaul/outerworld-ai-core";
import {
  Avatar,
  ChoiceButton,
  CREW_STATUS_TONE,
  CrewRoster,
  DashboardMap,
  EmptyState,
  lampBlink,
  MAP_STYLES,
  OutlineButton,
  OverseerComms,
  Panel,
  PanelLabel,
  RUN_STATUS_TONE,
  Scanner,
  SegmentBar,
  Sprite,
  StatBox,
  StationVitals,
  StopButton,
  stVar,
  tabClass,
  toneVar,
} from "@darthsaul/outerworld-ai-ui";
import type { ReactNode } from "react";

const at = "2026-10-01T09:00:00.000Z";
const run = (id: string, agentId: string, state: DashboardRun["state"], steps: number) => ({
  id,
  agentId,
  sessionId: `s-${id}`,
  state,
  createdAt: at,
  steps,
  title: `Demo mission ${id}`,
});

/** The demo station with work in flight: a run, a wait for approval, a dispatch, history. */
function busy(input: DashboardInput): DashboardInput {
  return {
    ...input,
    activity: {
      quill: { state: "awaiting_consent", runs: 1, sessionId: "s-2", at },
      wren: { state: "running", runs: 1, sessionId: "s-1", at },
    },
    runs: [
      run("1", "wren", "running", 4),
      run("2", "quill", "awaiting_consent", 2),
      run("3", "vesper", "completed", 6),
      run("4", "wren", "failed", 1),
      run("5", "quill", "cancelled", 3),
    ],
    dispatches: [{ workerAgentId: "wren" }],
    activeRunCount: 2,
    pendingMemoryProposals: 1,
  };
}

function Cell({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <PanelLabel>{label}</PanelLabel>
      {children}
    </div>
  );
}

/** The `/dev` gallery: every station dashboard piece in every state, from the demo fixture. */
export function Gallery({ input }: { readonly input: DashboardInput }) {
  const quiet = dashboardModel(input);
  const live = dashboardModel(busy(input));
  return (
    <main className="flex min-h-dvh flex-col gap-3.5 p-3.5">
      <h1 className="m-0 font-display font-normal text-d14 text-title uppercase">Gallery</h1>

      <Panel title="Primitives">
        <div className="grid grid-cols-1 gap-3.5 p-3 desktop:grid-cols-3">
          <Cell label="Buttons">
            <div className="flex flex-wrap gap-2">
              <span className={tabClass(true)}>{term("tab.station")}</span>
              <span className={tabClass(false)}>{term("tab.crewSelect")}</span>
              <OutlineButton tone="amber">{term("scanner.stopRun")}</OutlineButton>
              <OutlineButton tone="amber" filled>
                {term("map.drawCancel")}
              </OutlineButton>
              <OutlineButton tone="line">{term("scanner.demolish")}</OutlineButton>
            </div>
            <div className="flex gap-2.5">
              <ChoiceButton glyph="A" tone="green">
                {term("comms.approve")}
              </ChoiceButton>
              <ChoiceButton glyph="B" tone="red">
                {term("comms.deny")}
              </ChoiceButton>
            </div>
            <div className="flex gap-2">
              <StopButton stopped={false} onToggle={() => {}} />
              <StopButton stopped onToggle={() => {}} />
            </div>
          </Cell>
          <Cell label="Stats and bars">
            <div className="flex flex-wrap gap-2">
              <StatBox label={term("stat.live")} value={2} tone="green" />
              <StatBox label={term("stat.alerts")} value={1} tone="red" alert />
            </div>
            <SegmentBar color={stVar("amber")} percent={42} size="lg" label="Fuel" />
            <SegmentBar color={stVar("green")} active />
            <SegmentBar color={stVar("done")} percent={100} />
          </Cell>
          <Cell label="Statuses">
            <div className="flex flex-wrap gap-3">
              {CREW_DISPLAY_STATUSES.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <Avatar
                    name="Demo"
                    color={stVar("room-0")}
                    lamp={{ color: toneVar(CREW_STATUS_TONE[s]), className: lampBlink(s) }}
                  />
                  <span
                    className="font-display text-d7 uppercase"
                    style={{ color: toneVar(CREW_STATUS_TONE[s]) }}
                  >
                    {term(`crewStatus.${s}`)}
                  </span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {RUN_DISPLAY_STATUSES.map((s) => (
                <span
                  key={s}
                  className="font-display text-d7 uppercase"
                  style={{ color: toneVar(RUN_STATUS_TONE[s]) }}
                >
                  {term(`missionStatus.${s}`)}
                </span>
              ))}
            </div>
            <EmptyState title={term("empty.runs.title")} body={term("empty.runs.body")} />
          </Cell>
        </div>
      </Panel>

      <Panel title="Characters">
        <ul className="m-0 flex list-none flex-wrap gap-3 p-3">
          {CHARACTERS.map((c, i) => (
            <li key={c.id} className="flex flex-col items-center gap-1 bg-tile p-2">
              <Sprite look={i} scale={2} label={c.name} />
              <span className="font-display text-d6 text-fg-hi">{c.name}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {MAP_STYLES.map((style) => (
        <Panel key={style} title={`${term("map.title")} · ${style}`}>
          <DashboardMap
            dashboard={live}
            mapStyle={style}
            selection={{ type: "room", id: "research" }}
          />
        </Panel>
      ))}
      <Panel title="Map, drawing and stopped">
        <div className="grid grid-cols-1 gap-3.5 desktop:grid-cols-2">
          <DashboardMap dashboard={quiet} drawFrom="operations" />
          <DashboardMap dashboard={quiet} paused />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3.5 desktop:grid-cols-3">
        <CrewRoster dashboard={live} selection={{ type: "agent", id: "wren" }} />
        <OverseerComms
          message={{
            key: "gallery",
            speaker: "Quill · Operations",
            text: "Quill wants to use write_file. Approve?",
            kind: "approval",
          }}
          overseerLook={live.overseer?.look ?? 0}
        />
        <Scanner dashboard={live} selection={{ type: "room", id: "command" }} onSelect={() => {}} />
        <Scanner
          dashboard={live}
          selection={{ type: "agent", id: "wren" }}
          onSelect={() => {}}
          onStopRun={() => {}}
        />
        <Scanner
          dashboard={live}
          selection={{ type: "lane", id: "research-to-command" }}
          onSelect={() => {}}
          onDemolish={() => {}}
        />
      </div>
      <StationVitals tokens={1_284_000} spendUsd={12.5} capUsd={50} startedAt={at} />
    </main>
  );
}
