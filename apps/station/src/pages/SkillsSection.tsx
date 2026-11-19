import {
  GLOSSARY_KEYS,
  type GlossaryKey,
  type SkillListItem,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { Checkbox, EmptyState, PixelIcon, Tag } from "@darthsaul/outerworld-ai-ui";
import { ErrorNote } from "../components/ErrorNote.js";
import { useSetSkill, useSkills } from "../queries.js";

const panel = "flex scroll-mt-3.5 flex-col gap-3 border-2 border-line bg-panel p-3 shadow-panel";
const panelTitle = "m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1";
const groupTitle = "m-0 font-display font-normal text-d7 text-fg-mute uppercase";

const KEYS: ReadonlySet<string> = new Set(GLOSSARY_KEYS);

/** A requirement in words ("a shell"); an unknown one as written. */
const requirementWords = (requirement: string): string => {
  const key = `skill.needs.${requirement}`;
  return KEYS.has(key) ? term(key as GlossaryKey) : requirement;
};

/** "needs a shell and a browser" for what no one (or this crew member) has. */
export const needsWords = (missing: readonly string[]): string =>
  termWith("skill.needs", { what: missing.map(requirementWords).join(" and ") });

function SkillRow({ skill }: { readonly skill: SkillListItem }) {
  const set = useSetSkill();
  const titleId = `skill-${skill.id}`;
  // Back to the default when the choice matches it, so station.json holds only real choices.
  const toggle = () => {
    const next = !skill.globallyEnabled;
    set.mutate({ id: skill.id, enabled: next === skill.default ? null : next });
  };
  const usable = skill.missing.length === 0;
  return (
    <li
      data-skill={skill.id}
      data-enabled={skill.globallyEnabled}
      className={`flex min-w-0 items-start gap-3 border-2 p-2.5 ${skill.globallyEnabled ? "border-cyan bg-active-bg" : "border-line-faint bg-well"}`}
    >
      <PixelIcon name="skill" className="mt-1 shrink-0 text-cyan" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span id={titleId} className="font-display text-cyan text-d9 uppercase">
            {skill.name}
          </span>
          {skill.default ? <Tag>{term("skill.default")}</Tag> : null}
          {skill.override !== null ? <Tag tone="amber">{term("skill.changed")}</Tag> : null}
          {usable ? null : (
            <Tag tone="amber" data-skill-missing>
              {needsWords(skill.missing)}
            </Tag>
          )}
        </div>
        <p className="m-0 text-b17 text-fg-soft">{skill.description}</p>
        <p className="m-0 text-b15 text-fg-mute" data-skill-offered>
          {skill.offeredTo.length
            ? termWith("skill.offeredTo", { count: String(skill.offeredTo.length) })
            : term("skill.offeredToNone")}
        </p>
        <ErrorNote error={set.error} />
      </div>
      <Checkbox
        label={term("skill.onForAll")}
        aria-label={termWith("skill.onForAllName", { name: skill.name })}
        checked={skill.globallyEnabled}
        disabled={set.isPending}
        onChange={toggle}
        className="shrink-0 self-center"
      />
    </li>
  );
}

/**
 * Abilities › Skills (ADR-0023): the bundled library by category. Each skill turns on or off for
 * every crew member here; one crew member gets extra skills on its own Config. A skill that needs
 * a tool no one has says so, and is offered to no one.
 */
export function SkillsSection() {
  const skills = useSkills();
  const list = skills.data ?? [];
  const categories = [...new Set(list.map((s) => s.category))];
  return (
    <section aria-labelledby="skills-title" className={panel}>
      <h2 id="skills-title" className={panelTitle}>
        {term("abilities.skills")}
      </h2>
      <p className="m-0 text-b17 text-fg-soft">{term("abilities.skills.hint")}</p>
      <ErrorNote error={skills.error} />
      {skills.isSuccess && list.length === 0 ? (
        <EmptyState title={term("skills")} body={term("skills.none")} />
      ) : null}
      {categories.map((category) => {
        const id = `skills-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <section key={category} aria-labelledby={id} className="flex flex-col gap-2">
            <h3 id={id} className={groupTitle}>
              {category}
            </h3>
            <ul data-skill-group={category} className="m-0 flex list-none flex-col gap-2 p-0">
              {list
                .filter((s) => s.category === category)
                .map((s) => (
                  <SkillRow key={s.id} skill={s} />
                ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
