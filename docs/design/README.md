# Design assets and guidelines

> **Current design: [`station-dashboard/`](station-dashboard/README.md)** (ADR-0013). Its README is
> the spec, `reference/Station Dashboard.dc.html` the prototype, `src/tokens.css` the token source.
> Everything below this note describes the superseded Reach spec and rig, kept for history.

This folder was the design source of truth for the ui package. When a token, size, motion value,
or component state is in question, the answer is in `outerworld-spec.dc.html`; the code in
`packages/ui/src/tokens/` is a translation of it and must not drift. Vocabulary in the design
docs is themed (Outpost, Clearance, Relay, Hand); code stays neutral per CLAUDE.md, and the map
between the two is at the bottom of this file.

## Index

| Path | What it is | Ships? |
|------|------------|--------|
| `outerworld-spec.dc.html` | **Design spec v0.3.** Vocabulary → schema keys, palette + semantic tokens, type scale, space + radius, iconography, motion, character rig, rig pipeline decision (A: quantized vector), team emblem (world + settlement), component inventory + states, where the theme stops. | Source doc |
| `outerworld-ui.dc.html` | **UI mock.** A full dashboard frame: map with two teams, overseer core, packet on a handoff, detail panel with Report tab (proof line, last run, ledger diff, run timeline, handoffs, agents). | Source doc |
| `naming-workshop.dc.html` | **Naming workshop.** Three vocabulary registers (A bureaucratic, B naval, C frontier) and the chosen Set D. Product name candidates. Overseer naming rule (role noun fixed, proper name in persona). | Source doc |
| `support.js`, `.thumbnail` | Runtime and preview for the `.dc.html` docs. Open the docs in a browser; do not edit these. | No |
| `rig/rig-parts-v0.svg` | v0 card rig symbols on the 24×32 unit grid: two bodies (idle, active), three heads (dome, wedge, crest), two shoulders (ball, pauldron). Hand-placed rects with `var(--rig-*)` fills. Proportion study; the basis for the shipped rig. | Basis for ui |
| `assets/robot-*.png` | Reference renders embedded by the spec doc (chrome, idle, violet tint). **Generated reference art, not original. Never ship, never trace into a shipped asset.** | No |
| `reference/robot-ref-scene.png` | The scene the reference robot came from. Mood board for `surface.*` values only. | No |
| `studies/rig-hero-traced-v0.svg` | Machine trace of the reference at 4px/cell to a 25×81 grid (746 rects). Proves the recolor mechanism. Derived from generated art, so it is a study, not an asset. | No |
| `studies/robot-class*.png`, `robot-quant.png`, `robot-class.json`, `rig-hd-preview.png` | Intermediate outputs of that trace (color clustering, quantization, class map, preview). | No |

Rule from the brief: everything shipped is original. The spec itself says the traced sprites
"are the reference itself, recolored to prove the mechanism — they are not shippable assets."
The shipped rig is drawn by hand on the 24×32 grid using `rig/rig-parts-v0.svg` as the
proportion target.

## Token translation

`packages/ui/src/tokens/tokens.css` defines every value as a `--ow-*` custom property (light
default, dark under both guards, reduced motion). `theme.css` maps the ones with a Tailwind v4
namespace via `@theme inline`. Anything without a namespace is used as `var(--ow-*)` or with
Tailwind's variable shorthand, e.g. `duration-(--ow-dur-fast)`.

