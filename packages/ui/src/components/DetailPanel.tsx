import {
  type Agent,
  deriveRig,
  type Grant,
  type Handoff,
  overseerRig,
  type RunSummary,
  type Station,
  type StationState,
  type Team,
  type TeamState,
  term,
} from "@darthsaul/outerworld-ai-core";
import type { ReactNode } from "react";
import { Character } from "../character/Character.js";
import { OverseerCharacter } from "../character/OverseerCharacter.js";
import { EmptyState } from "./EmptyState.js";
import { clockLabel, dateLabel, durationLabel } from "./format.js";
import { GrantChip } from "./GrantChip.js";
import type { Selection } from "./selection.js";
import { TeamEmblem } from "./TeamEmblem.js";

export interface DetailPanelProps {
  readonly station: Station;
  readonly state: StationState;
  readonly selection: Selection | null;
  readonly onSelect: (selection: Selection) => void;
  /** When given, a close control is shown (the mobile sheet). */
  readonly onClose?: () => void;
  /** Rendered as a bottom sheet (mobile). */
  readonly sheet?: boolean;
}

/* ---------- small parts ---------- */

function Eyebrow({ children }: { readonly children: ReactNode }) {
  return (
    <p className="font-mono text-eyebrow uppercase text-ink-3" data-eyebrow>
      {children}
    </p>
  );
}

