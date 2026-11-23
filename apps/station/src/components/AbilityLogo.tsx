import type { AbilityBrand } from "@darthsaul/outerworld-ai-core";
import { BrandIcon, PixelIcon, type PixelIconName } from "@darthsaul/outerworld-ai-ui";

/**
 * An ability's logo in its tile, the same wherever an ability is listed (Abilities, a crew
 * member's Connectors, a room's props): the service's own mark, the given pixel icon (a prop),
 * or the plug for a server with no preset.
 */
export function AbilityLogo({
  brand,
  icon = "connector",
}: {
  readonly brand?: AbilityBrand | undefined;
  /** Drawn when there is no brand. */
  readonly icon?: PixelIconName;
}) {
  return (
    <span
      data-ability-logo={brand ?? icon}
      className="flex shrink-0 border-2 border-line-soft bg-tile p-2 text-fg-hi"
    >
      {brand ? <BrandIcon brand={brand} /> : <PixelIcon name={icon} size="lg" className="m-0.5" />}
    </span>
  );
}
