---
title: 'Story 6-7 — Reconnection UX'
type: 'feature'
created: '2026-08-18'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-6-7-reconnection-ux-questions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** Three failures, all of which read to the player as the game breaking rather than the
network blipping. **A refresh loses the match outright** — no reconnection token is persisted
anywhere (`sessionStorage` is used nowhere in `client/src`), and even a hand-run resume would render
nothing, because `MSG.welcome` is sent from exactly one site inside `onJoin` and a resumed client
never gets one. **A captain who never returns is deleted silently** — at grace expiry
`Match.onPlayerLeave` books a placement and calls `world.removeShip`, which emits nothing, so the
hull vanishes mid-fight with no `sunk` event, no kill-feed line and no plume, and `checkWin()` runs
on the removal so an abandoning captain can *end the match*. **A captain sunk while away resumes
into limbo** — the own-`sunk` that latches the ELIMINATED modal and the placement was delivered to
nobody, so they spectate with no modal and no placement.

**Approach:** Three independent seams, no wire change. (1) Persist the reconnection token to
`sessionStorage`, re-written on every ack, and give the client a second, idempotent welcome consumer
so a fresh page load can resume. (2) Route grace expiry *and* consented abandon through a real
scuttle — `sinkShip(id)` with no killer — instead of a silent `removeShip`. (3) Synthesize the
missed death entry client-side from the spectator frame plus the player's own roster row.

## Boundaries & Constraints

**Always:**
- **`PROTOCOL_VERSION` STAYS 40.** No new `WelcomeMsg` field, no new `MSG` channel, no `ArenaState`
  widening, no new frame row. Re-sending an unchanged message from a new lifecycle hook is not a
  wire change (amendment-24 precedent: PV moves when the client *reads* new bytes; the shipped
  `MSG.results` re-send at `ArenaRoom.ts:922` is the in-repo precedent). **A new wire field in this
  diff is a defect, not a judgement call.**
- The re-sent welcome is **byte-identical** to the join welcome. Extract the payload builder and
  call it from both sites; **never re-run `world.addShip`** — that spawns a second hull for the same
  captain, which is the regression that would hurt most and show up least.
- `onReconnect` must be **total**. Core wraps it rethrow-true (`Room.mjs:1129-1130`), so a throw
  inside it aborts the resume via `FAILED_TO_RECONNECT`. It takes the `warnQuietly` posture every
  other room hook uses.
- The welcome is consumed **before `buildGame`, on the fresh-page path only** — never fed into a
  live `Game`, because `welcome.sessionId` → `createGameState` is not idempotent. Core calls
  `onReconnect` for **in-page** resumes too, so the client's welcome handling must stay idempotent
  either way.
- The persisted token is re-written on **every** ack and cleared on **any** failure. Persisting once
  at connect is a defect: an in-page resume rotates the token server-side, so a later refresh would
  carry a dead pre-resume token and fast-fail deterministically.
- **A scuttle credits nobody.** `sinkShip(id)` with `by` undefined — no kill tally, no XP, no bounty
  bonus (the victim is still `bty`-marked if they held the throne, which is existing behaviour).
- Leaving a match stays **RETURN TO PORT or ABANDON MATCH — never ESC, never a page refresh**
  (`client/src/ui/settings.ts:155`, ratified amendment 19). A refresh **resumes**; that is this law's
  own consequence, not a new policy.
- Every failure to resume is an **ordinary outcome**, not an error: expired token, disposed room,
  redeployed server all land on home with a plain explanation, never a dead screen.

**Block If:**
- Any part of the work appears to require a `PROTOCOL_VERSION` bump or a new wire field. Stop and
  report — every ruling in this cycle went the other way deliberately.
- Making the scuttle non-creditable turns out to need a design decision (e.g. it would change how
  storm deaths or self-kills are booked). Stop and report; do not invent a rule.

**Never:**
- **No match URL.** No Express SPA route, no `history.replaceState`, no published `matchId`, no id
  resolver, no party id-space. Withdrawn by Eric mid-gate (R0) — investigated, considered, parked.
- **No catch-up of missed `sunk` events** (R6). A resuming player simply missed those feed lines.
- **No banner copy change** (R10). `RECONNECTING…` stays exactly as it is — no countdown, no attempt
  count.
- **No grace budget or reconnection cap** (R8). Grace chaining stays unlimited.
- **No live spectate** (R12) and no new observer class in `frames.ts`.
- **No new leave UI.** `ABANDON MATCH` already ships, confirm-gated.
- No wire field for the telegraph restore (R11) — if it cannot be inferred client-side, accept the
  reset.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Wifi blip, page stays loaded | Socket drops, match active, hull alive | Unchanged from today: `RECONNECTING…` banner, SDK retries, seamless resume. The re-sent welcome is ignored idempotently | No error expected |
