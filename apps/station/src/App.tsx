import { type GlossaryKey, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router";
import { useDaemon } from "./daemon-context.js";
import { AgentPage } from "./pages/AgentPage.js";
import { CrewPage } from "./pages/CrewPage.js";
import { StationPage } from "./pages/StationPage.js";

const Gallery = lazy(() => import("./dev/GalleryPage.js"));

/** The seven v1 screens (brief §5). Screens other than Station fill in phase by phase. */
export const SCREENS: ReadonlyArray<{ path: string; label: GlossaryKey; phase?: number }> = [
  { path: "/", label: "station" },
  { path: "/comms", label: "comms", phase: 3 },
  { path: "/crew", label: "agents" },
  { path: "/memory", label: "memory", phase: 7 },
  { path: "/notifications", label: "notifications", phase: 9 },
  { path: "/connectors", label: "connectors", phase: 6 },
  { path: "/settings", label: "settings", phase: 3 },
];

function Placeholder({ label, phase }: { label: GlossaryKey; phase: number }) {
  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term(label)}
      </h1>
      <EmptyState
        title={term("empty.phase.title")}
        body={`Lands in phase ${phase} of the v1 plan.`}
      />
    </section>
  );
}

function StatusBadge() {
  const { status } = useDaemon();
  return (
    <span
      role="status"
      aria-label="Connection"
      className="font-mono text-mono text-ink-3"
      data-connection={status}
    >
      {term(`connection.${status}`)}
    </span>
  );
}

/** The station shell: a nav row over the current screen. `/dev` is the component gallery. */
export function App() {
  return (
    <Routes>
      <Route
        path="/dev"
        element={
          <Suspense fallback={null}>
            <Gallery />
          </Suspense>
        }
      />
      <Route
        path="*"
        element={
          <div className="grid min-h-dvh grid-rows-[auto_1fr] gap-(--ow-space-4) p-(--ow-space-4)">
            <header className="flex flex-wrap items-center justify-between gap-(--ow-space-3) rounded-panel border border-border-subtle bg-surface-panel px-(--ow-space-4) py-(--ow-space-3)">
              <span className="font-mono text-label uppercase text-ink-1">Outerworld AI</span>
              <nav aria-label="Primary">
                <ul className="flex flex-wrap gap-(--ow-space-3)">
                  {SCREENS.map((s) => (
                    <li key={s.path}>
                      <NavLink
                        to={s.path}
                        end={s.path === "/"}
                        className="text-label text-ink-2 aria-[current=page]:text-ink-1 aria-[current=page]:underline"
                      >
                        {term(s.label)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
              <StatusBadge />
            </header>
            <main className="min-w-0 rounded-panel border border-border-subtle bg-surface-panel p-(--ow-space-4)">
              <Routes>
                <Route path="/" element={<StationPage />} />
                <Route path="/crew" element={<CrewPage />} />
                <Route path="/crew/:id" element={<AgentPage />} />
                {SCREENS.filter((s) => s.phase !== undefined).map((s) => (
                  <Route
                    key={s.path}
                    path={`${s.path}/*`}
                    element={<Placeholder label={s.label} phase={s.phase ?? 0} />}
                  />
                ))}
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
  );
}
