import {
  CHARACTER_COUNT,
  CHARACTERS,
  initials,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { type CSSProperties, type KeyboardEvent, useRef } from "react";
import { stVar } from "../tokens/tokens.js";
import { OutlineButton } from "./buttons.js";
import { Panel, PanelLabel } from "./Panel.js";
import { Sprite } from "./Sprite.js";

export interface CrewSelectAgent {
  readonly id: string;
  readonly name: string;
  /** "Overseer", "Crew member". */
  readonly role: string;
  readonly roomName: string;
  /** Room color: a var() reference. */
  readonly color: string;
  /** Current look: a character id. */
  readonly look: string;
}

export interface CrewSelectProps {
  /** The crew member whose appearance this sets. */
  readonly agent: CrewSelectAgent;
  /** Everyone else on the station, to say who else wears a character. */
  readonly others: readonly CrewSelectAgent[];
  /** The id of the character under the P1 cursor. */
  readonly cursor: string;
  readonly onCursor: (id: string) => void;
  /** Saves the character under the cursor as the crew member's look. */
  readonly onSave: () => void;
  readonly busy?: boolean;
}

/** The grid has three rows, filled in reading order; it scrolls sideways past the panel's width. */
const ROWS = 3;
const COLS = Math.ceil(CHARACTER_COUNT / ROWS);

/**
 * Appearance (ADR-0013, ADR-0017): how one crew member appears. A small stage shows the character
 * under the cursor with its name, role, and status beside it; below them, across the full width,
 * every character sits in a three-row grid that scrolls sideways, painted ones first. Save,
 * in the title strip, is live only while the cursor is on a character other than the saved one.
 * With focus in the grid, ← → move the cursor (wrapping), ↑ ↓ change row, Home and End jump, and
 * Enter saves; a click only moves the cursor.
 */
export function CrewSelect(props: CrewSelectProps) {
  const { agent, others, cursor, onCursor, onSave, busy } = props;
  const grid = useRef<HTMLUListElement>(null);
  // Arrow keys move through the tiles as shown (CHARACTERS' order); what is saved is the id.
  const at = Math.max(
    0,
    CHARACTERS.findIndex((c) => c.id === cursor),
  );
  const pick = CHARACTERS[at];
  if (!pick) return null;
  const changed = pick.id !== agent.look;
  const wearing = (id: string) => others.filter((a) => a.look === id && a.id !== agent.id);
  const wornBy = wearing(pick.id);
  const status = !changed
    ? { text: termWith("crewSelect.equipped", { agent: agent.name }), color: stVar("green") }
    : wornBy.length
      ? {
          text: termWith("crewSelect.alsoWorn", { agents: wornBy.map((a) => a.name).join(", ") }),
          color: stVar("amber"),
        }
      : { text: term("crewSelect.available"), color: stVar("cyan") };
  const heading = termWith("crewSelect.choose", { agent: agent.name });

  const moveTo = (index: number) => {
    const next = CHARACTERS[index];
    if (next) onCursor(next.id);
    const tile = grid.current?.querySelector<HTMLElement>(`[data-character-index="${index}"]`);
    tile?.focus();
    tile?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const wrap = (i: number) => (i + CHARACTER_COUNT) % CHARACTER_COUNT;
    const steps: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLS,
      ArrowDown: COLS,
    };
    const step = steps[e.key];
    if (step !== undefined) {
      e.preventDefault();
      const next = at + step;
      // Up or down off the grid stays in the same column; left or right wraps around.
      moveTo(
        Math.abs(step) === COLS ? (next >= 0 && next < CHARACTER_COUNT ? next : at) : wrap(next),
      );
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      moveTo(e.key === "Home" ? 0 : CHARACTER_COUNT - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (changed && !busy) onSave();
    }
  };

  return (
    <Panel
      title={term("crewSelect.appearance")}
      dense
      meta={
        <OutlineButton tone="green" disabled={!changed || busy} onClick={onSave}>
          {term("crewSelect.save")}
        </OutlineButton>
      }
    >
      {/* Two rows: the stage beside the character's name, role, and status; the grid below. */}
      <div
        data-crew-select-layout
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 p-3"
      >
        <div
          data-stage
          className="relative flex h-32 w-40 flex-col items-center justify-end overflow-hidden border-2 border-line-soft pb-3 desktop:w-52"
          style={{ background: "var(--st-stage-bg)" }}
        >
          <div className="relative z-10 -mb-2.5">
            <Sprite look={pick.id} scale={3} label={pick.name} />
          </div>
          <div
            aria-hidden="true"
            className="h-3.5 w-24 rounded-round border-2 border-cyan bg-pedestal"
            style={{ boxShadow: "var(--st-pedestal-glow)" }}
          />
        </div>
        <div data-pick className="flex min-w-0 flex-col justify-center gap-1" aria-live="polite">
          <div className="font-display text-d10 text-title tracking-st-1">{pick.name}</div>
          <div className="text-b17 text-fg-soft">{pick.role}</div>
          <div className="font-display text-d7 uppercase" style={{ color: status.color }}>
            {status.text}
          </div>
        </div>
        <div data-character-picker className="col-span-2 flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <PanelLabel>{heading}</PanelLabel>
            <span className="font-display text-d6 text-fg-mute uppercase">
              {term("crewSelect.keys")}
            </span>
          </div>
          <ul
            ref={grid}
            aria-label={heading}
            onKeyDown={onKeyDown}
            data-character-grid
            className="m-0 grid list-none gap-2.5 overflow-x-auto overscroll-x-contain p-1 pb-2.5"
            style={{ gridTemplateColumns: `repeat(${COLS}, max-content)` }}
          >
            {CHARACTERS.map((c, i) => {
              const isCursor = i === at;
              const mine = agent.look === c.id;
              const owners = wearing(c.id);
              const style = {
                borderColor: isCursor ? undefined : mine ? stVar("green") : stVar("tile-line"),
                boxShadow: isCursor
                  ? `0 0 0 2px ${stVar("map-bg")}, 0 0 12px ${stVar("amber")}`
                  : stVar("shadow-tile"),
                "--st-blink-a": stVar("amber"),
                "--st-blink-b": stVar("amber-hi"),
              } as CSSProperties;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={isCursor}
                    aria-label={`${c.name}, ${c.role}`}
                    data-character-index={i}
                    tabIndex={isCursor ? 0 : -1}
                    onClick={() => onCursor(c.id)}
                    className={`relative flex h-full w-20 cursor-pointer flex-col items-center justify-end gap-1 border-3 bg-tile px-1 pt-2 pb-1.5 hover:bg-tile-hover ${isCursor ? "st-blink-border border-amber" : ""}`}
                    style={style}
                  >
                    <Sprite look={c.id} scale={2} />
                    <span className="text-center font-display text-d6 text-fg-hi leading-[1.4]">
                      {c.name}
                    </span>
                    {isCursor ? (
                      <span className="-top-0.75 -left-0.75 absolute bg-amber px-1 py-0.75 font-display text-d6 text-ink">
                        P1
                      </span>
                    ) : null}
                    {owners.length ? (
                      <span className="-top-0.75 -right-0.75 absolute border border-line-strong bg-well px-1 py-0.75 font-display text-d6 text-fg-soft">
                        {owners.map((o) => initials(o.name)).join(" ")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
