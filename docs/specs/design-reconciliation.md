# Design reconciliation — milestone 1

Written 2026-09-27 after reading `docs/design/`. Lists (A) conflicts between the milestone spec,
the brief, CONSTRAINTS.md, the schema sketch, or the rig palette contract and the design docs,
and (B) what the design defines that the milestone spec leaves undefined and the core step needs.
Decisions taken 2026-09-27 by the owner:
- A5: `failed` is added to the design spec (token h340 proposed, glow, pose, motion, components).
- A6: the design's section 07 stands: the overseer has its own 48×64 hero rig. The section 09
  contradiction was removed and the naming workshop line corrected.
- A7: motion follows the brief (idle bob + blink, done pop + check, failed dim + exclaim) plus the
  design's working loop (glow, breathe, arms alternate, head nod). Design spec §06 rewritten.
- A8: one ledger per team; a handoff is directional read authorization, not a file.
- A9: one Routine per team.
- All other rows applied as proposed. The design spec is now v0.2.
- Core step (A17): the design's settlement mark `relay` collides with the themed word for handoff, so the
  schema value is `beacon` (category `coordination`). The design doc's mark set still reads `relay`;
  the glossary maps `emblem.mark.beacon` to whatever the design chooses.
- Web step (A18): axe (WCAG 2.1 AA) fails `ink.3` for 11–13px text in both themes (spec values
  oklch(.58 …) on paper, oklch(.55 …) on space). Tokens now use .46 light and .68 dark. The design
  spec's own rule applies: theme loses every fight with legibility. Eyebrows, captions, and mono meta
  keep their role; only the lightness moved.

## A. Conflicts

