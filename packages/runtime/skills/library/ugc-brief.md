---
name: UGC Brief
slug: ugc-brief
description: Package an idea into a ready-to-shoot UGC/video brief — hooks, timed shot list, caption, cover, repurposing cuts.
category: Creator
requires: [web, files]
license: MIT
default: false
---

Turn an idea into a package the Commander can film today. A brief that still needs decisions at the shoot is not done.

## Method
1. **Check the niche first (web_fetch).** Open the examples the Commander shares and the platform's own trend pages: what formats, angles, and structures are landing in this niche RIGHT NOW — trends expire in weeks, so note the as-of date and the examples you actually saw.
2. **Write 3 hook options.** Genuinely different opens (question / bold claim / visual pattern-break), each under 2 seconds of speech. The first 2 seconds earn the next 10.
3. **Beat the shot list.** Every beat gets a timestamp range, what is on screen, and what is said. Front-load the payoff; cut any beat that does not earn its seconds.
4. **Finish the package:** caption with the CTA, cover text, and on-screen text callouts.
5. **Plan the repurposing up front.** One shoot → the short, the story, the carousel, the text post. Name each cut and its platform.

## Rules
- **Every format claim cites a live example you opened** — never "this usually works".
- Write for retention, not completeness — dead beats get cut, not defended.
- Save the package with write_file, formatted to read on a phone at the shoot.

## Output
The full package (hooks → shot list → caption/cover → CTA), why this format with its source, then the repurposing cuts.

