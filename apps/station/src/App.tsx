import { type GlossaryKey, term } from "@darthsaul/outerworld-ai-core";
import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router";
import { CommsPage } from "./comms/CommsPage.js";
import { KillSwitchBanner, StationControls } from "./components/KillSwitch.js";
import { useDaemon } from "./daemon-context.js";
import { AgentPage } from "./pages/AgentPage.js";
import { ConnectorsPage } from "./pages/ConnectorsPage.js";
import { CrewPage } from "./pages/CrewPage.js";
import { MemoryPage } from "./pages/MemoryPage.js";
import { NotificationsPage } from "./pages/NotificationsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { StationPage } from "./pages/StationPage.js";

const Gallery = lazy(() => import("./dev/GalleryPage.js"));

/** The seven v1 screens (brief §5). */
export const SCREENS: ReadonlyArray<{ path: string; label: GlossaryKey }> = [
  { path: "/", label: "station" },
  { path: "/comms", label: "comms" },
  { path: "/crew", label: "agents" },
  { path: "/memory", label: "memory" },
  { path: "/notifications", label: "notifications" },
  { path: "/connectors", label: "connectors" },
  { path: "/settings", label: "settings" },
];

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
          <div className="flex min-h-dvh flex-col gap-(--ow-space-4) p-(--ow-space-4)">
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
              <div className="flex flex-wrap items-center gap-(--ow-space-3)">
                <StationControls />
                <StatusBadge />
              </div>
            </header>
            <KillSwitchBanner />
            <main className="min-w-0 flex-1 rounded-panel border border-border-subtle bg-surface-panel p-(--ow-space-4)">
              <Routes>
                <Route path="/" element={<StationPage />} />
                <Route path="/comms" element={<CommsPage />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/crew" element={<CrewPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/connectors" element={<ConnectorsPage />} />
                <Route path="/crew/:id" element={<AgentPage />} />
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
  );
}
