---
title: 'Home: fading notice under CREATE/JOIN; server icon with status tooltip'
type: 'feature'
created: '2026-11-27'
status: 'in-progress'
baseline_revision: '4751cc2fe4fa987cabb6479e3493c6c1045bfebe'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The home's top-left `SERVER: READY` text is a shared line. The connect flow also writes CONNECTING…, connect failures, the session-busy refusal, private-lobby errors and the resume failure into it, so the server readout turns into a status message. Eric hates this (2026-11-27).

**Approach:** Split the two jobs. (1) Every status message goes to a new notice slot in the empty space directly under the CREATE | JOIN row. It appears when triggered, stays 4 s, fades over 1 s, then goes back to blank. (2) The top-left becomes a server icon tinted by the probe state. Hovering or focusing it opens a small tooltip listing each game service and its status. Today that is one row, the game server: ONLINE / OFFLINE / CHECKING….

## Boundaries & Constraints

**Always:**
- Eric's rulings (AskUserQuestion, 2026-11-27): the queue modal (`ui/queueModal.ts`) stays exactly as it is, and the queue writes nothing to the notice. Icon tint: phosphor = ready, denied = unreachable, dim = checking. Notice timing: 4000 ms visible, then a 1000 ms fade, both kept as `CLIENT_CONFIG` feel knobs in `client/src/config.ts`.
- The notice slot has a fixed height that is always reserved, so nothing below or around it moves when a message appears or clears. Layout uses flex/grid flow only, with no `position:absolute` in the home layout. The tooltip is the one floating element, anchored to the icon's own wrapper, and it must not push the bars around.
- A new message replaces the current one and restarts the 4 s timer. `hide()` and re-mount clear any pending timer, so no timer leaks.
- The never-silence rule stays: a press while a join is in flight re-shows the last message (or CONNECTING…) and restarts its timer.
- The probe and the notice are now independent. The `statusLocked` lock is gone. A late probe only retints the icon and the tooltip.
- `handStatusBackToServer` (entering the pool, cancelling it) marks the probe `ready` and clears the notice. It no longer writes `SERVER: READY` into any text.
- Icon: Font Awesome Free solid `faServer` (`@fortawesome/free-solid-svg-icons`, the same major as the installed brands package), rendered as inline SVG in `currentColor`. Precedent: the footer's brand icons. The icon gets an accessible name and is keyboard-focusable, and focus also opens the tooltip.
- The tooltip's services come from a table, one entry per service (the `ui/communityLinks.ts` pattern). Copy: `GAME SERVER` with `ONLINE` / `OFFLINE` / `CHECKING…`, in the bar text register, uppercase, at no smaller than the existing 15 px bar text.
- Tokens only: `--hc-*` vars and CLIENT_CONFIG colors, no color literals.
- Complexity ≤ 10, and files at about 500 LOC or less where cohesive. `home.ts` is already 1138 lines, so new code goes into new modules: `ui/homeNotice.ts` and `ui/serverStatus.ts`.

**Block If:**
- A test or a served-HTML/crawlable contract requires the top-left status TEXT to exist in served HTML. Stop and report it; do not invent a served replacement.

**Never:**
- Touch the queue modal, its countdown, or its ESC/CANCEL behavior.
- Add copy beyond the strings named here.
- Pin copy or timing literals in tests (project rule: test contracts, not vocabulary).
- Touch `shared/` or `server/`, or bump `PROTOCOL_VERSION`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Message shown | `setStatus(text, tone)` | Notice shows the text in its tone, fully opaque. After the hold it fades, and after the fade the text is cleared | none |
| Message replaced mid-hold or mid-fade | second `setStatus` | Shows the new text at full opacity and restarts the timer. The old timer never clears the new text | none |
| Probe resolves during a connect | `setServerProbe('ready')` after `setStatus('CONNECTING…')` | Icon and tooltip update, and the notice is untouched | none |
| Probe unreachable | `setServerProbe('unreachable')` | Icon tinted denied, tooltip reads OFFLINE | none |
| Home hidden mid-hold | `hide()` | Timer cleared, and no callback touches a detached node | none |
| Press while busy | deploy press with `busy` | Last message (or CONNECTING…) re-shown, timer restarted | none |
| Queue entered / cancelled | `handStatusBackToServer` | Probe → ready, notice cleared | none |

