import { type Agent, deriveRig, type Team, term } from "@darthsaul/outerworld-ai-core";
import { Character } from "../../character/Character.js";
import { GrantChip } from "../GrantChip.js";
import { Eyebrow, LinkButton, ProofLine, Region, type ReportProps } from "./parts.js";

export function AgentReport({
  station,
  state,
  agent,
  team,
  onSelect,
}: ReportProps & { readonly agent: Agent; readonly team: Team | undefined }) {
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
          <Eyebrow>{term("agent")}</Eyebrow>
          <h2 className="text-title text-ink-1">{agent.persona.name}</h2>
          <p className="text-body text-ink-2">{agent.persona.mandate}</p>
          <p className="font-mono text-mono text-ink-3">
            {as.state}
            {as.note ? ` · ${as.note}` : ""}
          </p>
        </div>
      </header>
      <ProofLine state={state} path={ts?.ledger.path ?? `ledger/${agent.teamId}.md`} />
      <Region title="tone">
        <p className="text-body text-ink-1">{agent.persona.tone}</p>
      </Region>
      <Region title={term("grants")}>
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
      <Region title={term("team")}>
        {team ? (
          <LinkButton onClick={() => onSelect({ kind: "team", id: team.id })}>
            {team.name}
          </LinkButton>
        ) : null}
      </Region>
    </>
  );
}
