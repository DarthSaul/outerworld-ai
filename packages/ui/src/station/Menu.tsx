import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { tabClass } from "./buttons.js";

const ITEM = '[role="menuitem"]';

const itemsIn = (menu: HTMLElement | null) => [
  ...(menu?.querySelectorAll<HTMLElement>(ITEM) ?? []),
];

export interface MenuButtonProps {
  /** The button's visible words. */
  readonly label: ReactNode;
  /** A glyph before the label. */
  readonly icon?: ReactNode;
  /** Filled like an active tab: one of the menu's destinations is the current page. */
  readonly active?: boolean;
  /** Where the menu opens: over the button (default, for the footer) or under it. */
  readonly placement?: "above" | "below";
  /**
   * The items: links or buttons with `role="menuitem"`, usually styled with `menuItemClass` and
   * filled with `MenuItemBody`. Choosing one closes the menu.
   */
  readonly children: ReactNode;
}

/**
 * A tab-styled button that opens a small menu of destinations (the footer's System menu). The
 * menu is in the page only while open. Keyboard: Enter, Space, or ↓ open it on the first item, ↑
 * on the last; in the menu ↓ ↑ Home End move, Enter or Space choose, Escape closes and returns to
 * the button, Tab closes and moves on. A click outside closes it.
 */
export function MenuButton({
  label,
  icon,
  active = false,
  placement = "above",
  children,
}: MenuButtonProps) {
  const id = useId();
  const [open, setOpen] = useState<false | "first" | "last">(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  // On open, focus moves into the menu.
  useEffect(() => {
    if (!open) return;
    const list = itemsIn(menu.current);
    (open === "last" ? list.at(-1) : list[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") setOpen("first");
    else if (e.key === "ArrowUp") setOpen("last");
    else return;
    e.preventDefault();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = itemsIn(menu.current);
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(list.length - 1);
    else if (e.key === "Escape") close(true);
    // Space chooses the item, as Enter does; Enter is left to the link itself, so it acts once.
    else if (e.key === " ") list[at]?.click();
    else if (e.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  // Choosing an item closes the menu; the item itself does the navigating.
  const onMenuClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest(ITEM)) setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open !== false}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close(false) : setOpen("first"))}
        onKeyDown={onButtonKey}
        className={`${tabClass(active || open !== false, "map")} inline-flex items-center gap-1.5`}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <div
          ref={menu}
          id={`${id}-menu`}
          role="menu"
          aria-label={typeof label === "string" ? label : undefined}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          onClick={onMenuClick}
          className={`absolute left-0 z-30 flex w-max min-w-60 max-w-[min(22rem,85vw)] flex-col gap-1 border-2 border-cyan bg-panel p-1 shadow-panel ${
            placement === "above" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Classes for a menu item: a quiet row, outlined on hover and focus, marked when current. */
export function menuItemClass(current = false): string {
  return `grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 border-2 px-2 py-1.5 text-left no-underline outline-none hover:border-cyan hover:bg-hover focus-visible:border-cyan focus-visible:bg-hover ${
    current ? "border-line-soft bg-well" : "border-transparent"
  }`;
}

/** A menu item's content: the icon beside a title over a subtitle. */
export function MenuItemBody({
  icon,
  title,
  subtitle,
}: {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly subtitle: ReactNode;
}) {
  return (
    <>
      <span aria-hidden="true" className="row-span-2 self-center text-cyan">
        {icon}
      </span>
      <span className="font-display text-d8 text-fg-hi uppercase">{title}</span>
      <span className="text-b15 text-fg-mute">{subtitle}</span>
    </>
  );
}
