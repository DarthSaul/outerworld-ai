import { type Handoff, type Team, term } from "@darthsaul/outerworld-ai-core";
import { dateLabel } from "../format.js";
import { Eyebrow, LinkList, ProofLine, Region, type ReportProps } from "./parts.js";

export function HandoffReport({
  state,
  handoff,
  from,
  to,
  onSelect,
}: ReportProps & {
  readonly handoff: Handoff;
  readonly from: Team | undefined;
  readonly to: Team | undefined;
}) {
  const hs = state.handoffs[handoff.id];
  const writerState = state.teams[handoff.from];
  const ends = [
    { role: "writer", id: handoff.from, name: from?.name },
    { role: "reader", id: handoff.to, name: to?.name },
  ];
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
      <Region title="last packet">
        <p className="text-body text-ink-1">
          {hs?.carrying
            ? `The writer's ledger changed in its last run (${writerState?.lastRun ? dateLabel(writerState.lastRun.startedAt) : "unknown"}); the reader sees the new lines on its next run.`
            : "No change in the writer's last run."}
        </p>
      </Region>
      <Region title={term("teams")}>
        <LinkList
          items={ends}
          keyOf={(e) => e.role}
          onPick={(e) => onSelect({ kind: "team", id: e.id })}
        >
          {(e) => `${e.role} · ${e.name ?? e.id}`}
        </LinkList>
      </Region>
    </>
  );
}