| Refresh mid-match, inside grace | Page reloads, stored token valid, hull alive | Resume into own hull with correct pose, hp, boons, class; welcome consumed before `buildGame`; banner never shown | No error expected |
| Refresh mid-match, past 60s grace | Stored token expired server-side | Land on home with a plain explanation; stored token cleared | Ordinary outcome, not an error |
| Refresh after an in-page resume | Token rotated server-side by the earlier resume | Resume succeeds, because the persisted token was re-written on that resume's ack | Stale-token fast-fail is the defect this prevents |
| Refresh after ABANDON MATCH | Player left deliberately, token cleared | Home. No resume attempted | No error expected |
| Grace expires, hull still alive | 60s elapsed, captain never returned | Hull is **scuttled**: real `sunk` event, kill-feed line, plume, placement. Credits nobody. Cannot win the match | No error expected |
| Consented ABANDON MATCH mid-match | Player confirms in settings | Identical to grace expiry — same scuttle path (R4) | No error expected |
| Own hull sank while disconnected | Resume, own roster row `alive=false`, spectator frame | ELIMINATED modal synthesized on first resumed frame, with approximate placement | Must not double-open if a real `sunk` also arrives |
| Match finished while away | Resume after `finished` | Existing behaviour: `lastResults` re-sent, elimination modal correctly suppressed | Already handled today |
| Refresh on a browser without Web Locks | localStorage-heartbeat fallback holds a ≤1s-old key | Resume proceeds — the reloaded page recognizes its own predecessor | Must NOT refuse itself with `ALREADY AT SEA IN ANOTHER TAB` |

</intent-contract>

## Code Map

- `server/src/rooms/ArenaRoom.ts` — sole `MSG.welcome` send site (`:815`, inside `onJoin`); `onDrop`
  (`:892`) → `dropPolicy` → `allowReconnection(60s)` (`:911`); `onLeave` (`:942`) → `teardown`
  (`:975`); `lastResults` re-send (`:922`). Gains `onReconnect`.
- `server/src/game/match.ts` — `onPlayerLeave` (`:475-484`): the silent-deletion site. `dropPolicy`
  (`:167-174`), `recordSink` (`:716-731`), `checkWin`.
- `server/src/game/world.ts` — `sinkShip(id, by?)` (`:1602`): with `by` undefined it already grants
  no kill, no XP and no bounty bonus — exactly the scuttle semantics. `removeShip` (`:1424-1435`),
  which emits nothing.
- `client/src/net/connection.ts` — join path, `RECONNECT_MAX_RETRIES = 18` (`:170`), SDK reconnect
  config (`:436-437`), the sole welcome consumer inside `waitForWelcome` (`:222-233`),
  `connectErrorStatus` copy (`:480-486`).
- `client/src/main.ts` — `onDrop`/`onReconnect` bindings (`:2596-2610`), `handleRoomLeave`
  (`:1751-1766`), `handleSunkObserved` (`:1381`), `buildGame`/`createGameState` (`:2265+`).
- `client/src/score.ts` — `canOpenElimination` (`:362-364`), `recordElimination`,
  `scoreAfterReconnect` (`:441-449`).
- `client/src/app/sessionLock.ts` — Web Locks + localStorage-heartbeat fallback; `SESSION_STALE_MS`
  (`:55`), `acquireStorageLock` (`:329-336`). No unload release today.
