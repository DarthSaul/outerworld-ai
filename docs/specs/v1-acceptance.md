# v1 acceptance

How each "done when" criterion in [BRIEF-station-runtime.md](BRIEF-station-runtime.md) §16 is
shown. **Automated** tests run in `pnpm check:task` with the fake model and no network.
**Manual** steps are for a person at a real machine. Steps marked *real* need an OpenRouter key
or a Notion sign-in. Paths are relative to the repository root.

Status on 2026-09-30: every automated check passes (`pnpm check:task`, `pnpm browser:verify`).
The owner walked through criteria 1 and 2 manually with real OpenRouter and Notion, and criterion
5 with the fake model, during Phases 3 to 7.

---

## 1. Fresh clone → `pnpm install && pnpm dev` → onboarding creates the Overseer, asks for the OpenRouter key, and the Commander can chat with streamed replies

`pnpm dev` keeps running the demo fixture so day-to-day development has a populated station.
Onboarding runs on an empty station: `pnpm dev:fresh` uses a throwaway one, and a real first run
uses your own station directory (D23, accepted by the owner).

**Automated**
- `apps/daemon/src/daemon.test.ts`:
  - "starts on a fresh home with no station.json yet (onboarding creates it) and reports why"
  - "onboards a fresh home over HTTP and the new Overseer answers in COMMS"
- `apps/station/src/pages/onboarding.test.tsx`:
  - empty station → onboarding, not the screens
  - asks for the OpenRouter key, or lets it wait
  - creates the Overseer and opens a first chat in COMMS
  - optionally adds the Project Manager
- `packages/runtime/src/crew/crew-service.test.ts`, "CrewService: onboarding and templates"
- Streaming: `packages/runtime/src/run/run-service.test.ts` (deltas published as ephemeral
  events, final message stored) and `apps/station/src/comms/comms.test.tsx`

**Manual**
1. `pnpm install && pnpm dev:fresh`, then open http://localhost:5173.
2. Onboarding says the fake model needs no key. Press Continue, name the Overseer, pick a tone,
   and press *Create the station and start chatting*.
3. COMMS opens with a new session. Send a message and watch the reply stream in.
4. *Real:* `OUTERWORLD_HOME=~/.outerworld pnpm dev` on a new directory. Onboarding asks for the
   OpenRouter key and checks it with OpenRouter. The rest is the same, with real replies.

## 2. A Project Manager granted Notion can be created in the UI and, via Overseer dispatch, update a Notion page with consent under *Ask first*, and the whole exchange is visible live

**Automated**
- Creating it:
  - `apps/station/src/pages/onboarding.test.tsx`, "adds a Project Manager from the Crew screen and opens it"
  - `apps/daemon/src/crew-routes.test.ts`, "adds a Project Manager from its template"
- Granting Notion, and consent on its writes (`packages/runtime/src/run/run-connectors.test.ts`):
  - "offers a granted connector's tools, namespaced, and calls them through the connector"
  - "asks for consent before a Notion write under Ask first"
  - "offers nothing from a connector the agent is not granted"

  These use a fake MCP server over `InMemoryTransport`.
- Dispatch (`packages/runtime/src/dispatch/dispatch.test.ts`):
  - result posted back, review
  - two workers running at once
  - cancel
  - budget stop
  - workers never get `dispatch`
  - steering
- `apps/daemon/src/comms-routes.test.ts`, "runs a dispatch end to end with the fake model and shows it on the lead's session"
- Visible live (`apps/station/src/comms/dispatch.test.tsx`):
  - the dispatch card's live status
  - the worker's session opening live, where it can be steered
  - the report card
  - Running now
- The consent card: `apps/station/src/comms/controls.test.tsx`
- The map shows a crew member waiting for approval: `apps/station/src/pages/station.test.tsx`

**Manual** (*real*; see [docs/connectors/notion.md](../connectors/notion.md))
1. `OUTERWORLD_HOME=~/.outerworld pnpm dev`. On Crew, press *Add a Project Manager*.
2. On Connectors, connect Notion and sign in. The tools appear, classed read or write.
3. In COMMS, ask the Overseer to have the Project Manager update a named page.
4. The dispatch card appears. Open it to watch the worker live. When the Notion write comes up,
   approve it from the card, from Notifications, or from the map. The report lands in the
   Overseer's session, and the Overseer reviews it.
