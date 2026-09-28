import {
  deriveRig,
  type RunSummary,
  type Station,
  type Team,
  type TeamState,
  term,
} from "@darthsaul/outerworld-ai-core";
import { Character } from "../../character/Character.js";
import { EmptyState } from "../EmptyState.js";
import { clockLabel, dateLabel, durationLabel, isHttpsUrl } from "../format.js";
import { GrantChip } from "../GrantChip.js";
import { TeamEmblem } from "../TeamEmblem.js";
import { Eyebrow, LinkList, ProofLine, Quiet, Region, type ReportProps } from "./parts.js";

function GrantsUsed({ station, run }: { readonly station: Station; readonly run: RunSummary }) {
  if (run.grantsUsed.length === 0) return <Quiet>no grants used</Quiet>;
  return (
    <ul className="flex flex-wrap gap-(--ow-size-chip-gap)">
      {run.grantsUsed.map((u) => {
        const g = station.grants.find((x) => x.id === u.grantId);
        return (
          <li key={u.grantId}>
            <GrantChip
              mode={g?.mode ?? "read"}
              label={`${g?.label ?? g?.tool ?? u.grantId} ×${u.count}`}
            />
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
  if (!run) return <EmptyState title={term("empty.runs.title")} body={term("empty.runs.body")} />;
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
      {isHttpsUrl(run.sessionUrl) ? (
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
        <Quiet>nothing</Quiet>
      ) : (
        <ul className="list-disc pl-(--ow-space-4) text-body text-ink-1">
          {items.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
  const last = teamState.lastRun?.ledger;
  return (
    <div
      className="flex flex-col gap-(--ow-space-3) rounded-control border border-border-subtle p-(--ow-space-3)"
      data-changed={teamState.ledger.changedInLastRun ? "true" : "false"}
    >
      <p className="font-mono text-mono text-ink-3">
        {teamState.ledger.path}
        {teamState.ledger.changedInLastRun
          ? ` · ${last?.linesAdded ?? 0}+ ${last?.linesRemoved ?? 0}− in last run`
          : " · unchanged in last run"}
      </p>
      {block("Next steps", s.nextSteps)}
      {block("Waiting on", s.waitingOn)}
      {block("Log", s.log)}
    </div>
  );
}

function RunTimeline({ teamState }: { readonly teamState: TeamState }) {
  if (teamState.recentRuns.length === 0) return <Quiet>none yet</Quiet>;
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

export function TeamReport({
  station,
  state,
  team,
  onSelect,
}: ReportProps & { readonly team: Team }) {
  const ts = state.teams[team.id];
  const agents = station.agents.filter((a) => a.teamId === team.id);
  const grants = station.grants.filter((g) => g.teamId === team.id).length;
  const handoffs = station.handoffs.filter((h) => h.from === team.id || h.to === team.id);
  const teamName = (id: string) => station.teams.find((t) => t.id === id)?.name ?? id;
  return (
    <>
      <header className="flex items-start gap-(--ow-space-3)">
        <TeamEmblem name={team.name} hue={team.emblem.hue} mark={team.emblem.mark} scale={4} />
        <div className="flex min-w-0 flex-col gap-(--ow-space-1)">
          <Eyebrow>
            {term("team")} · {grants} {term("grants")} · {handoffs.length} {term("handoffs")}
          </Eyebrow>
          <h2 className="text-title text-ink-1">{team.name}</h2>
          <p className="text-body text-ink-2">{team.mission}</p>
          <p className="font-mono text-mono text-ink-3">
            {agents.length} {term("agents").toLowerCase()} · {term("run.last")}{" "}
            {ts?.lastRun ? dateLabel(ts.lastRun.startedAt) : "never"} ·{" "}
            <span data-health-word>{term(`health.${ts?.health ?? "ok"}`)}</span>
          </p>
        </div>
      </header>
      {ts?.degraded ? (
        <p
          role="status"
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
          <Region title={term("report.lastRun")}>
            <LastRun station={station} team={team} teamState={ts} />
          </Region>
          <Region title={term("report.ledger")}>
            <LedgerView teamState={ts} />
          </Region>
          <Region title={`${term("report.runs")} · last ${ts.recentRuns.length}`}>
            <RunTimeline teamState={ts} />
          </Region>
        </>
      ) : null}
      <Region title={term("report.handoffs")}>
        {handoffs.length === 0 ? (
          <EmptyState title={term("empty.handoffs.title")} body={term("empty.handoffs.body")} />
        ) : (
          <LinkList
            items={handoffs}
            keyOf={(h) => h.id}
            onPick={(h) => onSelect({ kind: "handoff", id: h.id })}
          >
            {(h) => (
              <>
                {teamName(h.from)} → {teamName(h.to)}
                {state.handoffs[h.id]?.carrying ? (
                  <span className="ml-(--ow-space-2) font-mono text-mono text-run-working">
                    carrying
                  </span>
                ) : null}
              </>
            )}
          </LinkList>
        )}
      </Region>
      <Region title={term("report.agents")}>
        <LinkList
          items={agents}
          keyOf={(a) => a.id}
          onPick={(a) => onSelect({ kind: "agent", id: a.id })}
        >
          {(a) => (
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
          )}
        </LinkList>
      </Region>
    </>
  );
}
