import { term } from "@darthsaul/outerworld-ai-core";
import { ErrorNote } from "../components/ErrorNote.js";
import type { ConsentRecord } from "../queries.js";
import { useDecideConsent } from "../queries.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

/**
 * One consent request (brief §6): who wants to run which tool with what input, and Approve or
 * Deny. The run waits for this, with no timeout.
 */
export function ConsentCard({
  consent,
  agentName,
}: {
  readonly consent: ConsentRecord;
  readonly agentName: string;
}) {
  const decide = useDecideConsent();
  const titleId = `consent-${consent.id}`;
  return (
    <section
      aria-labelledby={titleId}
      data-consent={consent.id}
      className="flex flex-col gap-(--ow-space-2) rounded-panel border border-health-attention p-(--ow-space-3)"
    >
      <h3 id={titleId} className="text-label text-ink-1">
        {term("consent.title")}: {agentName} {term("consent.body")}{" "}
        <code className="font-mono text-mono">{consent.tool}</code>
      </h3>
      <pre className="max-h-(--ow-size-sheet-max-h) overflow-auto whitespace-pre-wrap font-mono text-mono text-ink-2">
        {JSON.stringify(consent.input, null, 2)}
      </pre>
      <div className="flex gap-(--ow-space-2)">
        <button
          type="button"
          className={button}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: consent.id, decision: "approved" })}
        >
          {term("consent.approve")}
        </button>
        <button
          type="button"
          className={button}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: consent.id, decision: "denied" })}
        >
          {term("consent.deny")}
        </button>
      </div>
      <ErrorNote error={decide.error} />
    </section>
  );
}
