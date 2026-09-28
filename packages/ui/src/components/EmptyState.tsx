import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** A noun, from the glossary. */
  readonly title: string;
  /** One sentence of consequence. */
  readonly body: string;
  /** At most one primary action. No illustration (design spec §08). */
  readonly action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-(--ow-space-2) rounded-panel border border-border-subtle p-(--ow-space-4)"
    >
      <h3 className="text-heading text-ink-1">{title}</h3>
      <p className="max-w-(--ow-measure) text-body text-ink-2">{body}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
