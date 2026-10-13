import { OVERSEER_TONES, type OverseerTone, term } from "@darthsaul/outerworld-ai-core";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  useAddProjectManager,
  useCreateSession,
  useOnboard,
  useSetApiKey,
  useSettings,
} from "../queries.js";

const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase no-underline hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";
const input = "min-w-0 border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";
const label = "flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase";
const panel = "flex flex-col gap-3 border-2 border-line bg-panel p-4 shadow-panel";

/** Step 1: the key. The fake model needs none; a key already configured needs no form. */
function KeyStep({ onDone }: { readonly onDone: () => void }) {
  const settings = useSettings();
  const setKey = useSetApiKey();
  const [key, setKeyText] = useState("");
  if (!settings.data) return <ErrorNote error={settings.error} />;
  const { modelMode, openrouter } = settings.data;
  const ready = modelMode === "fake" || openrouter.configured;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setKey.mutate(key.trim(), { onSuccess: onDone });
  };
  return (
    <section aria-labelledby="key-step" className={panel}>
      <h2 id="key-step" className="m-0 font-display font-normal text-d10 text-cyan uppercase">
        {term("onboarding.key.title")}
      </h2>
      {ready ? (
        <>
          <p className="m-0 text-b19 text-fg-hi">
            {modelMode === "fake" ? term("onboarding.key.fake") : term("onboarding.key.ready")}
          </p>
          <button type="button" className={`${button} self-start`} onClick={onDone}>
            {term("onboarding.continue")}
          </button>
        </>
      ) : (
        <>
          <p className="m-0 text-b19 text-fg-soft">{term("onboarding.key.body")}</p>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <label className={label}>
              {term("settings.key.new")}
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className={input}
                value={key}
                onChange={(e) => setKeyText(e.target.value)}
              />
            </label>
            <button type="submit" className={button} disabled={!key.trim() || setKey.isPending}>
              {term("settings.key.save")}
            </button>
            <button type="button" className={button} onClick={onDone}>
              {term("onboarding.key.later")}
            </button>
          </form>
          <ErrorNote error={setKey.error} />
        </>
      )}
    </section>
  );
}

/** Step 2: name the Overseer and pick a tone; optionally add the Project Manager too. */
function OverseerStep() {
  const onboard = useOnboard();
  const addPm = useAddProjectManager();
  const createSession = useCreateSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [stationName, setStationName] = useState("");
  const [name, setName] = useState("");
  const [tone, setTone] = useState<OverseerTone>("calm");
  const [withPm, setWithPm] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const overseer = await onboard.mutateAsync({
        overseerName: name.trim(),
        tone,
        ...(stationName.trim() ? { stationName: stationName.trim() } : {}),
      });
      if (withPm) await addPm.mutateAsync();
      const session = await createSession.mutateAsync(overseer.id);
      await client.invalidateQueries({ queryKey: ["station"] });
      void navigate(
        `/comms?agent=${encodeURIComponent(overseer.id)}&open=${encodeURIComponent(session.id)}`,
      );
    } catch {
      // The mutation's error is shown below.
    } finally {
      setBusy(false);
    }
  };
  return (
    <form aria-labelledby="overseer-step" onSubmit={(e) => void submit(e)} className={panel}>
      <h2 id="overseer-step" className="m-0 font-display font-normal text-d10 text-cyan uppercase">
        {term("onboarding.overseer.title")}
      </h2>
      <p className="m-0 text-b19 text-fg-soft">{term("onboarding.overseer.body")}</p>
      <label className={label}>
        {term("onboarding.stationName")}
        <input
          className={input}
          value={stationName}
          placeholder="My Station"
          onChange={(e) => setStationName(e.target.value)}
        />
      </label>
      <label className={label}>
        {term("onboarding.overseerName")}
        <input
          className={input}
          value={name}
          required
          aria-describedby="overseer-name-hint"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p id="overseer-name-hint" className="m-0 text-b17 text-fg-mute">
        {term("onboarding.overseerName.hint")}
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-display text-d7 text-fg-mute uppercase">
          {term("onboarding.tone")}
        </legend>
        {OVERSEER_TONES.map((t) => (
          <label key={t} className="flex items-center gap-2 text-b19 text-fg-hi">
            <input
              type="radio"
              name="tone"
              value={t}
              checked={tone === t}
              onChange={() => setTone(t)}
            />
            {term(`tone.${t}`)}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-b19 text-fg-hi">
        <input type="checkbox" checked={withPm} onChange={(e) => setWithPm(e.target.checked)} />
        {term("onboarding.pm")}
      </label>
      <button type="submit" className={`${button} self-start`} disabled={busy || !name.trim()}>
        {term("onboarding.start")}
      </button>
      <ErrorNote error={onboard.error ?? addPm.error ?? createSession.error} />
    </form>
  );
}

/**
 * Onboarding (brief §16 acceptance 1): on a station with no station.json, the key (if runs need
 * one) and then the Overseer, ending in a first chat with it.
 */
export function OnboardingPage() {
  const [step, setStep] = useState<"key" | "overseer">("key");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 bg-bg p-4 text-fg">
      <h1 className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2">
        {term("onboarding.title")}
      </h1>
      {step === "key" ? <KeyStep onDone={() => setStep("overseer")} /> : <OverseerStep />}
    </main>
  );
}
