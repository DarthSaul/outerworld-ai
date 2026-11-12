import type { ReactNode } from "react";

/**
 * An interior window of a screen: on desktop the shell is exactly the viewport (header and footer
 * always in view) and the page between them does not scroll, so each screen puts its scrolling
 * content in one of these. On phones the page scrolls as a whole, so this is a plain column there.
 */
export function ScrollArea({
  children,
  className = "",
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      data-scroll-area
      className={`relative flex flex-col gap-3.5 desktop:min-h-0 desktop:flex-1 desktop:overflow-y-auto desktop:overscroll-y-contain desktop:pr-1 ${className}`}
    >
      {children}
    </div>
  );
}
