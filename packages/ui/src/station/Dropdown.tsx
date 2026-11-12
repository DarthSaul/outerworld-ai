import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export interface DropdownOption {
  readonly value: string;
  /** What the option shows; may be rich (an avatar, a colored status). */
  readonly label: ReactNode;
  /** The option as plain words: its accessible name, and what type-ahead matches. */
  readonly text: string;
}

export interface DropdownGroup {
  readonly id: string;
  /** The heading over the group's options; empty for a list with no headings. */
  readonly label: string;
  readonly options: readonly DropdownOption[];
}

export interface DropdownProps {
  /** The id of the visible label that names the control. */
  readonly labelledBy: string;
  /** The chosen value, or "" for none. */
  readonly value: string;
  /** Shown when nothing is chosen. */
  readonly placeholder: string;
  readonly groups: readonly DropdownGroup[];
  readonly onChange: (value: string) => void;
  readonly className?: string;
}

/**
 * A select drawn in the station's style (ADR-0014): a button that opens a listbox of options under
 * group headings. Keyboard: ↓ ↑ Enter or Space open it; in the list ↓ ↑ Home End move, Enter or
 * Space choose, a letter jumps to the next option starting with it, Escape closes, Tab closes and
 * moves on. Focus moves to the options while it is open and back to the button when it closes; a
 * click outside closes it. Each option's name includes its group, since the headings are visual.
 * The options are in the page only while the list is open.
 */
export function Dropdown({
  labelledBy,
  value,
  placeholder,
  groups,
  onChange,
  className = "",
}: DropdownProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLDivElement | null>>([]);
  const options = useMemo(
    () => groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.label }))),
    [groups],
  );
  const chosen = options.find((o) => o.value === value);
  const chosenIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const show = (index: number) => {
    if (options.length === 0) return;
    setActive(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option) onChange(option.value);
    close(true);
  };

  // The list changed under an open dropdown: keep the active index inside it.
  useEffect(() => {
    setActive((a) => Math.max(0, Math.min(options.length - 1, a)));
  }, [options.length]);

  // While open, the active option holds focus.
  useEffect(() => {
    if (!open) return;
    const item = items.current[active];
    item?.focus();
    item?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) return;
    e.preventDefault();
    show(e.key === "ArrowUp" && !chosen ? options.length - 1 : chosenIndex);
  };
  /** `focused` is the option the key came from, which is what Enter and Space choose. */
  const onOptionKey = (e: KeyboardEvent<HTMLDivElement>, focused: number) => {
    const last = options.length - 1;
    // From the focused option, not `active`: the list may have changed under it. Focus moves
    // directly, since `active` may already hold the destination and not re-run the effect.
    const move = (to: number) => {
      setActive(to);
      items.current[to]?.focus();
    };
    if (e.key === "ArrowDown") move(Math.min(last, focused + 1));
    else if (e.key === "ArrowUp") move(Math.max(0, focused - 1));
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter" || e.key === " ") choose(focused);
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") {
      // Back to the button first, so Tab moves on from the control rather than from the list.
      close(true);
      return;
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const letter = e.key.toLowerCase();
      const order = [...options.slice(focused + 1), ...options.slice(0, focused + 1)];
      const next = order.find((o) => o.text.toLowerCase().startsWith(letter));
      if (next) move(options.indexOf(next));
    } else return;
    e.preventDefault();
  };

  let index = -1;
  return (
    <div ref={root} className={`relative min-w-0 ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${labelledBy} ${id}-value`}
        onClick={() => (open ? close(false) : show(chosenIndex))}
        onKeyDown={onButtonKey}
        className={`flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 border-2 bg-well px-2 text-left font-body text-b19 hover:border-cyan focus-visible:border-cyan ${open ? "border-cyan" : "border-line-soft"}`}
      >
        <span
          id={`${id}-value`}
          className={`flex min-w-0 flex-1 truncate ${chosen ? "text-fg-hi" : "text-fg-mute"}`}
        >
          {chosen ? (
            <>
              <span aria-hidden="true" className="flex min-w-0 flex-1">
                {chosen.label}
              </span>
              <span className="sr-only">{chosen.text}</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        <span aria-hidden="true" className="font-display text-cyan text-d7">
          {open ? "▲" : "▼"}
        </span>
      </button>
      <div
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={labelledBy}
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto border-2 border-cyan bg-panel p-1 shadow-panel"
      >
        {/* Options render only while open: each can draw a character, and a closed list of
            them would weigh down every page that holds a dropdown. */}
        {groups.map((group) =>
          !open || group.options.length === 0 ? null : (
            <div key={group.id} role="presentation">
              {group.label ? (
                <div
                  aria-hidden="true"
                  className="px-1.5 pt-1.5 pb-1 font-display text-d7 text-fg-mute uppercase"
                >
                  {group.label}
                </div>
              ) : null}
              {group.options.map((option) => {
                index++;
                const i = index;
                const selected = option.value === value;
                return (
                  <div
                    key={option.value}
                    ref={(el) => {
                      items.current[i] = el;
                    }}
                    role="option"
                    aria-selected={selected}
                    aria-label={group.label ? `${option.text}, ${group.label}` : option.text}
                    tabIndex={i === active ? 0 : -1}
                    onPointerMove={() => setActive(i)}
                    onClick={() => choose(i)}
                    onKeyDown={(e) => onOptionKey(e, i)}
                    className={`flex cursor-pointer items-center gap-2 border-2 px-1.5 py-1 text-b19 outline-none ${i === active ? "border-cyan bg-hover" : "border-transparent"} ${selected ? "text-fg-hi" : "text-fg"}`}
                  >
                    <span aria-hidden="true" className="w-2 shrink-0 text-cyan">
                      {selected ? "▸" : ""}
                    </span>
                    {option.label}
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
