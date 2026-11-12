import {
  findModel,
  type ModelSettings,
  ProviderChoice,
  ReasoningLevel,
  resolveModelSettings,
  routeModel,
  term,
} from "@darthsaul/outerworld-ai-core";
import { Dropdown, type DropdownGroup } from "@darthsaul/outerworld-ai-ui";
import { useId } from "react";
import { useModels, useSettings } from "../queries.js";

/** The model menu's "crew member's default" entry (Dropdown treats "" as nothing chosen). */
const CREW_DEFAULT = "crew-default";

/** Drops fields left at their default, so "all defaults" is stored as no settings at all. */
export function normalizeModelSettings(settings: ModelSettings): ModelSettings | null {
  const next: { -readonly [K in keyof ModelSettings]: ModelSettings[K] } = {};
  if (settings.model) next.model = settings.model;
  if (settings.provider && settings.provider !== "auto") next.provider = settings.provider;
  if (settings.reasoning && settings.reasoning !== "default") next.reasoning = settings.reasoning;
  return Object.keys(next).length > 0 ? next : null;
}

const labelOf = (id: string) => findModel(id)?.label ?? id;

const single = (options: DropdownGroup["options"]): DropdownGroup[] => [
  { id: "all", label: "", options },
];

/**
 * Model, reasoning level, and key for one conversation or one scheduled job (ADR-0016), laid out
 * like a chat app's composer foot: where the next call goes on the left; on the right the model
 * with its reasoning level, then the key, each a compact menu that opens upward with a line on
 * what each choice means. `onChange` gets `null` when every field is on its default.
 */
export function ModelPicker({
  value,
  agentModel,
  onChange,
  legend = term("model.settings"),
  compact = false,
}: {
  readonly value: ModelSettings | undefined;
  readonly agentModel: string;
  readonly onChange: (next: ModelSettings | null) => void;
  readonly legend?: string;
  /**
   * A narrow panel: one line, and the route note only when it is a warning (a missing key);
   * otherwise screen readers still hear it as the group's description.
   */
  readonly compact?: boolean;
}) {
  const id = useId();
  const models = useModels();
  const settings = useSettings();
  const current = value ?? {};
  const set = (patch: Partial<ModelSettings>) =>
    onChange(normalizeModelSettings({ ...current, ...patch }));
  const resolved = resolveModelSettings(agentModel, value);

  let route: { text: string; ok: boolean } | undefined;
  if (settings.data?.modelMode === "fake") {
    route = { text: term("settings.route.fake"), ok: true };
  } else if (settings.data) {
    const r = routeModel(
      resolved.model,
      {
        anthropic: settings.data.anthropic.configured,
        openrouter: settings.data.openrouter.configured,
      },
      resolved.provider,
    );
    route = r.ok
      ? { text: `${term("model.via")} ${term(`settings.route.${r.provider}`)}`, ok: true }
      : { text: term(`settings.route.${r.reason}`), ok: false };
  }

  const list = models.data ?? [];
  const custom = current.model && !list.some((m) => m.id === current.model) ? current.model : null;
  const modelOptions = single([
    {
      value: CREW_DEFAULT,
      label: labelOf(agentModel),
      text: `${labelOf(agentModel)}, ${term("model.model.crewDefault")}`,
      description: term("model.model.crewDefault"),
    },
    // The crew member's own model is the default entry above; it is not listed twice.
    ...list
      .filter((m) => m.id !== agentModel)
      .map((m) => ({ value: m.id, label: m.label, text: m.label, description: m.blurb })),
    ...(custom ? [{ value: custom, label: custom, text: custom }] : []),
  ]);
  const reasoningOptions = single(
    ReasoningLevel.options.map((r) => ({
      value: r,
      label: term(`model.reasoning.${r}`),
      text: term(`model.reasoning.${r}`),
      description: term(`model.reasoning.${r}.hint`),
    })),
  );
  const keyOptions = single(
    ProviderChoice.options.map((p) => ({
      value: p,
      label: term(`model.provider.${p}`),
      text: term(`model.provider.${p}`),
      description: term(`model.provider.${p}.hint`),
    })),
  );

  return (
    <fieldset
      aria-describedby={`${id}-route`}
      className={`m-0 flex min-w-0 items-center justify-between gap-x-3 gap-y-1 border-0 p-0 ${compact ? "flex-nowrap" : "flex-wrap"}`}
      data-model-picker
    >
      <legend className="sr-only">{legend}</legend>
      <span
        id={`${id}-route`}
        data-route-ok={route?.ok ?? true}
        className={`min-w-0 text-b15 ${route && !route.ok ? "truncate text-amber" : compact ? "sr-only" : "text-fg-mute"}`}
      >
        {route?.text ?? ""}
      </span>
      <div
        className={`ml-auto flex items-center justify-end gap-1 ${compact ? "shrink-0 flex-nowrap" : "flex-wrap"}`}
      >
        <span id={`${id}-model`} className="sr-only">
          {term("model.model")}
        </span>
        <span id={`${id}-reasoning`} className="sr-only">
          {term("model.reasoning")}
        </span>
        <span id={`${id}-key`} className="sr-only">
          {term("model.provider")}
        </span>
        {/* The model and how hard it thinks read as one setting, like "Opus 5.5 · High". */}
        <div className="flex items-center border-2 border-line-faint bg-well">
          <Dropdown
            variant="chip"
            placement="above"
            align="end"
            labelledBy={`${id}-model`}
            value={current.model ?? CREW_DEFAULT}
            placeholder={term("model.model")}
            groups={modelOptions}
            onChange={(v) => set({ model: v === CREW_DEFAULT ? undefined : v })}
          />
          <span aria-hidden="true" className="h-4 w-0.5 bg-line-faint" />
          <Dropdown
            variant="chip"
            placement="above"
            align="end"
            labelledBy={`${id}-reasoning`}
            value={current.reasoning ?? "default"}
            placeholder={term("model.reasoning")}
            groups={reasoningOptions}
            onChange={(v) => set({ reasoning: ReasoningLevel.parse(v) })}
          />
        </div>
        <Dropdown
          variant="chip"
          placement="above"
          align="end"
          labelledBy={`${id}-key`}
          value={current.provider ?? "auto"}
          placeholder={term("model.provider")}
          groups={keyOptions}
          onChange={(v) => set({ provider: ProviderChoice.parse(v) })}
        />
      </div>
    </fieldset>
  );
}
