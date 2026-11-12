import { type Dashboard, term } from "@darthsaul/outerworld-ai-core";
import { stVar } from "../tokens/tokens.js";
import { roomColor } from "./DashboardMap.js";
import type { DropdownGroup } from "./Dropdown.js";
import { Sprite } from "./Sprite.js";
import { CREW_STATUS_TONE, toneVar } from "./tone.js";

/**
 * Every crew member as `Dropdown` options, grouped by room: their character beside their name,
 * the name underlined in their color (the room's; white for the Overseer), and status in its color. The scanner's crew picker and the
 * Station's crew comms both use it, so the two lists always match.
 */
export function crewOptionGroups(dashboard: Dashboard): DropdownGroup[] {
  return dashboard.rooms.map((room) => ({
    id: room.id,
    label: room.name,
    options: dashboard.crew
      .filter((c) => c.roomId === room.id)
      .map((c) => {
        const status = term(`crewStatus.${c.status}`);
        const role = c.overseer ? ` (${term("overseer.role")})` : "";
        const color = c.overseer ? stVar("white") : roomColor(room);
        return {
          value: c.id,
          text: `${c.name}${role} · ${status}`,
          label: (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span data-look={c.look} className="flex shrink-0">
                <Sprite look={c.look} />
              </span>
              <span className="min-w-0 flex-1 truncate uppercase">
                <span
                  data-crew-color
                  className="underline decoration-2 underline-offset-4"
                  style={{ textDecorationColor: color }}
                >
                  {c.name}
                </span>
                {c.overseer ? (
                  <span className="text-b16 text-fg-mute normal-case">{role}</span>
                ) : null}
              </span>
              <span
                className="shrink-0 font-display text-d7 uppercase"
                style={{ color: toneVar(CREW_STATUS_TONE[c.status]) }}
              >
                {status}
              </span>
            </span>
          ),
        };
      }),
  }));
}
