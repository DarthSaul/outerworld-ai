/** What the map or panel currently has selected. One selection at a time (design spec §08). */
export type SelectionKind = "team" | "agent" | "grant" | "handoff" | "overseer";

export interface Selection {
  readonly kind: SelectionKind;
  readonly id: string;
}

export const isSelected = (
  selection: Selection | null | undefined,
  kind: SelectionKind,
  id: string,
): boolean => selection?.kind === kind && selection.id === id;
