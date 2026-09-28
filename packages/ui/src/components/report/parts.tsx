import type { Station, StationState } from "@darthsaul/outerworld-ai-core";
import { type ReactNode, useId } from "react";
import { EmptyState } from "../EmptyState.js";
import type { Selection } from "../selection.js";

/** What every report view receives. */
export interface ReportProps {
  readonly station: Station;
  readonly state: StationState;
  readonly onSelect: (selection: Selection) => void;
}

export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return (
    <p className="font-mono text-eyebrow uppercase text-ink-3" data-eyebrow>
      {children}
    </p>
  );
}

/** A titled region of a report. The heading id is generated, so two panels can coexist. */
export function Region({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-(--ow-space-2)">
      <h3 id={id} className="font-mono text-eyebrow uppercase text-ink-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The anti-streaming promise made visible: what we know, from where, as of when. */
export function ProofLine({
  state,
  path,
}: {
  readonly state: StationState;
  readonly path: string;
}) {
  return (
    <p className="flex flex-wrap gap-(--ow-space-2) font-mono text-mono text-ink-3" data-proof-line>
      <span>{state.provenance.asOf}</span>
      <span aria-hidden="true">·</span>
      <span>{path}</span>
      {state.provenance.sourceRef ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{state.provenance.sourceRef}</span>
        </>
      ) : null}
    </p>
  );
}

export function LinkButton({
  onClick,
  children,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control px-(--ow-space-2) py-(--ow-space-1) text-left text-label text-ink-1 underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

/** A list of things that each select something when clicked. */
export function LinkList<T>({
  items,
  keyOf,
  onPick,
  children,
}: {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly onPick: (item: T) => void;
  readonly children: (item: T) => ReactNode;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={keyOf(item)}>
          <LinkButton onClick={() => onPick(item)}>{children(item)}</LinkButton>
        </li>
      ))}
    </ul>
  );
}

export function Quiet({ children }: { readonly children: ReactNode }) {
  return <p className="text-caption text-ink-3">{children}</p>;
}

export function Missing() {
  return (
    <EmptyState
      title="Not in this station"
      body="The selection refers to something the station document no longer has."
    />
  );
}
