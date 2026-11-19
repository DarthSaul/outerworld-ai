import { type GlossaryKey, term } from "@darthsaul/outerworld-ai-core";
import {
  CrtToggle,
  MenuButton,
  MenuItemBody,
  menuItemClass,
  PixelIcon,
  type PixelIconName,
  StationHeader,
  StationVitals,
  StatusDrawer,
  StatusDrawerToggle,
  StopButton,
  tabClass,
} from "@darthsaul/outerworld-ai-ui";
import { lazy, type ReactNode, Suspense, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { CommsPage } from "./comms/CommsPage.js";
import { ErrorNote } from "./components/ErrorNote.js";
import { useDaemon } from "./daemon-context.js";
import { ABILITIES_PATH, ROUTES, SETTINGS_PATH, SYSTEM_PATH } from "./lib/routes.js";
import { AbilitiesPage } from "./pages/AbilitiesPage.js";
import { CrewPage } from "./pages/CrewPage.js";
import { MemoryPage } from "./pages/MemoryPage.js";
import { NotificationsPage } from "./pages/NotificationsPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { StationBrokenPage } from "./pages/StationBrokenPage.js";
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
 * The page tabs: the Station, then the other v1 screens in the same row (D26). The crew roster is
 * its own tab name (ADR-0018). Settings and Abilities open from the footer's System menu.
 */
export const SCREENS: ReadonlyArray<{ path: string; label: GlossaryKey }> = [
  { path: "/", label: "tab.station" },
  { path: "/comms", label: "comms" },
  { path: "/crew", label: "tab.crew" },
  { path: "/memory", label: "memory" },
  { path: "/notifications", label: "notifications" },
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
            className={({ isActive }) => tabClass(isActive, "map")}
          >
            {term(s.label)}
            {s.path === "/notifications" ? <UnreadBadge /> : null}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** The System menu's destinations: an icon, a title, and what each holds. */
const SYSTEM_ITEMS: ReadonlyArray<{
  path: string;
  icon: PixelIconName;
  title: GlossaryKey;
  subtitle: GlossaryKey;
}> = [
  { path: SETTINGS_PATH, icon: "sliders", title: "settings", subtitle: "nav.settings.hint" },
  { path: ABILITIES_PATH, icon: "bolt", title: "abilities", subtitle: "abilities.hint" },
];

/** The footer's System button: a menu that routes to Settings or Abilities. */
function SystemMenu() {
  const { pathname } = useLocation();
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return (
    <MenuButton
      label={term("nav.system")}
      icon={<PixelIcon name="gear" size="sm" />}
      active={within(SYSTEM_PATH)}
    >
      {SYSTEM_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          role="menuitem"
          className={({ isActive }) => menuItemClass(isActive)}
        >
          <MenuItemBody
            icon={<PixelIcon name={item.icon} size="lg" />}
            title={term(item.title)}
            subtitle={term(item.subtitle)}
          />
        </NavLink>
      ))}
    </MenuButton>
  );
}

/** Old `/settings/<section>` links land on the same section under System. */
function SettingsRedirect() {
  const rest = useParams()["*"] ?? "";
  if (rest === "connectors" || rest.startsWith("connectors/")) {
    return <Navigate to={ROUTES.installed} replace />;
  }
  return <Navigate to={rest ? `${SETTINGS_PATH}/${rest}` : SETTINGS_PATH} replace />;
}

const DRAWER_ID = "station-status";