5. *Optional smoke test:* the command in [notion.md](../connectors/notion.md#smoke-test-manual-real-network)
   lists Notion's tools with the stored sign-in and calls none.

## 3. The PM's daily-briefing schedule fires while the daemon runs, and its result appears in its session and in Notifications

**Automated**
- `packages/runtime/src/schedule/scheduler.test.ts` (a manual clock, no waiting):
  - runs at each occurrence in the schedule's own Scheduled session
  - daylight-saving changes
  - missed while the daemon was down, with and without catch-up
  - edits re-arm
  - busy and kill-switch skips
  - Run now
- `packages/core/src/notifications.test.ts`, "reports a scheduled run's result, but not every run's"
  (`run.completed` carries `trigger: "schedule"`)
- `packages/runtime/src/notifications/notifications.test.ts`,
  `apps/daemon/src/notification-routes.test.ts`, `apps/station/src/pages/notifications.test.tsx`
- `apps/daemon/src/schedule-routes.test.ts`, "runs a schedule now, into its own Scheduled session"
- `pnpm browser:verify` seeds a scheduled run with Run now (`scripts/browser/seed.mjs`), then
  checks Notifications and the crew page in both themes.

**Manual**
1. `pnpm dev`. Open Crew → Quill. On *daily-briefing*, edit the cron to the next minute (the
   preview shows when it will run) and turn it On.
2. Within a minute, Recent shows "ran · completed". *Open its session* shows the briefing, and
   Notifications shows "Quill finished a scheduled run." with an unread count.

## 4. Killing the daemon mid-run surfaces the run as *interrupted* on restart; nothing is lost or duplicated

**Automated**
- `packages/runtime/src/sessions/session-store.test.ts`, "finds every unfinished run, and after a
  restart marks them interrupted without touching finished ones"
- `packages/runtime/src/run/run-service.test.ts`, "surfaces runs left unfinished by a crash as
  interrupted, with an event each". Interrupted runs are never resumed or re-sent.
- `packages/runtime/src/run/run-controls.test.ts`, "after a restart, expires pending requests and
  interrupts their runs"
- `apps/daemon/src/daemon.test.ts`, "marks runs a crash left unfinished as interrupted before it
  serves"
- Notifications raises `run_interrupted`: `packages/core/src/notifications.test.ts`

**Manual**
1. `pnpm dev`. In COMMS, send Quill `use write_file {"path":"a.txt","content":"x"}` so it waits
   for consent, or send a long message.
2. Stop the dev server with Ctrl-C while the run is open, then run `pnpm dev` again.
3. The run shows *interrupted* in its session. Notifications says it was interrupted. The pending
   approval is gone. The Commander's message is still there exactly once, and no new run was
   started.

## 5. Memory proposals appear for approval; approved beliefs demonstrably affect the next run

**Automated**
- `packages/runtime/src/memory/memory.test.ts`: `remember` only proposes, never stores a belief
- `packages/runtime/src/memory/memory-service.test.ts`, "puts an approved belief in the next run's
  prompt and never a rejected one" (asserted on the model request), plus approve, edit, reject
  and delete
- `apps/daemon/src/memory-routes.test.ts`, `apps/station/src/pages/memory.test.tsx`
- `browser:verify` seeds a proposal and checks `/memory?agent=wren`.

**Manual**
1. `pnpm dev`. Send Vesper `use remember {"text":"The Commander likes short replies.","scope":"agent"}`.
2. Notifications and Memory → Vesper show it under *Awaiting your decision*. Edit it if you like,
   then press Remember.
3. *Real:* with OpenRouter, the next reply follows the belief. In any mode, the belief is in the
   next request's system prompt under "What you remember". The runtime test above asserts this.

## 6. Budget cap stops a run before exceeding it

**Automated** (`packages/runtime/src/run/run-controls.test.ts`)
- "stops a run before a model call once its per-run cap is reached"
- "blocks a new run at once when the station's daily cap is already spent"
- "warns once at 80% of a cap"
- `packages/runtime/src/dispatch/dispatch.test.ts`, "reports a worker stopped by a budget"
- Settings → Budgets: `apps/station/src/pages/budgets.test.tsx`, `apps/daemon/src/crew-routes.test.ts`

**Known limit:** the check runs before every model call, so the call that crosses a cap is allowed
to finish. A run can end a little over its cap (the owner saw $0.39 against $0.25), but no further
call is made after it. A pre-call estimate is in `tasks/todo.md` Follow-ups ("Budget limits").

**Manual**
1. Settings → Budgets: set *Per run* to `0.01` and save.
2. *Real:* send a message that needs a few steps. The run stops with "stopped by a budget", and
   Notifications and the map show it.

## 7. `pnpm check:task` green; CI uses a fake model provider and makes no network calls

**Automated**
- `pnpm check:task` runs lint, types, gitleaks, the floor guard, and every package's tests with
  coverage thresholds. `pnpm check:full` adds the build.
- `packages/runtime/src/test/no-network.ts` (a Vitest setup file) makes any non-loopback `fetch`
  or socket throw. The Notion smoke test is the only opt-out, and only by hand.
- Models in tests: `MockLanguageModelV4` (`ai/test`), or the runtime's scripted fake model.
  `browser:verify` runs the daemon with `OUTERWORLD_MODEL=fake` and `OUTERWORLD_SECRETS=memory`.
- CI (`.github/workflows/ci.yml`) has two jobs: quality (`check:full`) and browser
  (`browser:verify`).