- `client/src/input/telegraph.ts` — `NEUTRAL_INDEX` reset (`:52-53`).
- `server/src/__tests__/reconnect.test.ts` — the existing 396-line regression net.

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/rooms/ArenaRoom.ts` -- extract the welcome payload into a builder used by both
  `onJoin` and a new total `onReconnect(client)` -- a refreshed page cannot render without it, and
  re-running `onJoin` would spawn a second hull.
- [ ] `server/src/game/match.ts` -- route `onPlayerLeave` through a scuttle instead of a silent
  `removeShip` -- makes the departure legible and stops an abandoning captain ending the match.
- [ ] `server/src/game/world.ts` -- add the scuttle seam if `sinkShip(id)` alone is insufficient
  (ordering of sink → founder window → removal) -- do not change storm/self-kill credit semantics.
- [ ] `client/src/net/connection.ts` -- persist the reconnection token to `sessionStorage`, re-write
  it on every ack, clear on any failure; add a resume-on-load path -- the token dying with the JS
  heap is why a refresh fails today.
- [ ] `client/src/main.ts` -- consume the welcome on the fresh-page path before `buildGame`;
  synthesize the ELIMINATED entry when a resumed frame shows own `alive=false` -- closes the
  mystery-death gap.
- [ ] `client/src/app/sessionLock.ts` -- make a refresh recognize its own predecessor (per-tab holder
  id) plus a `pagehide` release -- otherwise refresh-resume deterministically self-refuses on the
  fallback backend.
- [ ] `client/src/input/telegraph.ts` (+ caller) -- restore the engine order on resume **only** if it
  can be inferred from own-ship kinematics; otherwise leave as-is -- no wire field is authorized.
- [ ] `server/src/__tests__/reconnect.test.ts` -- extend: a resume gets a welcome; **ship count
  unchanged across a resume**; a scuttle emits `sunk`, credits nobody, and does not end the match
  wrongly.
- [ ] `client/src/__tests__/connection.test.ts` -- token persisted, re-written on ack, cleared on
  failure; a stale token lands cleanly on home.
- [ ] `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/EXPERIENCE.md` --
  update line 106 only, to the shipped resume flow -- a change signal authorizes only what it rules
  on.
- [ ] `_bmad-output/implementation-artifacts/epic-6-context-amendments.md` -- append amendments 46+
  recording R0-R13 -- the amendments file is the durable home; the compiled epic context is not.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- close `:22` (grace budget, R8) and
  `:514` (silent departures, R3/R5) with their rulings; leave `:26` open for the original
  double-fault window; close `:30`/`:518`'s own-death half via R7 and record R6's accept-the-gap.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` + `_bmad-output/gds-workflow-status.yaml`
  -- both trackers, same PR -- a landed story updates both or it has drifted.

**Acceptance Criteria:**
- Given a live match and a mid-match page refresh inside the grace, when the page reloads, then the
  captain resumes into their own hull with correct pose, hp, boons and class, and no second hull
  exists in the world.
- Given a refresh after an earlier in-page reconnect, when the page reloads, then the resume
  succeeds — proving the persisted token was rotated rather than staled.
- Given a captain who never returns, when the 60s grace expires, then their hull is scuttled with a
  `sunk` event that reaches every client, credits no killer, pays no XP and no bounty, and books the
  same placement it books today.
- Given a captain who confirms ABANDON MATCH, when the leave fires, then the outcome is identical to
  the grace-expiry scuttle.
- Given a captain whose hull sank while they were disconnected, when they resume, then the ELIMINATED
  modal opens exactly once with a placement, and a subsequently-delivered real `sunk` does not
  re-open it.
- Given any failed resume, when it fails, then the player lands on home with a plain explanation and
  the stored token is cleared — never a dead screen, never a reload loop.
- Given the whole diff, when reviewed, then `PROTOCOL_VERSION` is still 40 and no new wire field,
  message channel or schema property exists.

## Spec Change Log

## Review Triage Log

## Design Notes

**The scuttle's two traps.** (1) `Match.onPlayerLeave` currently calls `recordSink` *and*
`removeShip`; `sinkShip` also does its own bookkeeping (`deaths += 1`, lifecycle transition, the
`sunk` event). Naively adding `sinkShip` beside `recordSink` will **double-book the placement**.
(2) `sinkShip` opens the Story 5.2 five-second sinking window and `founderSinking` closes it —
removing the ship immediately afterwards truncates that window, so the plume and the `sunk` grammar
the ruling exists to produce would be cut short. Sink first, remove when it founders.

**Why the welcome re-send is inert today.** There is exactly one client consumer and it sits inside
an already-settled promise (`connection.ts:222-233`), so a second welcome calls `clearTimeout` on a
dead timer and `resolve()` on a settled promise — both no-ops. The server-side hook alone changes
nothing observable; the client half is what makes the feature exist.

**Why `sessionStorage` and not `localStorage`** (R2): it survives a refresh, is scoped per-tab so a
second tab cannot inherit a session, and dies with the tab. Tab-close resume was offered and
declined. The server's 60s grace bounds the token's usefulness either way, so this is a scoping
choice, not a credential-lifetime one.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), type-check clean across
  shared/server/client, and the full suite green with the new cases added (4309 + new).
- `git grep -n "PROTOCOL_VERSION" shared/src/index.ts` -- expected: still `40`.

**Manual checks:**
- Two clients in a dev arena; refresh one mid-match. It returns to its own hull inside the grace; the
  other client sees no second hull and no roster change. Repeat past 60s and confirm a clean,
  explained landing on home.
- Drop a client and let the grace expire: the other client sees a kill-feed line and a plume, and no
  player's kill count increases.
