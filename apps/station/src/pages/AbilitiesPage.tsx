import { type Section, SectionLayout } from "../components/SectionLayout.js";
import { ABILITIES_PATH } from "../lib/routes.js";
import { ConnectorsDiscover, ConnectorsInstalled } from "./ConnectorsSection.js";
import { SkillsSection } from "./SkillsSection.js";

const SECTIONS: readonly Section[] = [
  { path: "discover", label: "abilities.discover", element: <ConnectorsDiscover /> },
  { path: "installed", label: "abilities.installed", element: <ConnectorsInstalled /> },
  { path: "skills", label: "abilities.skills", element: <SkillsSection /> },
];

/**
 * Abilities: everything crew members can do, a System screen at `/system/abilities/`. Connectors
 * and skills (ADR-0023); toolsets join them here. The bare path opens Discover.
 */
export function AbilitiesPage() {
  return (
    <SectionLayout
      title="abilities"
      navLabel="abilities.nav"
      base={ABILITIES_PATH}
      sections={SECTIONS}
    />
  );
}
