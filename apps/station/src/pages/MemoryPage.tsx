import { term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
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

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";
const textarea =
  "min-h-(--ow-size-control-h) w-full rounded-control border border-border-subtle bg-surface-raised p-(--ow-space-2) text-body text-ink-1";
const card =
  "flex flex-col gap-(--ow-space-2) rounded-panel border border-border-subtle p-(--ow-space-3)";

function Proposal({ memory }: { readonly memory: MemoryItem }) {
  const decide = useDecideMemory();
  const [text, setText] = useState(memory.text);
  const edited = text.trim() !== memory.text;
  return (
    <li className={card} data-memory={memory.id}>
      <label className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
        {term("memory.text")}
        <textarea className={textarea} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-(--ow-space-2)">
        <button
          type="button"
          className={button}
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
        </button>
        <button
          type="button"
          className={button}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: memory.id, decision: "reject" })}
        >
          {term("memory.reject")}
        </button>
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
        <p className="text-body text-ink-1">{memory.text}</p>
      ) : (
        <label className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
          {term("memory.text")}
          <textarea className={textarea} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-(--ow-space-2)">
        {memory.scope === "station" ? (
          <span className="font-mono text-mono text-ink-2">{term("memory.scope.station")}</span>
        ) : null}
        {draft === null ? (
          <>
            <button type="button" className={button} onClick={() => setDraft(memory.text)}>
              {term("memory.edit")}
            </button>
            <button
              type="button"
              className={button}
              disabled={forget.isPending}
              onClick={() => forget.mutate(memory.id)}
            >
              {term("memory.forget")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={button}
              disabled={edit.isPending || !draft.trim()}
              onClick={save}
            >
              {term("memory.save")}
            </button>
            <button type="button" className={button} onClick={() => setDraft(null)}>
              {term("memory.cancel")}
            </button>
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
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term("memory")}
      </h1>
      <nav aria-label={term("agents")}>
        <ul className="flex flex-wrap gap-(--ow-space-2)">
          {station.data?.agents.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={a.id === agentId}
                className={`${button} aria-pressed:border-border-strong`}
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
        <p className="text-body text-ink-2">{term("memory.pick")}</p>
      ) : memories.isSuccess ? (
        <>
          <section aria-labelledby="memory-proposals" className="flex flex-col gap-(--ow-space-2)">
            <h2 id="memory-proposals" className="font-mono text-eyebrow uppercase text-ink-3">
              {term("memory.proposals")}
            </h2>
            {proposals.length === 0 ? (
              <EmptyState
                title={term("memory.none.proposals.title")}
                body={term("memory.none.proposals.body")}
              />
            ) : (
              <ul className="flex flex-col gap-(--ow-space-2)">
                {proposals.map((m) => (
                  <Proposal key={m.id} memory={m} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="memory-beliefs" className="flex flex-col gap-(--ow-space-2)">
            <h2 id="memory-beliefs" className="font-mono text-eyebrow uppercase text-ink-3">
              {term("memory.beliefs")}
            </h2>
            <p className="text-label text-ink-2">{term("memory.hint")}</p>
            {beliefs.length === 0 ? (
              <EmptyState
                title={term("memory.none.beliefs.title")}
                body={term("memory.none.beliefs.body")}
              />
            ) : (
              <ul className="flex flex-col gap-(--ow-space-2)">
                {beliefs.map((m) => (
                  <Belief key={m.id} memory={m} />
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
