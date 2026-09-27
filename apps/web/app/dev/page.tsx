import {
  Badge,
  Character,
  type EmblemMark,
  OverseerCharacter,
  type OverseerState,
  type RigAccessory,
  type RigHead,
  type RigShoulder,
  type RigTrace,
  type RunState,
  TeamEmblem,
} from "@darthsaul/outerworld-ai-ui";
import { ThemeSwitch } from "./ThemeSwitch";

const STATES: RunState[] = ["idle", "working", "done", "failed"];
const HEADS: RigHead[] = ["dome", "wedge"];
const TRACES: RigTrace[] = ["core", "bar", "chevron", "split", "twin"];
const SHOULDERS: RigShoulder[] = ["ball", "pauldron"];
const ACCESSORIES: RigAccessory[] = ["none", "antenna", "thruster", "plate"];
const OVERSEER_STATES: OverseerState[] = ["idle", "reconciling", "reported", "attention"];
const MARKS: EmblemMark[] = ["spire", "forge", "dome", "archive", "beacon", "none"];
const HUES = [230, 55, 150, 300, 20];

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-(--ow-space-3)">
      <h2 className="font-mono text-eyebrow uppercase text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

function Cell({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-(--ow-space-2) rounded-agent bg-surface-team p-(--ow-space-3)">
      {children}
      <span className="font-mono text-mono text-ink-3">{label}</span>
    </div>
  );
}

/** Component gallery: every component in every state. The screenshot script captures this page. */
export default function DevPage() {
  return (
    <main className="mx-auto flex max-w-(--ow-measure) flex-col gap-(--ow-space-8) p-(--ow-space-6)">
      <header className="flex flex-wrap items-center justify-between gap-(--ow-space-3)">
        <h1 className="text-title text-ink-1">Component gallery</h1>
        <ThemeSwitch />
      </header>

      <Section title="Character · run states · 1× and 2×">
        <div className="flex flex-wrap gap-(--ow-space-3)" data-gallery="states">
          {STATES.map((state) => (
            <Cell key={state} label={state}>
              <div className="flex items-end gap-(--ow-space-3)">
                <Character
                  name="Planner"
                  rig={{ tintHue: 230, trimHue: 250, head: "dome", trace: "core" }}
                  derived={{ shoulder: "ball", accessory: "antenna" }}
                  state={state}
                  scale={1}
                />
                <Character
                  name="Planner"
                  rig={{ tintHue: 230, trimHue: 250, head: "dome", trace: "core" }}
                  derived={{ shoulder: "ball", accessory: "antenna" }}
                  state={state}
                  scale={2}
                />
              </div>
            </Cell>
          ))}
        </div>
      </Section>

      <Section title="Character · heads × shoulders × accessories (working, 2×)">
        <div className="flex flex-wrap gap-(--ow-space-3)" data-gallery="parts">
          {HEADS.flatMap((head) =>
            SHOULDERS.flatMap((shoulder) =>
              ACCESSORIES.map((accessory) => (
                <Cell
                  key={`${head}-${shoulder}-${accessory}`}
                  label={`${head} · ${shoulder} · ${accessory}`}
                >
                  <Character
                    name="Hand"
                    rig={{ tintHue: 55, trimHue: 40, head, trace: "chevron" }}
                    derived={{ shoulder, accessory }}
                    state="working"
                    scale={2}
                  />
                </Cell>
              )),
            ),
          )}
        </div>
      </Section>

      <Section title="Character · traces and tints (idle, 4×)">
        <div className="flex flex-wrap gap-(--ow-space-3)" data-gallery="traces">
          {TRACES.map((trace, i) => (
            <Cell key={trace} label={`${trace} · hue ${HUES[i % HUES.length]}`}>
              <Character
                name="Hand"
                rig={{
                  tintHue: HUES[i % HUES.length] ?? 0,
                  trimHue: (HUES[i % HUES.length] ?? 0) + 20,
                  head: "wedge",
                  trace,
                }}
                derived={{ shoulder: "pauldron", accessory: "plate" }}
                state="idle"
                scale={4}
                blinkDelayMs={i * 700}
              />
            </Cell>
          ))}
        </div>
      </Section>

      <Section title="Overseer · hero rig · 2× and 4×">
        <div className="flex flex-wrap gap-(--ow-space-3)" data-gallery="overseer">
          {OVERSEER_STATES.map((state) => (
            <Cell key={state} label={state}>
              <div className="flex items-end gap-(--ow-space-3)">
                <OverseerCharacter name="Meridian" state={state} scale={2} />
                {state === "reconciling" ? (
                  <OverseerCharacter name="Meridian" state={state} scale={4} />
                ) : null}
              </div>
            </Cell>
          ))}
        </div>
      </Section>

      <Section title="Team emblem · marks · 2× and 4×">
        <div className="flex flex-wrap gap-(--ow-space-3)" data-gallery="emblems">
          {MARKS.map((mark, i) => (
            <Cell key={mark} label={`${mark} · hue ${HUES[i % HUES.length]}`}>
              <div className="flex items-end gap-(--ow-space-3)">
                <TeamEmblem name={mark} hue={HUES[i % HUES.length] ?? 0} mark={mark} scale={2} />
                <TeamEmblem name={mark} hue={HUES[i % HUES.length] ?? 0} mark={mark} scale={4} />
              </div>
            </Cell>
          ))}
        </div>
      </Section>

      <Section title="Badge (scaffold)">
        <div className="flex gap-(--ow-size-chip-gap)">
          <Badge mode="read">notion</Badge>
          <Badge mode="write">ledger</Badge>
        </div>
      </Section>
    </main>
  );
}
