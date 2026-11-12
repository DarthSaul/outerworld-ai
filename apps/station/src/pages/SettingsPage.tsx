import { routeModel, term } from "@darthsaul/outerworld-ai-core";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatUsd } from "../components/format.js";
import { ScrollArea } from "../components/ScrollArea.js";
import { DISPLAY_SIZES, useDisplay } from "../lib/display.js";
import {
  type KeyProviderName,
  useClearApiKey,
  useModels,
  useSetApiKey,
  useSettings,
  useSpend,
  useStationView,
  useUpdateBudgets,
} from "../queries.js";
import { ConnectorsSection } from "./ConnectorsSection.js";

const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase no-underline hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";

const CAPS = [
  ["perRunUsd", "budgets.perRun"],
  ["perAgentDailyUsd", "budgets.perAgentDaily"],
  ["stationDailyUsd", "budgets.stationDaily"],
] as const;
type Cap = (typeof CAPS)[number][0];

/** The three spend caps in station.json (brief §15). Empty means no cap. */
function BudgetsSection() {
  const station = useStationView();
  const spend = useSpend();
  const update = useUpdateBudgets();
  const client = useQueryClient();
  const saved = station.data?.station?.budgets;
  const [draft, setDraft] = useState<Partial<Record<Cap, string>>>({});
  const value = (cap: Cap) => draft[cap] ?? (saved?.[cap] !== undefined ? String(saved[cap]) : "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = Object.fromEntries(
      CAPS.map(([cap]) => [cap, value(cap).trim() === "" ? null : Number(value(cap))]),
    ) as Record<Cap, number | null>;
    update.mutate(input, {
      onSuccess: () => {
        setDraft({});
        void client.invalidateQueries({ queryKey: ["station"] });
      },
    });
  };
  if (!station.data?.station) return null;
  return (
    <section
      aria-labelledby="budgets-title"
      className="flex flex-col gap-2 border-2 border-line bg-panel p-3 shadow-panel"
    >
      <h2
        id="budgets-title"
        className="m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
      >
        {term("budgets")}
      </h2>
      <p className="m-0 text-b17 text-fg-soft">{term("budgets.hint")}</p>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-3">
          {CAPS.map(([cap, label]) => (
            <label
              key={cap}
              className="flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase"
            >
              {term(label)}
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                className="min-w-0 border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi"
                value={value(cap)}
                onChange={(e) => setDraft((d) => ({ ...d, [cap]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="m-0 text-b17 text-fg-mute">{term("budgets.none")}</p>
        {spend.data ? (
          <p className="m-0 text-b19 text-fg">
            {term("budgets.today")}: {formatUsd(spend.data.stationUsd)}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button type="submit" className={button} disabled={update.isPending}>
            {term("budgets.save")}
          </button>
          {update.isSuccess && Object.keys(draft).length === 0 ? (
            <span role="status" className="m-0 text-b17 text-fg-soft">
              {term("budgets.saved")}
            </span>
          ) : null}
        </div>
        <ErrorNote error={update.error} />
      </form>
    </section>
  );
}

const panel = "flex flex-col gap-2 border-2 border-line bg-panel p-3 shadow-panel";
const heading = "m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1";

/** One provider's key: whether it is set and where from, a form to replace it, and removal. */
function KeyCard({ provider }: { readonly provider: KeyProviderName }) {
  const settings = useSettings();
  const setKey = useSetApiKey(provider);
  const clearKey = useClearApiKey(provider);
  const client = useQueryClient();
  const [key, setKeyText] = useState("");
  const refresh = () => void client.invalidateQueries({ queryKey: ["settings"] });
  if (!settings.data) return null;
  const status = settings.data[provider];
  const titleId = `key-${provider}-title`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setKey.mutate(key, {
      onSuccess: () => {
        setKeyText("");
        refresh();
      },
    });
  };
  return (
    <section aria-labelledby={titleId} className={panel} data-provider={provider}>
      <h2 id={titleId} className={heading}>
        {term(`settings.key.${provider}`)}
      </h2>
      <p
        role="status"
        aria-label={`${term(`settings.key.${provider}`)} status`}
        className="m-0 text-b19 text-fg-hi"
      >
        {status.source === "keychain"
          ? term("settings.key.keychain")
          : status.source === "env"
            ? term(`settings.key.env.${provider}`)
            : term("settings.key.none")}
      </p>
      {status.keychainError ? (
        <p className="m-0 text-b17 text-fg-mute">Keychain unavailable: {status.keychainError}</p>
      ) : null}
      <form
        onSubmit={submit}
        aria-label={`${term("settings.key.save")}: ${term(`settings.key.${provider}`)}`}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase">
          {term("settings.key.new")}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi"
            value={key}
            onChange={(e) => setKeyText(e.target.value)}
          />
        </label>
        <button type="submit" className={button} disabled={!key.trim() || setKey.isPending}>
          {term("settings.key.save")}
        </button>
        {status.source === "keychain" ? (
          <button
            type="button"
            className={button}
            disabled={clearKey.isPending}
            onClick={() => clearKey.mutate(undefined, { onSuccess: refresh })}
          >
            {term("settings.key.remove")}
          </button>
        ) : null}
      </form>
      <p className="m-0 text-b17 text-fg-mute">{term(`settings.key.hint.${provider}`)}</p>
      <ErrorNote error={setKey.error ?? clearKey.error} />
    </section>
  );
}

/** Providers: the Anthropic and OpenRouter keys (ADR-0015). */
function ProvidersSection() {
  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-b17 text-fg-soft">{term("settings.providers.hint")}</p>
      <KeyCard provider="anthropic" />
      <KeyCard provider="openrouter" />
    </div>
  );
}

/** Models: the run mode, and where each supported model's calls go with today's keys. */
function ModelsSection() {
  const settings = useSettings();
  const models = useModels();
  if (!settings.data) return null;
  const { modelMode, anthropic, openrouter } = settings.data;
  const keys = { anthropic: anthropic.configured, openrouter: openrouter.configured };
  const where = (id: string) => {
    if (modelMode === "fake") return term("settings.route.fake");
    const route = routeModel(id, keys);
    return route.ok
      ? term(`settings.route.${route.provider}`)
      : term(`settings.route.${route.reason}`);
  };
  return (
    <section aria-labelledby="models-title" className={panel}>
      <h2 id="models-title" className={heading}>
        {term("settings.models")}
      </h2>
      <p className="m-0 text-b19 text-fg-hi" data-model-mode={modelMode}>
        {term(`settings.model.${modelMode}`)}
      </p>
      <p className="m-0 text-b17 text-fg-soft">{term("settings.models.hint")}</p>
      <ErrorNote error={models.error} />
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {(models.data ?? []).map((m) => (
          <li
            key={m.id}
            data-model={m.id}
            className="flex flex-wrap justify-between gap-2 border-line-soft border-b-2 py-1 text-b19"
          >
            <span className="text-fg-hi">{m.label}</span>
            <span className="text-fg-soft">{where(m.id)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Appearance › Display: the whole app's size, per browser (lib/display.ts). */
function AppearanceSection() {
  const [size, setSize] = useDisplay();
  return (
    <section aria-labelledby="display-title" className={panel}>
      <h2 id="display-title" className={heading}>
        {term("settings.display")}
      </h2>
      <p className="m-0 text-b17 text-fg-soft">{term("settings.display.hint")}</p>
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">{term("settings.display")}</legend>
        {DISPLAY_SIZES.map((d) => (
          <label
            key={d}
            className={`cursor-pointer border-2 px-3 py-2 font-display text-d8 uppercase has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan ${
              size === d
                ? "border-cyan bg-cyan text-ink"
                : "border-cyan bg-transparent text-cyan hover:bg-btn-hover"
            }`}
          >
            <input
              type="radio"
              name="display-size"
              value={d}
              checked={size === d}
              onChange={() => setSize(d)}
              className="sr-only"
            />
            {term(`display.${d}`)}
          </label>
        ))}
      </fieldset>
    </section>
  );
}

const SECTIONS = [
  { path: "providers", label: "settings.providers" },
  { path: "models", label: "settings.models" },
  { path: "budgets", label: "budgets" },
  { path: "connectors", label: "connectors" },
  { path: "appearance", label: "settings.appearance" },
] as const;

/** A side menu entry: larger than a header tab, full width of the menu on desktop. */
const sideLink = (active: boolean) =>
  `block border-2 border-cyan px-4 py-3 font-display text-d10 uppercase no-underline desktop:w-full ${
    active ? "bg-cyan text-ink" : "bg-transparent text-cyan hover:bg-btn-hover"
  }`;

/**
 * Settings (ADR-0015): a side menu of sections, each its own route under `/settings/`, with the
 * chosen one in the main panel. `/settings` opens Providers.
 */
export function SettingsPage() {
  const settings = useSettings();
  if (settings.isPending) return <p className="m-0 text-b19 text-fg-soft">Loading…</p>;
  if (settings.error) return <ErrorNote error={settings.error} />;
  return (
    <section
      aria-labelledby="screen-title"
      className="flex flex-col gap-3.5 desktop:min-h-0 desktop:flex-1"
    >
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2"
      >
        {term("settings")}
      </h1>
      <div className="flex flex-col gap-3.5 desktop:grid desktop:min-h-0 desktop:flex-1 desktop:grid-cols-[auto_minmax(0,1fr)] desktop:grid-rows-[minmax(0,1fr)] desktop:items-stretch">
        <nav aria-label={term("settings.nav")} className="desktop:w-60">
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0 desktop:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink
                  to={`/settings/${s.path}`}
                  className={({ isActive }) => sideLink(isActive)}
                >
                  {term(s.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <ScrollArea className="min-w-0">
          <Routes>
            <Route index element={<Navigate to="/settings/providers" replace />} />
            <Route path="providers" element={<ProvidersSection />} />
            <Route path="models" element={<ModelsSection />} />
            <Route path="budgets" element={<BudgetsSection />} />
            <Route path="connectors" element={<ConnectorsSection />} />
            <Route path="appearance" element={<AppearanceSection />} />
            <Route path="*" element={<Navigate to="/settings/providers" replace />} />
          </Routes>
        </ScrollArea>
      </div>
    </section>
  );
}
