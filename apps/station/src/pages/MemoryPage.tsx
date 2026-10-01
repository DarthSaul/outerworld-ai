import { term } from "@darthsaul/outerworld-ai-core";
import { EmptyState, OutlineButton, Panel, tabClass } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  type MemoryItem,
  useDecideMemory,
  useEditMemory,
  useForgetMemory,
  useMemories,
  useStationView,
} from "../queries.js";

const textarea =
  "min-h-20 w-full border-2 border-line-soft bg-well p-2 font-body text-b19 text-fg-hi";
const card = "flex flex-col gap-2 border border-line-faint bg-well-2 p-3";
const label = "flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase";

function Proposal({ memory }: { readonly memory: MemoryItem }) {
  const decide = useDecideMemory();
  const [text, setText] = useState(memory.text);
  const edited = text.trim() !== memory.text;
  return (
    <li className={card} data-memory={memory.id}>
      <label className={label}>
        {term("memory.text")}
        <textarea className={textarea} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <OutlineButton
          tone="green"
          disabled={decide.isPending || !text.trim()}
          onClick={() =>
            decide.mutate({
              id: memory.id,
              decision: "approve",
              ...(edited ? { text: text.trim() } : {}),
            })
          }
        >
          {term("memory.approve")}
        </OutlineButton>
        <OutlineButton
          tone="red"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: memory.id, decision: "reject" })}
        >
          {term("memory.reject")}
        </OutlineButton>
      </div>
      <ErrorNote error={decide.error} />
    </li>
  );
}

function Belief({ memory }: { readonly memory: MemoryItem }) {
  const edit = useEditMemory();
  const forget = useForgetMemory();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft?.trim())
      edit.mutate({ id: memory.id, text: draft.trim() }, { onSuccess: () => setDraft(null) });
  };
  return (
    <li className={card} data-memory={memory.id}>
      {draft === null ? (
        <p className="m-0 text-b19 text-fg-hi">{memory.text}</p>
      ) : (
        <label className={label}>
          {term("memory.text")}
          <textarea className={textarea} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {memory.scope === "station" ? (
          <span className="font-display text-d7 text-cyan uppercase">
            {term("memory.scope.station")}
          </span>
        ) : null}
        {draft === null ? (
          <>
            <OutlineButton tone="line" onClick={() => setDraft(memory.text)}>
              {term("memory.edit")}
            </OutlineButton>
            <OutlineButton
              tone="red"
              disabled={forget.isPending}
              onClick={() => forget.mutate(memory.id)}
            >
              {term("memory.forget")}
            </OutlineButton>
          </>
        ) : (
          <>
            <OutlineButton tone="green" disabled={edit.isPending || !draft.trim()} onClick={save}>
              {term("memory.save")}
            </OutlineButton>
            <OutlineButton tone="line" onClick={() => setDraft(null)}>
              {term("memory.cancel")}
            </OutlineButton>
          </>
        )}
      </div>
      <ErrorNote error={edit.error ?? forget.error} />
    </li>
  );
}

/**
 * Memory (brief §14): pick a crew member, decide on what they asked to remember, and curate what
 * they already believe. Nothing an agent proposes reaches a prompt until it is approved here.
 * The selection lives in the URL (`?agent=…`).
 */
export function MemoryPage() {
  const [params, setParams] = useSearchParams();
  const station = useStationView();
  const agentId = params.get("agent") ?? undefined;
  const memories = useMemories(agentId);
  const proposals = memories.data?.proposals ?? [];
  const beliefs = memories.data?.beliefs ?? [];

  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-3.5">
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase tracking-st-2"
      >
        {term("memory")}
      </h1>
      <nav aria-label={term("agents")}>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {station.data?.agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={a.id === agentId}
                className={tabClass(a.id === agentId)}
                onClick={() => setParams({ agent: a.id })}
              >
                {a.config.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <ErrorNote error={station.error ?? memories.error} />
      {agentId === undefined ? (
        <p className="m-0 text-b19 text-fg-soft">{term("memory.pick")}</p>
      ) : memories.isSuccess ? (
        <>
          <Panel title={term("memory.proposals")}>
            <div className="flex flex-col gap-2 p-3">
              {proposals.length === 0 ? (
                <EmptyState
                  title={term("memory.none.proposals.title")}
                  body={term("memory.none.proposals.body")}
                />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {proposals.map((m) => (
                    <Proposal key={m.id} memory={m} />
                  ))}
                </ul>
              )}
            </div>
          </Panel>
          <Panel title={term("memory.beliefs")}>
            <div className="flex flex-col gap-2 p-3">
              <p className="m-0 text-b17 text-fg-soft">{term("memory.hint")}</p>
              {beliefs.length === 0 ? (
                <EmptyState
                  title={term("memory.none.beliefs.title")}
                  body={term("memory.none.beliefs.body")}
                />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {beliefs.map((m) => (
                    <Belief key={m.id} memory={m} />
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </>
      ) : null}
    </section>
  );
}