/**
 * Header, page, footer, the status drawer, and the CRT overlay; `data-paused` stops blinking
 * while stopped. The kill switch sits at the footer's right end (ADR-0014).
 */
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
  const [drawer, setDrawer] = useState(false);
  const live = dashboard?.liveCount ?? 0;
  const alerts = dashboard?.alerts ?? 0;
  const engaged = kill.data?.engaged ?? false;
  const config = station.data?.station;
  return (
    // Desktop: the shell is exactly the viewport, so the header and footer stay in view and each
    // screen fits between them, scrolling only inside its own windows. Phones scroll the page.
    <div
      className="flex min-h-dvh flex-col desktop:h-dvh desktop:overflow-hidden"
      {...(engaged ? { "data-paused": "" } : {})}
    >
      <StationHeader
        stationName={config?.name ?? ""}
        rooms={config?.rooms.length ?? 0}
        crew={station.data?.agents.length ?? 0}
        tabs={<Tabs />}
        controls={
          <>
            <StatusDrawerToggle
              open={drawer}
              onToggle={() => setDrawer(!drawer)}
              controls={DRAWER_ID}
              live={live}
              alerts={alerts}
            />
            <CrtToggle on={crt === "on"} onToggle={() => setCrt(crt === "on" ? "off" : "on")} />
            <StatusBadge />
          </>
        }
      />
      {/* Laid out like the header and footer bars (padding outside, the app's width inside), so
          every screen's edges line up with theirs. Screens pad only above and below. */}
      <main className="flex min-w-0 flex-1 flex-col px-3.5 desktop:min-h-0 desktop:overflow-hidden">
        <div className="mx-auto flex w-full min-w-0 max-w-app flex-1 flex-col desktop:min-h-0">
          {children}
        </div>
      </main>
      <ErrorNote error={setKill.error} />
      <StationVitals
        {...(spend.data ? { tokens: spend.data.tokens, spendUsd: spend.data.stationUsd } : {})}
        {...(config?.budgets.stationDailyUsd !== undefined
          ? { capUsd: config.budgets.stationDailyUsd }
          : {})}
        {...(health.data ? { startedAt: health.data.startedAt } : {})}
        start={<SystemMenu />}
        controls={
          <StopButton
            stopped={engaged}
            busy={kill.isPending || setKill.isPending}
            onToggle={() => setKill.mutate(!engaged)}
          />
        }
      />
      <StatusDrawer
        id={DRAWER_ID}
        open={drawer}
        onClose={() => setDrawer(false)}
        live={live}
        alerts={alerts}
        radio={radio}
        onOpenRadio={(to) => navigate(to)}
      />
      {crt === "on" ? <div aria-hidden="true" className="st-crt" /> : null}
    </div>
  );
}

/** Every screen but the Station sits in a page area padded above and below. */
function Page({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-1 flex-col py-3.5 desktop:min-h-0">{children}</div>;
}

/**
 * An empty station (no station.json yet) shows onboarding instead of the screens. One whose file
 * is there but does not load says so instead: setting it up again would replace the file.
 */
function Shell({ children }: { readonly children: ReactNode }) {
  const station = useStationView();
  if (station.isSuccess && !station.data.station) {
    return station.data.stationExists ? (
      <StationBrokenPage issues={station.data.issues} />
    ) : (
      <OnboardingPage />
    );
  }
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
                {/* Appearance now lives on each crew member's page (ADR-0017). */}
                <Route path="/crew-select" element={<Navigate to="/crew" replace />} />
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
                <Route path={SYSTEM_PATH} element={<Navigate to={SETTINGS_PATH} replace />} />
                <Route
                  path={`${SETTINGS_PATH}/*`}
                  element={
                    <Page>
                      <SettingsPage />
                    </Page>
                  }
                />
                <Route
                  path={`${ABILITIES_PATH}/*`}
                  element={
                    <Page>
                      <AbilitiesPage />
                    </Page>
                  }
                />
                <Route path="/settings/*" element={<SettingsRedirect />} />
                <Route
                  path="/notifications"
                  element={
                    <Page>
                      <NotificationsPage />
                    </Page>
                  }
                />
                <Route path="/connectors" element={<Navigate to={ROUTES.installed} replace />} />
                <Route
                  path="/crew/:id"
                  element={
                    <Page>
                      <CrewPage />
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
