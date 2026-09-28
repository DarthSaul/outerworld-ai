import type { ReactNode } from "react";

export interface ScreenFrameProps {
  readonly children: ReactNode;
  /** Small label on the chin, e.g. the product name. */
  readonly label?: string;
}

/**
 * Wraps the whole app in a retro monitor: bezel, curved-corner screen, vignette, power LED.
 * Decorative only; the chin is hidden from assistive tech and the screen is a plain container.
 */
export function ScreenFrame({ children, label }: ScreenFrameProps) {
  return (
    <div className="ow-frame" data-screen-frame>
      <div className="ow-screen">{children}</div>
      <div className="ow-frame-chin" aria-hidden="true">
        <span>{label ?? ""}</span>
        <span className="ow-frame-led" />
      </div>
    </div>
  );
}
