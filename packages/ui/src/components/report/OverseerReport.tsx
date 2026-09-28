import { term } from "@darthsaul/outerworld-ai-core";
import { OverseerCharacter } from "../../character/OverseerCharacter.js";
import { Eyebrow, LinkList, ProofLine, Quiet, Region, type ReportProps } from "./parts.js";

export function OverseerReport({ station, state, onSelect }: ReportProps) {
  const o = state.overseer;
  return (
    <>
      <header className="flex items-start gap-(--ow-space-3)">
        <OverseerCharacter name={station.overseer.persona.name} state={o.state} scale={2} />
        <div className="flex min-w-0 flex-col gap-(--ow-space-1)">
          <Eyebrow>{term("overseer.role")}</Eyebrow>
          <h2 className="text-title text-ink-1">{station.overseer.persona.name}</h2>
          <p className="text-body text-ink-2">{station.overseer.persona.mandate}</p>
          <p className="font-mono text-mono text-ink-3">
            {term(`overseer.${o.state}`)} · reconciled {o.reconciled}
            {o.lastOutwardPostAt ? ` · posted ${o.lastOutwardPostAt}` : " · never posted"}
          </p>
        </div>
      </header>
      <ProofLine state={state} path="status/overseer.json" />
      <Region title={term("system.report")}>
        {o.digest ? (
          <pre className="whitespace-pre-wrap rounded-control border border-border-subtle p-(--ow-space-3) font-sans text-body text-ink-1">
            {o.digest}
          </pre>
        ) : (
          <Quiet>no digest posted yet</Quiet>
        )}
      </Region>
      <Region title="attention">
        {o.attention.length === 0 ? (
          <Quiet>nothing needs attention</Quiet>
        ) : (
          <LinkList
            items={o.attention}
            keyOf={(a) => a.teamId}
            onPick={(a) => onSelect({ kind: "team", id: a.teamId })}
          >
            {(a) =>
              `${station.teams.find((t) => t.id === a.teamId)?.name ?? a.teamId} · ${a.reason}`
            }
          </LinkList>
        )}
      </Region>
    </>
  );
}
