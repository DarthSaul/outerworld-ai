import { term } from "@darthsaul/outerworld-ai-core";
import { ChoiceButton } from "@darthsaul/outerworld-ai-ui";
import { ErrorNote } from "../components/ErrorNote.js";
import type { ConsentRecord } from "../queries.js";
import { useDecideConsent } from "../queries.js";

/**
 * One consent request (brief §6): who wants to run which tool with what input, and (A) Approve or
 * (B) Deny. The run waits for this, with no timeout.
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
      className="flex flex-col gap-2 border-2 border-amber bg-well-2 p-2.5"
    >
      <h3 id={titleId} className="m-0 font-normal text-b19 text-fg-hi">
        <span className="font-display text-amber text-d8 uppercase">{term("consent.title")}:</span>{" "}
        {agentName} {term("consent.body")} <code className="text-cyan">{consent.tool}</code>
      </h3>
      <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap border border-line-faint bg-well p-1.5 font-body text-b15 text-fg-soft">
        {JSON.stringify(consent.input, null, 2)}
      </pre>
      <div className="flex gap-2.5">
        <ChoiceButton
          glyph="A"
          tone="green"
          size="d8"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: consent.id, decision: "approved" })}
        >
          {term("consent.approve")}
        </ChoiceButton>
        <ChoiceButton
          glyph="B"
          tone="red"
          size="d8"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: consent.id, decision: "denied" })}
        >
          {term("consent.deny")}
        </ChoiceButton>
      </div>
      <ErrorNote error={decide.error} />
    </section>
  );
}