</intent-contract>

## Code Map

- `client/src/ui/home.ts` -- `Home`/`HomeHandle`, `paintStatus`, `statusLocked`, `serverStatusLine`, `makeHandle`, `mountHome`, `deploy` (never-silence), `makeDeployStack` (where the notice slot goes, under `privateRow.root`)
- `client/src/ui/homeBars.ts` -- `makeHeader` / `makeBar` (left slot currently holds `statusEl`), `makeStatusEl`, `BAR_TEXT_CSS`, `SIZES` (add the notice height var for both normal and short windows)
- `client/src/main.ts:5968` -- the probe call. `:6011` `handStatusBackToServer`. `:6048`/`:6100` connect status. `:6525` resume-failed status
- `client/src/app/sessionLock.ts` / `client/src/app/privateLobby.ts` -- other `setStatus` callers (the `StatusSink` interface). The behavior is unchanged; they now land in the notice
- `client/src/ui/queueModal.ts` -- header comment says `h.statusEl` is the probe's. Update the comment only
- `client/src/ui/communityLinks.ts` / `client/vite.config.ts` -- precedent for the FA icon table and inline SVG
- `client/src/config.ts` -- CLIENT_CONFIG, where the timing knobs go
- `client/src/__tests__/home.test.ts`, `sessionLock.test.ts`, `privateLobby.test.ts`, `resumeWiring.test.ts` -- existing status tests to re-point

## Tasks & Acceptance

**Execution:**
- [ ] `client/package.json` -- add `@fortawesome/free-solid-svg-icons` (same major as brands) and install -- the server glyph
- [ ] `client/src/config.ts` -- add `homeNoticeHoldMs: 4000`, `homeNoticeFadeMs: 1000` -- Eric's timing
- [ ] `client/src/ui/homeNotice.ts` (new) -- the notice slot element plus `show(text, tone)` / `clear()` / `dispose()`, with an opacity transition and an injected clock/timer seam for tests -- the fading status register
- [ ] `client/src/ui/serverStatus.ts` (new) -- the services table, the pure `serviceStatusLines(state)`, the icon element with state tint, and the hover/focus tooltip -- the top-left readout
- [ ] `client/src/ui/home.ts` + `homeBars.ts` -- re-wire: the header left slot gets the server icon, the deploy stack gets the notice under CREATE/JOIN, `setStatus` → notice, `setServerProbe` → icon, remove `statusLocked` / `statusEl` / `serverStatusLine` text use, keep never-silence via `lastStatus`, dispose the notice in `hide()`. Update the retired-ruling comments so they describe the new owners -- the split
- [ ] `client/src/main.ts` -- `handStatusBackToServer` → `setServerProbe('ready')` plus clear notice (add `clearStatus()` to `HomeHandle`), and fix nearby comments -- no READY text writes
- [ ] `client/src/ui/queueModal.ts` -- comment-only update
- [ ] tests -- re-point the existing status tests to contracts. Add: notice shows → fades → clears (fake timers), replace restarts the timer, `hide()` clears the timer, probe never touches the notice, the tooltip lists one row per service with the state's word, icon tint follows the state (by token, not literal)

**Acceptance Criteria:**
- Given the home is open, when nothing has been triggered, then the space under CREATE | JOIN is blank and the top-left shows only the server icon.
- Given the cursor is on (or keyboard focus is on) the server icon, then a tooltip lists `GAME SERVER` and its status. Leaving or blurring closes it.
- Given a notice appears or clears, then no other home element changes position (fixed slot), including in a ≤ 600 px tall window.
- Given the player is queued, then the queue modal behaves exactly as before and the notice says nothing about the queue.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- clean (complexity ≤ 10)
- `npm test -w client` -- all green
- `npx tsc -p client --noEmit` -- clean
- `npm run check` -- once, at the end, by the orchestrator

**Manual checks:**
- Own dev server in the worktree (scratch ports, killed after). Playwright screenshots at 1366x768, 1920x1080 and about 1366x480, muted, bounded. Capture the icon, the tooltip open, a notice mid-hold, and blank after fade.
