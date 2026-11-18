import type { AbilityBrand } from "@darthsaul/outerworld-ai-core";
import { type SimpleIcon, siGithub, siGmail, siNotion } from "simple-icons";

/** Each service's logo, from Simple Icons (CC0; the marks belong to their owners). */
const BRANDS: Readonly<Record<AbilityBrand, SimpleIcon>> = {
  notion: siNotion,
  github: siGithub,
  gmail: siGmail,
};

export interface BrandIconProps {
  readonly brand: AbilityBrand;
  readonly className?: string;
}

/**
 * A service's logo (core's `abilityDisplay` names it), drawn in the current text color rather than
 * the brand's own so it sits in the station's palette. Decorative: the name beside it carries it.
 */
export function BrandIcon({ brand, className = "size-6" }: BrandIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      data-brand={brand}
      className={`block shrink-0 ${className}`}
    >
      <path d={BRANDS[brand].path} fill="currentColor" />
    </svg>
  );
}
