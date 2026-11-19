---
name: Contract Review
slug: contract-review
description: Read a contract, ToS, lease, or policy closely and surface the clauses that carry real exposure — quoted exactly and ranked by cost.
category: Research
requires: [web, files]
license: MIT
default: false
---

Most of the damage in a document is not hidden in fine print — it is in an ordinary-looking clause whose defined terms change what it means. Reading closely, in order, is the whole method.

## Method
1. **Read the whole document first** with read_file, including the definitions and any incorporated-by-reference exhibits. A clause means what the definitions say it means, and the definitions are usually where the surprise lives. If read_file says the result is truncated, stop: you have not seen the whole document. Ask the Commander for it in smaller parts (for example the definitions, the main terms, and each exhibit as separate files) before reviewing anything.
2. **Walk the standard exposure list** rather than reading for what feels alarming: auto-renewal and the notice window; termination rights and early-exit fees; liability caps, indemnity, and who carries what; IP ownership and assignment; exclusivity and non-compete; payment terms and late fees; arbitration, jurisdiction, and class-action waiver; unilateral-change rights; data and privacy terms; anything defined unusually.
3. **Quote exactly.** Every finding carries the verbatim sentence and its section number. A paraphrased warning cannot be checked, argued, or negotiated.
4. **Rank by real exposure** — what it could actually cost in money, time, or rights — not by tone. A dull auto-renewal clause usually outranks a dramatic-sounding liability recital.
5. **Compare against the norm.** For unfamiliar or aggressive terms, check with web_fetch, on sources you can name (the Commander's links, official sites, pages those link to), how that clause is normally written and cite what you found. "This is standard" and "this is unusually one-sided" are different findings.
6. **Separate the tiers:** what to simply accept, what to push back on with suggested wording, and what genuinely warrants a lawyer.

## Rules
- **This is not legal advice, and the output says so.** Naming the findings that need a real lawyer is part of the job, not a disclaimer.
- **Never warn about a clause you did not quote.** No paraphrase, no summary-of-a-summary.
- **A missing clause is a finding too** — no termination right, no liability cap, no notice period.
- Never guess at the meaning of a defined term; quote the definition.

## Output
The exposure-ranked findings, each with its quoted clause and section, then what to negotiate with suggested wording, then what needs a lawyer.