function Region({
  title,
  children,
  id,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly id: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-(--ow-space-2)">
      <h3 id={id} className="font-mono text-eyebrow uppercase text-ink-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The anti-streaming promise made visible: what we know, from where, as of when. */
function ProofLine({ state, path }: { readonly state: StationState; readonly path: string }) {
  return (
    <p className="flex flex-wrap gap-(--ow-space-2) font-mono text-mono text-ink-3" data-proof-line>
      <span>{state.provenance.asOf}</span>
      <span aria-hidden="true">·</span>
      <span>{path}</span>
      {state.provenance.sourceRef ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{state.provenance.sourceRef}</span>
        </>
      ) : null}
    </p>
  );
}

function LinkButton({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control px-(--ow-space-2) py-(--ow-space-1) text-left text-label text-ink-1 underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

function GrantsUsed({ station, run }: { readonly station: Station; readonly run: RunSummary }) {
  if (run.grantsUsed.length === 0)
    return <span className="text-caption text-ink-3">no grants used</span>;
  return (
    <ul className="flex flex-wrap gap-(--ow-size-chip-gap)">
      {run.grantsUsed.map((u) => {
        const g = station.grants.find((x) => x.id === u.grantId);
        const label = `${g?.label ?? g?.tool ?? u.grantId} ×${u.count}`;
        return (
          <li key={u.grantId}>
            <GrantChip mode={g?.mode ?? "read"} label={label} />
          </li>
        );
      })}
    </ul>
  );
}

function LastRun({
  station,
  team,
  teamState,
}: {
  readonly station: Station;
  readonly team: Team;
  readonly teamState: TeamState;
}) {
  const run = teamState.lastRun;
  if (!run) {
    return <EmptyState title={term("empty.runs.title")} body={term("empty.runs.body")} />;
  }
  const stateWord = run.endedAt ? (run.outcome ?? "done") : teamState.run;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-(--ow-space-3) gap-y-(--ow-space-1) text-body">
      <dt className="text-caption text-ink-3">state</dt>
      <dd className="text-ink-1">{stateWord}</dd>
      <dt className="text-caption text-ink-3">window</dt>
      <dd className="font-mono text-mono text-ink-2">
        {clockLabel(run.startedAt)}
        {run.endedAt
          ? ` → ${clockLabel(run.endedAt)} · ${durationLabel(run.startedAt, run.endedAt)}`
          : " → open"}
      </dd>
      <dt className="text-caption text-ink-3">used</dt>
      <dd>
        <GrantsUsed station={station} run={run} />
      </dd>
      {run.error ? (
        <>
          <dt className="text-caption text-ink-3">error</dt>
          <dd className="text-body text-ink-1">{run.error}</dd>
        </>
      ) : null}
      {run.sessionUrl ? (
        <>
          <dt className="text-caption text-ink-3">session</dt>
          <dd>
            <a
              href={run.sessionUrl}
              className="font-mono text-mono text-ink-2 underline-offset-2 hover:underline"
              rel="noreferrer"
            >
              open transcript
            </a>
          </dd>
        </>
      ) : null}
      <dt className="sr-only">team</dt>
      <dd className="sr-only">{team.name}</dd>
    </dl>
  );
}

function LedgerView({ teamState }: { readonly teamState: TeamState }) {
  const s = teamState.ledger.sections;
  if (!teamState.ledger.exists || !s) {
    return <EmptyState title={term("empty.ledger.title")} body={term("empty.ledger.body")} />;
  }
  const block = (title: string, items: readonly string[]) => (
    <div className="flex flex-col gap-(--ow-space-1)">
      <p className="text-label text-ink-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-caption text-ink-3">nothing</p>
      ) : (
        <ul className="list-disc pl-(--ow-space-4) text-body text-ink-1">
          {items.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div
      className="flex flex-col gap-(--ow-space-3) rounded-control border border-border-subtle p-(--ow-space-3)"
      data-changed={teamState.ledger.changedInLastRun ? "true" : "false"}
    >
      <p className="font-mono text-mono text-ink-3">
        {teamState.ledger.path}
        {teamState.ledger.changedInLastRun
          ? ` · ${teamState.lastRun?.ledger.linesAdded ?? 0}+ ${teamState.lastRun?.ledger.linesRemoved ?? 0}− in last run`
          : " · unchanged in last run"}
      </p>
      {block("Next steps", s.nextSteps)}
      {block("Waiting on", s.waitingOn)}
      {block("Log", s.log)}
    </div>
  );
}

function RunTimeline({ teamState }: { readonly teamState: TeamState }) {
  if (teamState.recentRuns.length === 0) return <p className="text-caption text-ink-3">none yet</p>;
  return (
    <ol className="flex flex-col divide-y divide-border-subtle">
      {teamState.recentRuns.map((r, i) => {
        const word = r.endedAt ? (r.outcome ?? "done") : i === 0 ? teamState.run : "open";
        return (
          <li
            key={r.startedAt}
            className="grid grid-cols-[1fr_auto_auto] gap-(--ow-space-3) py-(--ow-space-2) font-mono text-mono"
          >
            <span className="text-ink-2">{dateLabel(r.startedAt)}</span>
            <span className="text-ink-3">{durationLabel(r.startedAt, r.endedAt)}</span>
            <span className="text-ink-1" data-run-outcome={word}>
              {word}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- per-kind bodies ---------- */

function teamCounts(station: Station, team: Team) {
  const grants = station.grants.filter((g) => g.teamId === team.id).length;
  const handoffs = station.handoffs.filter((h) => h.from === team.id || h.to === team.id).length;
  const agents = station.agents.filter((a) => a.teamId === team.id).length;
  return { grants, handoffs, agents };
}

function TeamBody({
  station,
  state,
  team,
  onSelect,
}: {
  readonly station: Station;
  readonly state: StationState;
  readonly team: Team;
  readonly onSelect: (s: Selection) => void;
}) {
  const ts = state.teams[team.id];
  const counts = teamCounts(station, team);
  const agents = station.agents.filter((a) => a.teamId === team.id);
  const handoffs = station.handoffs.filter((h) => h.from === team.id || h.to === team.id);
  const teamName = (id: string) => station.teams.find((t) => t.id === id)?.name ?? id;
  return (
    <>
      <header className="flex items-start gap-(--ow-space-3)">
        <TeamEmblem name={team.name} hue={team.emblem.hue} mark={team.emblem.mark} scale={4} />
        <div className="flex min-w-0 flex-col gap-(--ow-space-1)">
          <Eyebrow>
            {term("team")} · {counts.grants} {term("grants")} · {counts.handoffs} {term("handoffs")}
          </Eyebrow>
          <h2 className="text-title text-ink-1">{team.name}</h2>
          <p className="text-body text-ink-2">{team.mission}</p>
          <p className="font-mono text-mono text-ink-3">
            {counts.agents} {term("agents").toLowerCase()} · {term("run.last")}{" "}
            {ts?.lastRun ? dateLabel(ts.lastRun.startedAt) : "never"} ·{" "}
            <span data-health-word>{term(`health.${ts?.health ?? "ok"}`)}</span>
          </p>
        </div>
      </header>
      {ts?.degraded ? (
        <p
          role="alert"
          className="rounded-control border border-health-attention px-(--ow-space-3) py-(--ow-space-2) text-caption text-ink-1"
        >
          Last run is older than a day. {ts.healthReason ?? ""}
        </p>
      ) : ts?.healthReason ? (
        <p className="text-caption text-ink-2">{ts.healthReason}</p>
      ) : null}
      <ProofLine state={state} path={ts?.ledger.path ?? `ledger/${team.id}.md`} />
      {ts ? (
        <>
          <Region id="dp-last-run" title={term("report.lastRun")}>
            <LastRun station={station} team={team} teamState={ts} />
          </Region>
          <Region id="dp-ledger" title={term("report.ledger")}>
            <LedgerView teamState={ts} />
          </Region>
          <Region id="dp-runs" title={`${term("report.runs")} · last ${ts.recentRuns.length}`}>
            <RunTimeline teamState={ts} />
          </Region>
        </>
      ) : null}
      <Region id="dp-handoffs" title={term("report.handoffs")}>
        {handoffs.length === 0 ? (
          <EmptyState title={term("empty.handoffs.title")} body={term("empty.handoffs.body")} />
        ) : (
          <ul className="flex flex-col">
            {handoffs.map((h) => (
              <li key={h.id}>
                <LinkButton onClick={() => onSelect({ kind: "handoff", id: h.id })}>
                  {teamName(h.from)} → {teamName(h.to)}
                  {state.handoffs[h.id]?.carrying ? (
                    <span className="ml-(--ow-space-2) font-mono text-mono text-run-working">
                      carrying
                    </span>
                  ) : null}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </Region>
      <Region id="dp-agents" title={term("report.agents")}>
        <ul className="flex flex-col">
          {agents.map((a) => (
            <li key={a.id}>
              <LinkButton onClick={() => onSelect({ kind: "agent", id: a.id })}>
                <span className="flex items-center gap-(--ow-space-2)">
                  <Character
                    name={a.persona.name}
                    rig={a.persona.rig}
                    derived={deriveRig(a, station)}
                    state={state.agents[a.id]?.state ?? "idle"}
                    scale={1}
                  />
                  <span>{a.persona.name}</span>
                  <span className="font-mono text-mono text-ink-3">
                    {state.agents[a.id]?.state ?? "idle"}
                  </span>
                </span>
              </LinkButton>
            </li>
          ))}
        </ul>
      </Region>
    </>
  );
}

function AgentBody({
  station,
  state,
  agent,
  onSelect,
}: {
  readonly station: Station;
  readonly state: StationState;
  readonly agent: Agent;
  readonly onSelect: (s: Selection) => void;
}) {
  const team = station.teams.find((t) => t.id === agent.teamId);
  const as = state.agents[agent.id] ?? { state: "idle" as const };
  const grants = station.grants.filter((g) => agent.persona.allowlist.includes(g.id));
  const ts = state.teams[agent.teamId];
  return (
    <>
      <header className="flex items-start gap-(--ow-space-3)">
        <Character
          name={agent.persona.name}
          rig={agent.persona.rig}
          derived={deriveRig(agent, station)}
          state={as.state}
          scale={2}
        />
        <div className="flex min-w-0 flex-col gap-(--ow-space-1)">
          <Eyebrow>
            {term("agent")} · {term("persona")}
          </Eyebrow>
          <h2 className="text-title text-ink-1">{agent.persona.name}</h2>
          <p className="text-body text-ink-2">{agent.persona.mandate}</p>
          <p className="font-mono text-mono text-ink-3">
            {as.state}
            {as.note ? ` · ${as.note}` : ""}
          </p>
        </div>
      </header>
      <ProofLine state={state} path={ts?.ledger.path ?? `ledger/${agent.teamId}.md`} />
      <Region id="dp-tone" title="tone">
        <p className="text-body text-ink-1">{agent.persona.tone}</p>
      </Region>
      <Region id="dp-allowlist" title={term("grants")}>
        <ul className="flex flex-wrap gap-(--ow-size-chip-gap)">
          {grants.map((g) => (
            <li key={g.id}>
              <GrantChip
                mode={g.mode}
                label={g.label ?? g.tool}
                onSelect={() => onSelect({ kind: "grant", id: g.id })}
              />
            </li>
          ))}
        </ul>
      </Region>
      <Region id="dp-team" title={term("team")}>
        {team ? (
          <LinkButton onClick={() => onSelect({ kind: "team", id: team.id })}>
            {team.name}
          </LinkButton>
        ) : null}
      </Region>
    </>
  );
}

function GrantBody({
  station,
  state,
  grant,
  onSelect,
}: {
  readonly station: Station;
  readonly state: StationState;
  readonly grant: Grant;
  readonly onSelect: (s: Selection) => void;
}) {
  const team = station.teams.find((t) => t.id === grant.teamId);
  const holders = station.agents.filter((a) => a.persona.allowlist.includes(grant.id));
  return (
    <>
      <header className="flex flex-col gap-(--ow-space-1)">
        <Eyebrow>
          {term("grant")} · {grant.mode} · {grant.kind}
        </Eyebrow>
        <h2 className="text-title text-ink-1">{grant.label ?? grant.tool}</h2>
        <p className="text-body text-ink-2">
          {grant.mode} access to {grant.tool} ({grant.kind}) for {team?.name ?? grant.teamId}
        </p>
      </header>
      <ProofLine state={state} path="station.json" />
      <Region id="dp-holders" title={term("agents")}>
        {holders.length === 0 ? (
          <p className="text-caption text-ink-3">no agent holds this grant</p>
        ) : (
          <ul className="flex flex-col">
            {holders.map((a) => (
              <li key={a.id}>
                <LinkButton onClick={() => onSelect({ kind: "agent", id: a.id })}>
                  {a.persona.name}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </Region>
      <Region id="dp-team" title={term("team")}>
        {team ? (
          <LinkButton onClick={() => onSelect({ kind: "team", id: team.id })}>
            {team.name}
          </LinkButton>
        ) : null}
      </Region>
    </>
  );
}

function HandoffBody({
  station,
  state,
  handoff,
  onSelect,
}: {
  readonly station: Station;
  readonly state: StationState;
  readonly handoff: Handoff;
  readonly onSelect: (s: Selection) => void;
}) {
  const from = station.teams.find((t) => t.id === handoff.from);
  const to = station.teams.find((t) => t.id === handoff.to);
  const hs = state.handoffs[handoff.id];
  const writerState = state.teams[handoff.from];
  return (
    <>
      <header className="flex flex-col gap-(--ow-space-1)">
        <Eyebrow>
          {term("handoff")} · {hs?.carrying ? "carrying" : "quiet"}
        </Eyebrow>
        <h2 className="text-title text-ink-1">
          {from?.name ?? handoff.from} → {to?.name ?? handoff.to}
        </h2>
        {handoff.note ? <p className="text-body text-ink-2">{handoff.note}</p> : null}
      </header>
      <ProofLine state={state} path={writerState?.ledger.path ?? `ledger/${handoff.from}.md`} />
      <Region id="dp-carrying" title="last packet">
        <p className="text-body text-ink-1">
          {hs?.carrying
            ? `The writer's ledger changed in its last run (${writerState?.lastRun ? dateLabel(writerState.lastRun.startedAt) : "unknown"}); the reader sees the new lines on its next run.`
            : "No change in the writer's last run."}
        </p>
      </Region>
      <Region id="dp-teams" title={term("teams")}>
        <ul className="flex flex-col">
          <li>
            <LinkButton onClick={() => onSelect({ kind: "team", id: handoff.from })}>
              writer · {from?.name}
            </LinkButton>
          </li>
          <li>
            <LinkButton onClick={() => onSelect({ kind: "team", id: handoff.to })}>
              reader · {to?.name}
            </LinkButton>
          </li>
        </ul>
      </Region>
    </>
  );
}

function OverseerBody({
  station,
  state,
  onSelect,
}: {
  readonly station: Station;
  readonly state: StationState;
  readonly onSelect: (s: Selection) => void;
}) {
  const o = state.overseer;
  const rig = overseerRig();
  return (
    <>
      <header className="flex items-start gap-(--ow-space-3)">
        <OverseerCharacter name={station.overseer.persona.name} state={o.state} scale={2} />
        <div className="flex min-w-0 flex-col gap-(--ow-space-1)">
          <Eyebrow>
            {term("overseer.role")} · {rig.head} · {rig.trace}
          </Eyebrow>
          <h2 className="text-title text-ink-1">{station.overseer.persona.name}</h2>
          <p className="text-body text-ink-2">{station.overseer.persona.mandate}</p>
          <p className="font-mono text-mono text-ink-3">
            {term(`overseer.${o.state}`)} · reconciled {o.reconciled}
            {o.lastOutwardPostAt ? ` · posted ${o.lastOutwardPostAt}` : " · never posted"}
          </p>
        </div>
      </header>
      <ProofLine state={state} path="status/overseer.json" />
      <Region id="dp-digest" title="digest">
        {o.digest ? (
          <pre className="whitespace-pre-wrap rounded-control border border-border-subtle p-(--ow-space-3) font-sans text-body text-ink-1">
            {o.digest}
          </pre>
        ) : (
          <p className="text-caption text-ink-3">no digest posted yet</p>
        )}
      </Region>
      <Region id="dp-attention" title="attention">
        {o.attention.length === 0 ? (
          <p className="text-caption text-ink-3">nothing needs attention</p>
        ) : (
          <ul className="flex flex-col">
            {o.attention.map((a) => (
              <li key={a.teamId}>
                <LinkButton onClick={() => onSelect({ kind: "team", id: a.teamId })}>
                  {station.teams.find((t) => t.id === a.teamId)?.name ?? a.teamId} · {a.reason}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </Region>
    </>
  );
}

/* ---------- the panel ---------- */

/**
 * The Report view of whatever is selected. Every reporter view carries a proof line (as-of,
 * path, commit), so the last-known-state promise is visible on every screen.
 */
export function DetailPanel({
  station,
  state,
  selection,
  onSelect,
  onClose,
  sheet,
}: DetailPanelProps) {
  let body: ReactNode;
  if (!selection) {
    body = (
      <EmptyState
        title="Nothing selected"
        body="Select a team, an agent, a grant, a handoff, or the overseer on the map."
      />
    );
  } else if (selection.kind === "team") {
    const team = station.teams.find((t) => t.id === selection.id);
    body = team ? (
      <TeamBody station={station} state={state} team={team} onSelect={onSelect} />
    ) : (
      <Missing />
    );
  } else if (selection.kind === "agent") {
    const agent = station.agents.find((a) => a.id === selection.id);
    body = agent ? (
      <AgentBody station={station} state={state} agent={agent} onSelect={onSelect} />
    ) : (
      <Missing />
    );
  } else if (selection.kind === "grant") {
    const grant = station.grants.find((g) => g.id === selection.id);
    body = grant ? (
      <GrantBody station={station} state={state} grant={grant} onSelect={onSelect} />
    ) : (
      <Missing />
    );
  } else if (selection.kind === "handoff") {
    const handoff = station.handoffs.find((h) => h.id === selection.id);
    body = handoff ? (
      <HandoffBody station={station} state={state} handoff={handoff} onSelect={onSelect} />
    ) : (
      <Missing />
    );
  } else {
    body = <OverseerBody station={station} state={state} onSelect={onSelect} />;
  }
  return (
    <aside
      aria-label={term("report.tab")}
      className={[
        "ow-detail flex flex-col gap-(--ow-space-5) rounded-panel border border-border-subtle bg-surface-panel p-(--ow-size-panel-pad)",
        sheet ? "ow-detail--sheet" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-sheet={sheet ? "true" : undefined}
    >
      {onClose ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-2"
          >
            Close
          </button>
        </div>
      ) : null}
      {body}
    </aside>
  );
}

function Missing() {
  return (
    <EmptyState
      title="Not in this station"
      body="The selection refers to something the station document no longer has."
    />
  );
}