| # | Where | Design doc says | Spec / brief / constraints say | Proposed resolution |
|---|-------|-----------------|-------------------------------|---------------------|
| A1 | Stack | "Headless core + **Vue** components", `Ow*` Vue component names | React 19 + Next.js | React. Component names keep the design's inventory but neutral: `StationMap`, `TeamPanel`, `TeamEmblem`, `AgentCard`, `GrantChip`, `HandoffLayer`, `Packet`, `OverseerCore`, `DetailPanel`, `ProofLine`, `LedgerView`, `RunTimeline`, `EmptyState`. |
| A2 | Vocabulary in schema | Schema keys are themed: `reach`, `outposts[]`, `hands[]`, `clearances[]`, `relays[]`, `shifts[]`, `commission`, `manifest`, `orders` | CLAUDE.md: neutral names in identifiers, filenames, schema keys | Neutral keys (`teams[]`, `agents[]`, `grants[]`, `handoffs[]`, `runs[]`, `persona`, `ledger`, `scope`). The design's key table becomes the glossary's display layer. Floor guard now flags the design nouns in code. |
| A3 | Vocabulary in my spec | — | Spec and brief use `laneGeometry`, `LaneLayer`; "lane" is the themed word for handoff per the brief's own table | Rename to `handoffGeometry`, `HandoffLayer`; CSS tokens already use `--ow-handoff-*`. |
| A4 | Rig palette contract | Persona sets `{ tintHue, trimHue, head, trace }`. Highlight, frame, visor are fixed by theme. Glow is state-owned. Shoulder and accessory are **derived** from config (write grant → pauldron; inbound handoff read → antenna, repo access → thruster, both → plate). There is no eye; the face is a full visor. | Brief: palette contract `base, shade, visor, eye, accent` plus one user-chosen accessory id | Adopt the design's contract: `agent.persona.rig = { tintHue, trimHue, head, trace }`. Drop `visor`, `eye`, `accent`, `base`, `shade` as user fields; derive shoulder/accessory in core from grants and handoffs (pure function). Update CLAUDE.md token rule wording. |
| A5 | Run states | `idle · working · done`; failure is health (`attention`, `stalled`) at team level; "stalled never pulses" | Brief and spec: `idle · working · done · failed` with a `failed` rig state (dim, exclaim) | Keep `failed` as a **run outcome** in StationState (a run can end failed; the ledger must say so) but render it with the design's rules: idle pose, glow = `health.stalled`? No: glow is only idle/working/done. Proposed: failed = idle pose, glow idle, plus the health square turning attention/stalled on the agent card. No exclaim glyph, no dim. Needs owner call. |
| A6 | Overseer rig | §07: "its own hero rig", a dedicated 48×64 symbol on a second grid, "built like a mech"; §09 NEVER: "a bigger body for the overseer" (internal contradiction) | Brief: "same rig with a distinct accessory and scale, not a different rig"; naming workshop agrees | Milestone 1 follows the brief: same 24×32 rig at 2× with the `crest` head (reserved), `frame` trace (reserved), achromatic palette, in the octagon core. The 48×64 hero rig is a roadmap item, recorded in the ADR. |
| A7 | Idle motion | "Nothing loops except working"; NEVER "idle animation on anything not provably working" | Brief: idle = bob + blink; done = pop + check | Follow the design: idle is static (visor unlit); working→done snaps. Blink stays out. Brief's "bob, blink" and "pop, check" are dropped; the timeline demo shows working → done as a snap plus packet transit. Needs owner call since it contradicts the brief. |
| A8 | Ledger ownership | One **manifest per team** (`outpost.manifest` path, e.g. `ledger/project-management.md`); a relay carries that manifest to a reader team | Brief: a handoff is "one ledger file, one writer team, one reader team" | Per-team ledger file; a handoff is the read authorization plus direction, not its own file. The generator emits `ledger/<teamId>.md` and `handoffs/` becomes a section of CLAUDE.md, not files. Needs owner call. |
| A9 | Who runs | Runs (shifts) are recorded **per team** in the panel timeline; agents show a run state within a run | Brief: `routines/<id>.prompt.md`, "per-agent run state" | One Routine per team (one prompt orchestrating that team's agents) is the natural reading of the design, and fewer Routines to create by hand. StationState keeps per-agent state derived from the team run's record. Needs owner call. |
| A10 | Positions | Layout is derived: radial for ≤ 8 teams, two rings 9–16, list above 16; overseer fixed center | Spec assumption 4: per-team positions supplied in the Station document | Derive layout in core; Station carries no positions in milestone 1. Optional manual positions become a roadmap item. |
| A11 | Editing | Detail panel has an **Orders** tab and `OrdersEditor`, `PersonaEditor`, `RelayEditor`, draft/committed/diverged states | Confirmed intent: read-only this milestone | Report tab only. Schema reserves nothing for drafts. Editors are milestone 2. |
| A12 | Fonts | IBM Plex "ships with the package" (OFL) | No constraint mentions fonts; PRIVACY says no network calls | Self-host under `packages/ui/fonts/` with `OFL.txt`. Add to scaffold Task 4 (done in todo). The naming-workshop doc's Google Fonts link is irrelevant. |
| A13 | Hardcoded numbers in derivation | World shade/glow and rig chrome are "computed from hue at render time" | CONSTRAINTS floor: no color literals in components | Compute in CSS with relative color syntax inside `tokens.css` (done). Components set only `--ow-emblem-hue`, `--ow-rig-tint-hue`, `--ow-rig-trim-hue`. Needs a browser-support check in the ui step (Chrome 119+, Safari 16.4+, Firefox 128+). |
| A14 | Overseer placeholder name | UI mock uses "Ultron" | Brief: no franchise names | Never in code or fixtures. Fixture overseer proper name: "Meridian" (workshop candidate). Floor guard flags `ultron`. |
| A15 | Run noun | Workshop chose "Sortie"; UI mock uses "Shift" (which the workshop flags as colliding with ⇧) | — | Glossary ships "Sortie"; the mock is older. One-line change later either way. |
| A16 | Themed CSS names | `--ow-surface-space`, `--ow-clearance-read`, `--ow-lane-carrying` | Neutral identifiers | Tokens use `--ow-surface-map`, `--ow-grant-read`, `--ow-handoff-carrying`. Mapping table in `docs/design/README.md`. |

## B. Undefined in the spec, needed by the core step

1. **Station schema additions from the design.** `team.mission` (required string), `team.scope = { repos[], grants[] }`, `team.emblem = { hue, mark }` with `mark ∈ spire | forge | dome | archive | relay | none`, `agent.persona = { name, mandate, tone, allowlist ⊆ team grants, rig: { tintHue, trimHue, head ∈ dome|wedge|crest, trace ∈ core|bar|chevron|split|frame|twin } }`, `handoff = { from, to }` directional with pairing detected by geometry, `overseer = { persona }` singleton with `crest` + `frame` reserved. Id conventions: lowercase plural collections, singular refs.
2. **Schedule.** Health "stalled" and the 24 h "degraded" banner are relative to the Routine's schedule ("gaps > schedule"). Station needs `team.schedule` (cron or interval) or the ledger must record `expectedNextRunAt`. Decide which side carries it.
3. **Run record fields.** From the mock's Report tab: `startedAt`, `endedAt`, `state ∈ done|failed|stalled`, `grantsUsed[]` with counts (R notion ×3), ledger change summary (lines changed), `sourceRef` (commit sha) and `path` for the proof line, plus an error string on failure.
4. **Health derivation.** Rules for ok / attention / stalled from run history and schedule. Proposed: stalled = no run within 2× schedule; attention = last run failed or the overseer flagged it; ok otherwise. Needs numbers.
5. **Overseer state.** `idle | reconciling | reported | attention`, `lastOutwardPostAt`, `reconciledCount`, `attentionCount`, and the digest text location (`status/digest.md`, decided).
6. **Event model split.** Design lists UI events (`select · hover · open · commit`); the spec lists state events (run started/finished/failed, ledger written, packet, digest posted). Core defines state events only; UI events stay in ui. Confirm.
7. **Packet semantics.** "One packet per relay per shift" when the writer's ledger changed. Core must derive `ledgerWritten` events from run records (needs the change summary in B3) so the timeline can replay a recorded run.
8. **Layout math.** Radial placement rules (radius, angular order, gutter 48), pairing offset ±3, chevron placement at the reading end, list fallback above 16. Zoom is ui-only.
9. **Provenance block.** StationState needs `asOf`, `sourceRef` (sha), and `sourcePath` at the top level for the map header ("as of 2026-09-27 14:02 UTC · main a41f9c").
10. **Grant model.** Connector id set for milestone 1 (notion, git, discord, file) and whether a grant is a connector or a skill; the mock treats each as a connector name with a mode.
11. **Ledger file format.** Markdown with `## Next steps` / `## Waiting on` sections in the mock; the diff gutter needs a stable section structure. Define minimal headings the Routine must keep.
12. **Glossary contents.** Set D strings, verbs, eyebrows, empty-state copy, and the overseer role noun "Assayer"; plain word always in the tooltip.
- Owner review (A19): team cards were truncating mandates and the overseer core clipped the hero's head.
  Team boxes are 360×240 layout units for up to four teams (240×200 beyond), agent cards stack in one
  column on the map, the team max width is 400px (design: 320), and the overseer core is 192×232
  (design: 144×160) so the 96×128 hero rig and two text lines fit.
- Owner review (A20): vocabulary simplified. Station (team), Tool (grant), Handoff, Agent, Routine run,
  Overseer; Manifest and the Reach kept. Tool chips show the capitalized tool name over a lighter
  read / write line (chip height 40). Design spec is v0.3; the naming workshop doc is annotated.
- Owner review (A21): "Manifest" is now "Station Report" for a team's ledger file and the overseer's digest is
  the "System Report". Also: the dashboard is a nav / columns (1fr 3fr 2fr) / footer grid that fits the
  viewport, the map pane is black in both themes with drag-to-pan and zoom, and core's layout places the
  overseer at the right edge with stations in columns to its left, each wired into it.
