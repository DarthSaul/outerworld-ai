import { term } from "@darthsaul/outerworld-ai-core";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatUsd } from "../components/format.js";
import {
  useClearApiKey,
  useSetApiKey,
  useSettings,
  useSpend,
  useStationView,
  useUpdateBudgets,
} from "../queries.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

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
    <section aria-labelledby="budgets-title" className="flex flex-col gap-(--ow-space-2)">
      <h2 id="budgets-title" className="font-mono text-eyebrow uppercase text-ink-3">
        {term("budgets")}
      </h2>
      <p className="text-label text-ink-2">{term("budgets.hint")}</p>
      <form onSubmit={submit} className="flex flex-col gap-(--ow-space-2)">
        <div className="flex flex-wrap items-end gap-(--ow-space-3)">
          {CAPS.map(([cap, label]) => (
            <label key={cap} className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
              {term(label)}
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                className="h-(--ow-size-control-h-dense) rounded-control border border-border-subtle bg-surface-raised px-(--ow-space-2) font-mono text-mono text-ink-1"
                value={value(cap)}
                onChange={(e) => setDraft((d) => ({ ...d, [cap]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="text-caption text-ink-2">{term("budgets.none")}</p>
        {spend.data ? (
          <p className="font-mono text-mono text-ink-1">
            {term("budgets.today")}: {formatUsd(spend.data.stationUsd)}
          </p>
        ) : null}
        <div className="flex items-center gap-(--ow-space-2)">
          <button type="submit" className={button} disabled={update.isPending}>
            {term("budgets.save")}
          </button>
          {update.isSuccess && Object.keys(draft).length === 0 ? (
            <span role="status" className="text-label text-ink-2">
              {term("budgets.saved")}
            </span>
          ) : null}
        </div>
        <ErrorNote error={update.error} />
      </form>
    </section>
  );
}

/** Settings: which models runs use, the OpenRouter key (set once, never shown), and budgets. */
export function SettingsPage() {
  const settings = useSettings();
  const setKey = useSetApiKey();
  const clearKey = useClearApiKey();
  const client = useQueryClient();
  const [key, setKeyText] = useState("");
  const refresh = () => void client.invalidateQueries({ queryKey: ["settings"] });

  if (settings.isPending) return <p className="text-body text-ink-2">Loading…</p>;
  if (settings.error) return <ErrorNote error={settings.error} />;
  const { modelMode, openrouter } = settings.data;
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
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-5)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term("settings")}
      </h1>
      <section aria-labelledby="models-title" className="flex flex-col gap-(--ow-space-1)">
        <h2 id="models-title" className="font-mono text-eyebrow uppercase text-ink-3">
          {term("settings.models")}
        </h2>
        <p className="text-body text-ink-1" data-model-mode={modelMode}>
          {term(`settings.model.${modelMode}`)}
        </p>
      </section>
      <section aria-labelledby="key-title" className="flex flex-col gap-(--ow-space-2)">
        <h2 id="key-title" className="font-mono text-eyebrow uppercase text-ink-3">
          {term("settings.key")}
        </h2>
        <p role="status" aria-label="Key status" className="text-body text-ink-1">
          {openrouter.source
            ? term(`settings.key.${openrouter.source}`)
            : term("settings.key.none")}
        </p>
        {openrouter.keychainError ? (
          <p className="text-caption text-ink-2">
            Keychain unavailable: {openrouter.keychainError}
          </p>
        ) : null}
        <form
          onSubmit={submit}
          aria-label={term("settings.key.save")}
          className="flex flex-wrap items-end gap-(--ow-space-2)"
        >
          <label className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
            {term("settings.key.new")}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="h-(--ow-size-control-h-dense) rounded-control border border-border-subtle bg-surface-raised px-(--ow-space-2) text-body text-ink-1"
              value={key}
              onChange={(e) => setKeyText(e.target.value)}
            />
          </label>
          <button type="submit" className={button} disabled={!key.trim() || setKey.isPending}>
            {term("settings.key.save")}
          </button>
          {openrouter.source === "keychain" ? (
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
        <p className="text-caption text-ink-2">{term("settings.key.hint")}</p>
        <ErrorNote error={setKey.error ?? clearKey.error} />
      </section>
      <BudgetsSection />
    </section>
  );
}
