import { type GlossaryKey, term } from "@darthsaul/outerworld-ai-core";
import type { ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { ScrollArea } from "./ScrollArea.js";

export interface Section {
  /** The route segment under the screen's base path. */
  readonly path: string;
  readonly label: GlossaryKey;
  readonly element: ReactNode;
}

/** A side menu entry: larger than a header tab, full width of the menu on desktop. */
const sideLink = (active: boolean) =>
  `block border-2 border-cyan px-4 py-3 font-display text-d10 uppercase no-underline desktop:w-full ${
    active ? "bg-cyan text-ink" : "bg-transparent text-cyan hover:bg-btn-hover"
  }`;

/**
 * A System screen (Settings, Abilities): the title, a side menu of sections, each its own route
 * under `base`, and the chosen one in the main panel. The bare base path, or an unknown section,
 * opens the first section.
 */
export function SectionLayout({
  title,
  navLabel,
  base,
  sections,
}: {
  readonly title: GlossaryKey;
  readonly navLabel: GlossaryKey;
  /** The screen's path, e.g. `/system/settings`. */
  readonly base: string;
  readonly sections: readonly Section[];
}) {
  const first = `${base}/${sections[0]?.path ?? ""}`;
  return (
    <section
      aria-labelledby="screen-title"
      className="flex flex-col gap-3.5 desktop:min-h-0 desktop:flex-1"
    >
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2"
      >
        {term(title)}
      </h1>
      <div className="flex flex-col gap-3.5 desktop:grid desktop:min-h-0 desktop:flex-1 desktop:grid-cols-[auto_minmax(0,1fr)] desktop:grid-rows-[minmax(0,1fr)] desktop:items-stretch">
        <nav aria-label={term(navLabel)} className="desktop:w-60">
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0 desktop:flex-col">
            {sections.map((s) => (
              <li key={s.path}>
                <NavLink to={`${base}/${s.path}`} className={({ isActive }) => sideLink(isActive)}>
                  {term(s.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <ScrollArea className="min-w-0">
          <Routes>
            <Route index element={<Navigate to={first} replace />} />
            {sections.map((s) => (
              <Route key={s.path} path={`${s.path}/*`} element={s.element} />
            ))}
            <Route path="*" element={<Navigate to={first} replace />} />
          </Routes>
        </ScrollArea>
      </div>
    </section>
  );
}
