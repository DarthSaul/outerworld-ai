import type { AbilityBrand } from "@darthsaul/outerworld-ai-core";
import { BrandIcon, PixelIcon } from "@darthsaul/outerworld-ai-ui";

/**
 * An ability's logo in its tile, the same wherever an ability is listed (Abilities, a crew
 * member's Connectors): the service's own mark, or the plug for a server with no preset.
 */
export function AbilityLogo({ brand }: { readonly brand?: AbilityBrand | undefined }) {
  return (
    <span
      data-ability-logo={brand ?? "connector"}
      className="flex shrink-0 border-2 border-line-soft bg-tile p-2 text-fg-hi"
    >
      {brand ? (
        <BrandIcon brand={brand} />
      ) : (
        <PixelIcon name="connector" size="lg" className="m-0.5" />
      )}
    </span>
  );
}
