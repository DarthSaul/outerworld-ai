import { term } from "@darthsaul/outerworld-ai-core";
import { loadLedger } from "../lib/ledger";
import { DigestDemo } from "./components/DigestDemo";
import { ThemeToggle } from "./components/ThemeToggle";

/** The dashboard. Server-side: read the ledger; client-side: the view and the demo controls. */
export default function HomePage() {
  const { station, state, source, sourcePath } = loadLedger();
  return (
    <main className="flex min-h-screen flex-col gap-(--ow-space-6) p-(--ow-space-6)">
      <header className="flex flex-wrap items-start justify-between gap-(--ow-space-4)">
        <div className="flex flex-col gap-(--ow-space-1)">
          <p className="font-mono text-eyebrow uppercase text-ink-3">
            Outerworld AI · {term("station")}
          </p>
          <h1 className="text-display text-ink-1">{station.name}</h1>
          <p className="flex flex-wrap gap-(--ow-space-2) font-mono text-mono text-ink-3">
            <span>
              {term("proof.asOf")} {state.provenance.asOf}
            </span>
            <span aria-hidden="true">·</span>
            <span>{source === "fixture" ? "demo fixture" : sourcePath}</span>
            {state.provenance.sourceRef ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{state.provenance.sourceRef}</span>
              </>
            ) : null}
          </p>
        </div>
        <ThemeToggle />
      </header>
      {state.issues.length > 0 ? (
        <section
          aria-label="Ledger issues"
          className="rounded-control border border-health-attention p-(--ow-space-3) text-caption text-ink-1"
        >
          <p className="text-label">
            Some ledger files could not be read. The map shows what could be proven.
          </p>
          <ul className="mt-(--ow-space-2) list-disc pl-(--ow-space-4) font-mono text-mono text-ink-2">
            {state.issues.map((i) => (
              <li key={`${i.path}:${i.message}`}>
                {i.path}: {i.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DigestDemo station={station} initial={state} />
    </main>
  );
}