| Design name | CSS variable | Tailwind |
|-------------|--------------|----------|
| surface.space / .outpost / .panel / .raised | `--ow-surface-map` / `-team` / `-panel` / `-raised` | `bg-surface-map` … |
| border.subtle / .strong | `--ow-border-subtle` / `-strong` | `border-border-subtle` … |
| ink.1 / .2 / .3 | `--ow-ink-1` / `-2` / `-3` (ink.3 lightness adjusted for AA contrast, see reconciliation A18) | `text-ink-1` … |
| clearance.read (h230) / .write (h55) | `--ow-grant-read` / `-write` | `text-grant-read`, `bg-chip-read` |
| health.ok (h150) / .attention (h85) / .stalled (h25) | `--ow-health-ok` / `-attention` / `-stalled` | `bg-health-ok` … |
| run.working (h195) / .idle (= ink.3) / .done (= ink.1) / .failed (h340) | `--ow-run-working` / `-idle` / `-done` / `-failed` | `text-run-working` … |
| accents L .78 C .13 dark, L .52 light | `--ow-accent-l`, `--ow-accent-c` | (internal) |
| selection.ring (ink.1 2px + 25% / 20% halo) | `--ow-selection-ring`, `--ow-selection-halo`, `--ow-size-selection-ring` | `ring-selection-ring` |
| lane.default / .emphasis / .carrying | `--ow-handoff-default` / `-emphasis` / `-carrying` | `stroke-handoff-default` … |
| chip tint 16% rest / 35% in-use, border 50% | `--ow-chip-bg-*`, `--ow-chip-bg-*-active`, `--ow-chip-border-*` | `bg-chip-read-active` … |
| rig.primary (chrome, tintHue) / .secondary (trim, trimHue) | `--ow-rig-tint-hue`, `--ow-rig-trim-hue` → `--ow-rig-primary` / `-secondary` | `fill-rig-primary` … |
| rig.highlight (ink.1) / .frame / .visor (fixed) | `--ow-rig-highlight` / `-frame` / `-visor` | `fill-rig-frame` … |
| rig.glow (state-owned: idle / working / done / failed) | `--ow-rig-glow-idle` / `-working` / `-done` / `-failed` → `--ow-rig-glow` | `fill-rig-glow` |
| idle bob 1 unit, blink every 4–6 s, working nod 1 unit, done pop 108%, failed dim 60% | `--ow-rig-bob-units`, `--ow-rig-blink-min/max`, `--ow-rig-nod-units`, `--ow-rig-pop-scale`, `--ow-opacity-failed` | `animate-bob`, `animate-nod`, `animate-pop`, `animate-fail` |
| overseer primary / secondary / frame (achromatic) | `--ow-overseer-primary` / `-secondary` / `-frame` | `fill-overseer-primary` … |
| world.base (hue) / .shade (−.18 L, +8°) / .glow (+.26 L, −.02 C, −20°) / .mark (ink.1) | `--ow-emblem-hue` → `--ow-emblem-base` / `-shade` / `-glow` / `-mark` (CSS relative color) | `fill-emblem-base` … |
| IBM Plex Sans / Mono | `--ow-font-sans` / `-mono` | `font-sans`, `font-mono` |
| display 28/32 600 … eyebrow 11/14 500 +.1em | `--ow-text-<role>-size` / `-line` / `-weight`, `--ow-text-eyebrow-tracking` | `text-display` … `text-eyebrow` |
| max measure 64ch; map minimum 12px | `--ow-measure`, `--ow-text-min-map` | `max-w-(--ow-measure)` |
| space 4 · 8 · 12 · 16 · 24 · 32 · 48 | `--ow-space-1/2/3/4/6/8/12` (+ `-5` = 20 for panel pad) | default `p-1` … or `p-ow-4` |
| radius outpost 16 / panel 12 / hand card 8 / controls 6 / chip 4 / disc full | `--ow-radius-team` / `-panel` / `-agent` / `-control` / `-chip` / `-full` | `rounded-team` … |
| outpost min-w 240, max-w 320, pad 16, gap 12 | `--ow-size-team-*` | `min-w-(--ow-size-team-min-w)` |
| chip h 22, pad 2/8, gap 6 | `--ow-size-chip-*` | `h-(--ow-size-chip-h)` |
| controls h 32 / 28 dense, pad 0/12 | `--ow-size-control-*` | |
| detail panel w 400 (360–560), pad 20 | `--ow-size-panel-*` | |
| overseer core octagon 144×160, 25% chamfer, 2px frame | `--ow-size-overseer-core-*`, `--ow-size-frame-border` | |
| map gutter 48; health dot 8; packet 6; lane hit 12; pair offset ±3 | `--ow-size-map-gutter`, `-health-dot`, `-packet`, `-handoff-hit`, `-handoff-pair-offset` | |
| icons 20px grid, 1.5px stroke, 2px chamfer | `--ow-size-icon-*` | |
| rig 24×32 at 1×/2×/4×; head chip 14×9; world 16×16 at 2×/4× | `--ow-rig-unit-*`, `--ow-rig-scale-*`, `--ow-rig-chip-*`, `--ow-emblem-*` | |
| mobile < 720px; zoom 60–140%; collapse < 60%; radial ≤ 8, rings 9–16 | `--ow-breakpoint-mobile`, `--ow-zoom-*`, `--ow-layout-*` | `desktop:` variant |
| dimmed 60% | `--ow-opacity-dimmed` | `opacity-(--ow-opacity-dimmed)` |
| dur instant 80 / fast 160 / base 240 / slow 400 / packet 1200 / breathe 2400; reduced 120 | `--ow-dur-*` | `duration-(--ow-dur-fast)` |
| ease standard / exit / packet / breathe | `--ow-ease-*` | `ease-standard` … |
| panel slide 16px | `--ow-motion-panel-slide` | |
| breathe / packet / chip keyframes | `@keyframes ow-*` in `theme.css` | `animate-breathe`, `animate-packet`, `animate-chip` |

Not tokens, but rules the components must honor: status hues are never fills behind text (dot,
stroke, or tint only); working (h195) and read (h230) never appear on the same element;
attention (h85) is the only warm yellow; selection is achromatic; only idle (bob, blink) and
working loop; stalled and failed never pulse; mono is only for evidence (timestamps, paths, shas).

## Vocabulary map (design → code)

Simplified by the owner on 2026-09-27 (spec v0.3, reconciliation A20). The glossary in
`packages/core/src/glossary.ts` is the source of truth for display strings.

| On screen | Code / schema | Glossary key |
|-----------|---------------|--------------|
| the Reach | `station` (the whole map document) | `station` |
| Station | `team` | `team` |
| Standing orders | `team.scope` (repos + grants) | `scope` |
| Tool (read / write) | `grant`, `grant.mode` | `grant` |
| Handoff (directional) | `handoff` | `handoff` |
| Agent | `agent` | `agent` |
| Persona | `agent.persona` | `persona` |
| Station Report | ledger file | `ledger` |
| System Report | the overseer's digest | `system.report` |
| Routine run | `run` | `run` |
| Overseer (role); proper name from the persona | `overseer` | `overseer` |
| World + settlement | `team.emblem` | `emblem` |

"Station" on screen is a team; in code `station` is the whole document. The earlier themed set
(Outpost, Clearance, Relay, Hand, Sortie, Assayer) survives only in the naming workshop doc.
The fixture's overseer is named "Ultron" at the owner's request (a Marvel trademark; replace before
any public release).
