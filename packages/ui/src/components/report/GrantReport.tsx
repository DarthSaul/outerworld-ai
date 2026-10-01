import { type Grant, type Team, term } from "@darthsaul/outerworld-ai-core";
import {
  Eyebrow,
  LinkButton,
  LinkList,
  ProofLine,
  Quiet,
  Region,
  type ReportProps,
} from "./parts.js";

export function GrantReport({
  station,
  state,
  grant,
  team,
  onSelect,
}: ReportProps & { readonly grant: Grant; readonly team: Team | undefined }) {
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
      <Region title={term("agents")}>
        {holders.length === 0 ? (
          <Quiet>no agent holds this grant</Quiet>
        ) : (
          <LinkList
            items={holders}
            keyOf={(a) => a.id}
            onPick={(a) => onSelect({ kind: "agent", id: a.id })}
          >
            {(a) => a.persona.name}
          </LinkList>
        )}
      </Region>
      <Region title={term("room")}>
        {team ? (
          <LinkButton onClick={() => onSelect({ kind: "team", id: team.id })}>
            {team.name}
          </LinkButton>
        ) : null}
      </Region>
    </>
  );
}
