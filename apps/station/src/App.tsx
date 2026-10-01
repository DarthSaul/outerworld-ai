import { type GlossaryKey, term } from "@darthsaul/outerworld-ai-core";
import {
  CrtToggle,
  StationHeader,
  StationVitals,
  StopButton,
  tabClass,
} from "@darthsaul/outerworld-ai-ui";
import { lazy, type ReactNode, Suspense } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router";
import { CommsPage } from "./comms/CommsPage.js";
import { ErrorNote } from "./components/ErrorNote.js";
import { useDaemon } from "./daemon-context.js";
import { AgentPage } from "./pages/AgentPage.js";
import { ConnectorsPage } from "./pages/ConnectorsPage.js";
import { CrewPage } from "./pages/CrewPage.js";
import { CrewSelectPage } from "./pages/CrewSelectPage.js";
import { MemoryPage } from "./pages/MemoryPage.js";
import { NotificationsPage } from "./pages/NotificationsPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { StationPage } from "./pages/StationPage.js";
import {
  useHealth,
  useKillSwitch,
  useNotifications,
  useSetKillSwitch,
  useSpend,
  useStationView,
} from "./queries.js";
import { useCrt, useDashboard, useRadio } from "./station/use-dashboard.js";

const Gallery = lazy(() => import("./dev/GalleryPage.js"));

/**
 * The page tabs: the design's two (Station, Crew Select), then the other v1 screens in the same
 * row (D26).
 */
export const SCREENS: ReadonlyArray<{ path: string; label: GlossaryKey }> = [
  { path: "/", label: "tab.station" },
  { path: "/crew-select", label: "tab.crewSelect" },
  { path: "/comms", label: "comms" },
  { path: "/crew", label: "agents" },
  { path: "/memory", label: "memory" },
  { path: "/notifications", label: "notifications" },
  { path: "/connectors", label: "connectors" },
  { path: "/settings", label: "settings" },
];

/** The unread count beside Notifications; read aloud as "N unread". */
function UnreadBadge() {
  const feed = useNotifications();
  const unread = feed.data?.pages[0]?.unread ?? 0;
  if (unread === 0) return null;
  return (
    <span className="ml-1 bg-red px-1 text-on-red">
      {" "}
      {unread > 99 ? "99+" : unread}
      <span className="sr-only"> {term("notifications.unread")}</span>
    </span>
  );
}

function StatusBadge() {
  const { status } = useDaemon();
  return (
    <span
      role="status"
      aria-label="Connection"
      className="self-center font-display text-d6 text-fg-mute uppercase"
      data-connection={status}
    >
      {term(`connection.${status}`)}
    </span>
  );
}

function Tabs() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {SCREENS.map((s) => (
        <li key={s.path}>
          <NavLink
            to={s.path}
            end={s.path === "/" || s.path === "/crew"}
            className={({ isActive }) => tabClass(isActive)}
          >
            {term(s.label)}
            {s.path === "/notifications" ? <UnreadBadge /> : null}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Header, page, footer, and the CRT overlay; `data-paused` stops blinking while stopped. */
function Chrome({ children }: { readonly children: ReactNode }) {
  const station = useStationView();
  const { dashboard } = useDashboard();
  const radio = useRadio(dashboard);
  const kill = useKillSwitch();
  const setKill = useSetKillSwitch();
  const spend = useSpend();
  const health = useHealth();
  const [crt, setCrt] = useCrt();
  const navigate = useNavigate();
  const engaged = kill.data?.engaged ?? false;
  const config = station.data?.station;
  return (
    <div className="flex min-h-dvh flex-col" {...(engaged ? { "data-paused": "" } : {})}>
      <StationHeader
        stationName={config?.name ?? ""}
        rooms={config?.rooms.length ?? 0}
        crew={station.data?.agents.length ?? 0}
        tabs={<Tabs />}
        live={dashboard?.liveCount ?? 0}
        alerts={dashboard?.alerts ?? 0}
        radio={radio}
        onOpenRadio={(to) => navigate(to)}
        controls={
          <>
            <StopButton
              stopped={engaged}
              busy={kill.isPending || setKill.isPending}
              onToggle={() => setKill.mutate(!engaged)}
            />
            <CrtToggle on={crt === "on"} onToggle={() => setCrt(crt === "on" ? "off" : "on")} />
            <StatusBadge />
          </>
        }
      />
      <ErrorNote error={setKill.error} />
      <main className="min-w-0 flex-1">{children}</main>
      <StationVitals
        {...(spend.data ? { tokens: spend.data.tokens, spendUsd: spend.data.stationUsd } : {})}
        {...(config?.budgets.stationDailyUsd !== undefined
          ? { capUsd: config.budgets.stationDailyUsd }
          : {})}
        {...(health.data ? { startedAt: health.data.startedAt } : {})}
      />
      {crt === "on" ? <div aria-hidden="true" className="st-crt" /> : null}
    </div>
  );
}

/** Every screen but the Station and Crew Select sits in a padded page area. */
function Page({ children }: { readonly children: ReactNode }) {
  return <div className="p-3.5">{children}</div>;
}

/** An empty station (no station.json yet) shows onboarding instead of the screens. */
function Shell({ children }: { readonly children: ReactNode }) {
  const station = useStationView();
  if (station.isSuccess && !station.data.station) return <OnboardingPage />;
  return children;
}

/** The station shell: header and tabs over the current screen. `/dev` is the component gallery. */
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
          <Shell>
            <Chrome>
              <Routes>
                <Route path="/" element={<StationPage />} />
                <Route path="/crew-select" element={<CrewSelectPage />} />
                <Route
                  path="/comms"
                  element={
                    <Page>
                      <CommsPage />
                    </Page>
                  }
                />
                <Route
                  path="/memory"
                  element={
                    <Page>
                      <MemoryPage />
                    </Page>
                  }
                />
                <Route
                  path="/crew"
                  element={
                    <Page>
                      <CrewPage />
                    </Page>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <Page>
                      <SettingsPage />
                    </Page>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <Page>
                      <NotificationsPage />
                    </Page>
                  }
                />
                <Route
                  path="/connectors"
                  element={
                    <Page>
                      <ConnectorsPage />
                    </Page>
                  }
                />
                <Route
                  path="/crew/:id"
                  element={
                    <Page>
                      <AgentPage />
                    </Page>
                  }
                />
              </Routes>
            </Chrome>
          </Shell>
        }
      />
    </Routes>
  );
}
