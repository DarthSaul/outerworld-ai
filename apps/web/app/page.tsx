import { term } from "@darthsaul/outerworld-ai-core";
import { loadLedger } from "../lib/ledger";
import { DigestDemo } from "./components/DigestDemo";
import { ThemeToggle } from "./components/ThemeToggle";

/**
 * The dashboard, sized to the viewport: a nav row, the three columns (overview 1fr, map 3fr,
 * report 2fr), and a footer row. Panes scroll inside themselves; the page never does.
 */
export default function HomePage() {
  const { station, state, source, sourcePath } = loadLedger();
  const sidebar = (
    <>
      <div className="flex flex-col gap-(--ow-space-1)">
        <h1 className="text-title text-ink-1">{station.name}</h1>
        <p className="font-mono text-mono text-ink-3">
          {term("proof.asOf")} {state.provenance.asOf}
        </p>
      </div>
      <section aria-label="Settings" className="flex flex-col gap-(--ow-space-2)">
        <h2 className="font-mono text-eyebrow uppercase text-ink-3">Settings</h2>
        <ThemeToggle />
      </section>
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
    </>
  );
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] gap-(--ow-space-4) p-(--ow-space-4)">
      <nav
        aria-label="Primary"
        className="flex items-center justify-between rounded-panel border border-border-subtle bg-surface-panel px-(--ow-space-4) py-(--ow-space-4)"
      >
        <span className="font-mono text-label uppercase text-ink-1">
          Outerworld AI · {term("station")}
        </span>
        <span className="font-mono text-mono text-ink-3">{station.name}</span>
      </nav>
      <main className="flex min-h-0 flex-col">
        <DigestDemo station={station} initial={state} sidebar={sidebar} />
      </main>
      <footer className="flex items-center justify-between rounded-panel border border-border-subtle bg-surface-panel px-(--ow-space-4) py-(--ow-space-4) font-mono text-mono text-ink-3">
        <span>{source === "fixture" ? "demo fixture" : sourcePath}</span>
        <span>
          {state.provenance.sourceRef ? `${state.provenance.sourceRef} · ` : ""}
          {term("proof.asOf")} {state.provenance.asOf}
        </span>
      </footer>
    </div>
  );
}
