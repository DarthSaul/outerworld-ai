import type { ItemIconName } from "@darthsaul/outerworld-ai-core";

/**
 * Every icon is a standard emoji (ADR-0026): the menu's and each capability icon id in core's
 * catalog (`toolDisplay`, `propDisplay`, `connectorDisplay`). Emoji take `U+FE0F` where they need
 * it to draw in color rather than as text. Service logos stay `BrandIcon`; characters stay sprites.
 */
export const ICON_EMOJI = {
  gear: "⚙️", // ⚙️ Settings, and the System menu
  bolt: "⚡", // ⚡ Abilities
  dispatch: "\u{1F4E8}", // 📨
  session: "\u{1F4AC}", // 💬
  web: "\u{1F310}", // 🌐
  files: "\u{1F5C2}️", // 🗂️
  "file-read": "\u{1F4D6}", // 📖
  "file-list": "\u{1F4CB}", // 📋
  "file-write": "✏️", // ✏️
  memory: "\u{1F9E0}", // 🧠
  skill: "\u{1F4D8}", // 📘
  connector: "\u{1F50C}", // 🔌
  tool: "\u{1F527}", // 🔧
} as const satisfies Record<"gear" | "bolt" | ItemIconName, string>;

export type IconName = keyof typeof ICON_EMOJI;
export const ICONS = Object.keys(ICON_EMOJI) as IconName[];

const SIZES = { sm: "text-b15", md: "text-b18", lg: "text-b22" } as const;

export interface IconProps {
  readonly name: IconName;
  readonly size?: keyof typeof SIZES;
  readonly className?: string;
}

/** One emoji, in the emoji font, one line high. Decorative: the text beside it names it. */
export function Icon({ name, size = "md", className = "" }: IconProps) {
  return (
    <span
      aria-hidden="true"
      data-icon={name}
      className={`inline-block shrink-0 font-emoji leading-none ${SIZES[size]} ${className}`}
    >
      {ICON_EMOJI[name]}
    </span>
  );
}
