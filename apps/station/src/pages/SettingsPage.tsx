import { term } from "@darthsaul/outerworld-ai-core";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { useClearApiKey, useSetApiKey, useSettings } from "../queries.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

/** Settings: which models runs use, and the OpenRouter key (set once, never shown). */
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
    </section>
  );
}
