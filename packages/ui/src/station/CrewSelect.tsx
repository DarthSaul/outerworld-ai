import {
  CHARACTER_COUNT,
  CHARACTERS,
  initials,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import { type CSSProperties, useEffect } from "react";
import { stVar } from "../tokens/tokens.js";
import { ChoiceButton } from "./buttons.js";
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
  /** Current look (CHARACTERS index). */
  readonly look: number;
}

export interface CrewSelectProps {
  readonly agents: readonly CrewSelectAgent[];
  /** The agent being configured. */
  readonly configuring: string;
  /** The character under the P1 cursor. */
  readonly cursor: number;
  readonly onConfigure: (agentId: string) => void;
  readonly onCursor: (index: number) => void;
  readonly onAssign: () => void;
  readonly onRandom: () => void;
  readonly busy?: boolean;
}

const COLS = 6;
const MOVES: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -COLS,
  ArrowDown: COLS,
};

/** Arrow keys move the cursor (wrapping), Enter assigns; ignored while typing in a field. */
function useGridKeys(cursor: number, onCursor: (i: number) => void, onAssign: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const move = MOVES[e.key];
      if (move !== undefined) {
        e.preventDefault();
        onCursor((cursor + move + CHARACTER_COUNT) % CHARACTER_COUNT);
      } else if (e.key === "Enter" && (e.target as HTMLElement | null)?.tagName !== "BUTTON") {
        e.preventDefault();
        onAssign();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, onCursor, onAssign]);
}

/** Crew Select (ADR-0013): choose how a crew member appears, from the 24 characters. */
export function CrewSelect(props: CrewSelectProps) {
  const { agents, configuring, cursor, onConfigure, onCursor, onAssign, onRandom, busy } = props;
  useGridKeys(cursor, onCursor, onAssign);
  const agent = agents.find((a) => a.id === configuring) ?? agents[0];
  const pick = CHARACTERS[cursor] ?? CHARACTERS[0];
  if (!agent || !pick) return null;
  const others = (index: number) => agents.filter((a) => a.look === index && a.id !== agent.id);
  const wornBy = others(cursor);
  const equipped = agent.look === cursor;
  const status = equipped
    ? { text: termWith("crewSelect.equipped", { agent: agent.name }), color: stVar("green") }
    : wornBy.length
      ? {
          text: termWith("crewSelect.alsoWorn", { agents: wornBy.map((a) => a.name).join(", ") }),
          color: stVar("amber"),
        }
      : { text: term("crewSelect.available"), color: stVar("cyan") };

  return (
    <div className="grid grid-cols-1 items-stretch gap-3.5 p-3.5 desktop:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Panel title={term("crewSelect.appearance")} meta={agent.roomName}>
        <div className="flex flex-1 flex-col gap-3.5 p-3">
          <div className="flex flex-col gap-2">
            <PanelLabel>{term("crewSelect.configuring")}</PanelLabel>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => {
                const active = a.id === agent.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onConfigure(a.id)}
                    className={`flex cursor-pointer items-center gap-1.5 border-2 py-0.75 pr-2 pl-0.75 font-body text-b17 text-fg-chip uppercase ${active ? "bg-active-bg" : "border-line-soft bg-well"}`}
                    style={active ? { borderColor: a.color } : undefined}
                  >
                    <Sprite look={a.look} />
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="relative flex min-h-80 flex-1 flex-col items-center justify-end overflow-hidden border-2 border-line-soft pb-7"
            style={{ background: "var(--st-stage-bg)" }}
          >
            <div
              className="absolute top-2.5 left-2.5 font-display text-d8 uppercase"
              style={{ color: agent.color }}
            >
              {agent.name} · {agent.role}
            </div>
            <div className="relative z-10 -mb-6.5">
              <Sprite look={cursor} scale={8} label={pick.name} />
            </div>
            <div
              aria-hidden="true"
              className="h-7.5 w-52.5 rounded-round border-3 border-cyan bg-pedestal"
              style={{ boxShadow: "var(--st-pedestal-glow)" }}
            />
          </div>
          <div className="flex flex-col items-center gap-2 text-center" aria-live="polite">
            <div className="font-display text-d18 text-title tracking-st-2">{pick.name}</div>
            <div className="text-b21 text-fg-soft">{pick.role}</div>
            <div className="font-display text-d7 uppercase" style={{ color: status.color }}>
              {status.text}
            </div>
          </div>
          <div className="flex gap-2.5">
            <ChoiceButton glyph="A" tone="green" size="d8" disabled={busy} onClick={onAssign}>
              {term("crewSelect.assign")}
            </ChoiceButton>
            <ChoiceButton glyph="B" tone="amber" size="d8" disabled={busy} onClick={onRandom}>
              {term("crewSelect.random")}
            </ChoiceButton>
          </div>
        </div>
      </Panel>
      <Panel
        title={termWith("crewSelect.choose", { count: String(CHARACTER_COUNT) })}
        meta={term("crewSelect.keys")}
      >
        <ul
          aria-label={termWith("crewSelect.choose", { count: String(CHARACTER_COUNT) })}
          className="m-0 grid list-none grid-cols-3 gap-3 p-3.5 desktop:grid-cols-6"
        >
          {CHARACTERS.map((c, i) => {
            const isCursor = i === cursor;
            const mine = agent.look === i;
            const owners = others(i);
            const style = {
              borderColor: isCursor ? undefined : mine ? stVar("green") : stVar("tile-line"),
              boxShadow: isCursor
                ? `0 0 0 2px ${stVar("map-bg")}, 0 0 18px ${stVar("amber")}`
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
                  onClick={() => onCursor(i)}
                  className={`relative flex w-full cursor-pointer flex-col items-center gap-2 border-3 bg-tile px-1 pt-3 pb-2.5 hover:bg-tile-hover ${isCursor ? "st-blink-border border-amber" : ""}`}
                  style={style}
                >
                  <Sprite look={i} scale={4} />
                  <span className="text-center font-display text-d7 text-fg-hi leading-[1.4]">
                    {c.name}
                  </span>
                  {isCursor ? (
                    <span className="-top-0.75 -left-0.75 absolute bg-amber px-1 py-0.75 font-display text-d7 text-ink">
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
      </Panel>
    </div>
  );
}
