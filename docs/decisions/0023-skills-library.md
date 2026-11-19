# ADR-0023: Skills library: enablement, capability gating, and an index with skill_view

## Status
Accepted. Extends brief §6 (effective tools) and §8 (prompt assembly); fills the Skills place
ADR-0020 kept under Abilities.

## Context

Crew improvise every task. A library of tested recipes ("skills": Markdown with frontmatter)
lets a crew member follow one instead. We ported StarNet's library of 74 (MIT). The brief does
not cover skills, so the decisions below are ours. Three constraints shape them: the interface
never claims what the runtime cannot prove; a tool not granted is never sent and is rejected at
execution; and the system prompt is the cached prefix (ADR-0015), so it should change only with
config.

## Decision

- **Library.** `packages/runtime/skills/library/*.md`, bundled and read-only, with StarNet's
  `LICENSE` and an attribution `NOTICE.md` beside it. The daemon loads it once at startup
  (`loadSkillLibrary`). A malformed, oversized (> 64 KiB), symlinked, or misnamed file (slug ≠
  file name) is skipped with a warning, never fatal. Frontmatter is a strict `key: value` /
  `key: [a, b]` subset (`parseSkillFile`, core); no YAML dependency.
- **Enablement.** A skill is enabled for a crew member when it is on station-wide (its
  `default`, unless the Commander overrode it in `station.json` → `skills.enabled|disabled`) **or**
  its own `agent.json` → `skills` names it. A crew member's list only adds; it never turns off a
  station-wide skill. Turning a skill back to its default clears the override instead of
  storing a copy.
- **Capability gating.** A skill declares `requires` from `web`, `files`, `memory`, `dispatch`,
  `shell`, `media`, `browser`. It is offered only when the run's tools meet them: web ←
  `web_fetch`, files ← all three of `read_file`, `list_files`, and `write_file`, memory ←
  `remember`, dispatch ← `dispatch`. `shell`, `media`, and `browser` have no tools in v1, so 22
  ported skills load and show in the catalog ("needs a shell") but are never offered. An unknown
  requirement is never met. A recipe that checks a live page's keyboard, focus, or rendered
  colour needs `browser`: fetched text cannot show those.
- **Index plus `skill_view`.** The prompt gets an `# Installed skills` section after the role
  briefing and before memories: one line per offered skill (name, id, description) and an
  instruction to call `skill_view` and follow the matching recipe instead of improvising.
  `skill_view` is a read-class built-in, granted (source `skill`) only when at least one skill is
  offered. It answers only for a skill the calling run listed when it was set up (the run passes
  those ids in the tool context) that is still offered now, recomputed from config: a skill
  added mid-run, or one turned off since the prompt was built, is refused. Its result is the
  station's own recipe; the section says so, and the untrusted-data notice is unchanged.
- **Inline fallback.** When `skill_view` is not among the run's offered tools, the section holds
  the bodies instead, so the index never names a tool the agent cannot call.
- **Budget.** The section is capped at 12,000 characters. Entries go in priority order (the
  crew member's own skills, then station-wide, each by name); once one does not fit, it and all
  after it are left out and counted ("(N more skills not listed.)"), the note counted against
  the budget too. Entries are never cut, and a budget too small for even one entry gives no
  section.
- **Empty case.** With no offered skill, no section and no `skill_view`: the prompt and tools are
  byte-identical to a station without skills.
- **Not done: task-only injection.** Leaving the section out on greetings would change the cached
  prefix between turns (a cache miss on the turn after every "thanks"), a greeting heuristic
  misreads "thanks — now draft the email", and an index read on a "hi" turn costs a few hundred
  characters. Revisit if the index grows past its budget in practice.
- **Port.** StarNet capability names mapped to ours (dish → web, cabinet → files, workbench →
  shell, studio → media, orchestrator → dispatch); tool names to ours (`fs.write` → `write_file`,
  `team.dispatch` → `dispatch`, …). This station has no search tool, so the 25 recipes that
  searched now work from sources the agent can name (the Commander's links, official sites,
  pages those link to) with `web_fetch`. StarNet's notebook was a free working log; ours is
  approval-gated memory, so logs became workspace files and only lasting preferences use
  `remember`. A test holds the library to this: every file parses, every requirement is known,
  no body names another runtime's tools, every tool a body names is required, and no body
  promises what the station cannot do (fetching a PDF, keeping read files local).
- **Feeds and papers.** `web_fetch` returns any `+xml` or `+json` type as text, so Atom and RSS
  feeds (arXiv's query API among them) are readable. It still refuses PDFs: `arxiv-research`
  reads a paper's abstract page and arXiv's HTML full text, and says when a paper exists only as
  a PDF. PDF text extraction was considered and deferred (owner, 2026-11-18): a new dependency
  and larger tool results for one recipe.
- **Surfaces.** `GET /api/skills` (catalog with each skill's state, never bodies), `PUT
  /api/skills/:id {enabled: boolean | null}`, and `PATCH /api/agents/:id {skills}`. Changes emit
  `station.updated` / `agent.updated`; no new event type. The SPA shows Abilities › Skills
  (`/system/abilities/skills`) and a Skills panel on a crew member's Config; Brief lists the
  skills it is offered, from the same selection the run makes.

## Consequences

- A skill's body reaches the model only through `skill_view`, or inline in the prompt when the
  run cannot call `skill_view`, so `docs/PRIVACY.md` lists the index, inline bodies, and fetched
  bodies among what leaves the machine.
- Skills are read-only to agents: no tool creates or edits one (agents editing agents stays out of
  scope). `website-workflow`, which saves skills in StarNet, is gated on `browser` and `shell`.
- The library is product content, not station data: it is not in `$OUTERWORLD_HOME`, and a
  Commander's own skills folder is a later decision.
- Adding a shell, browser, or image tool later makes the gated skills available with no re-port.
