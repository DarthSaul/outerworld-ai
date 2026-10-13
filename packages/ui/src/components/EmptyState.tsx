import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** A noun, from the glossary. */
  readonly title: string;
  /** One sentence of consequence. */
  readonly body: string;
  /** At most one primary action. No illustration. */
  readonly action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col gap-2 border border-line-faint bg-well-2 p-3">
      <h3 className="m-0 font-display font-normal text-d8 text-panel-title uppercase">{title}</h3>
      <p className="m-0 text-b17 text-fg-soft">{body}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
