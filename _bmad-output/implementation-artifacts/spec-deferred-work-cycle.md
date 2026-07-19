---
title: 'Deferred-Work Cycle: triage log, JOINING-guard regression tests, matchSmoke hardening'
type: 'chore'
created: '2026-07-18'
status: 'in-progress'
baseline_revision: '39aa2083cca7cb26a70fa5c3534a9627d3ab6e5f'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/project-context.md']
warnings: [multiple-goals]
---

<intent-contract>

## Intent

**Problem:** The deferred-work log (`_bmad-output/implementation-artifacts/deferred-work.md`) holds 9 items. Investigation shows two are already resolved in the tree but unrecorded (PROTOCOL_VERSION join gate — shipped with story 0.2; JOINING-client frame guard + deadline kick — shipped with story 0.3 but with zero regression-test coverage), one is real open engineering work (matchSmoke flakiness: a permanent 90u storm-safe pocket drones actively seek, plus torpedo-luck budgets), and the rest are design decisions reserved for Eric.

**Approach:** One cycle, one PR: (a) add regression tests pinning the JOINING-client guard and deadline kick, (b) fix matchSmoke's drone-camp pocket and budget flakiness inside the smoke script only, (c) append a dated triage section to the deferred-work log recording what is resolved, what this cycle fixed, and what remains deferred pending Eric.

## Boundaries & Constraints

**Always:** Keep `npm run check` green (lint, tsc ×3, all tests). Follow `_bmad-output/project-context.md` rules (complexity ≤ 10; no `Math.random`/`Date.now` in sim code; `game/world.ts`/`match.ts` stay Colyseus-free). New room tests follow the existing bare-`new ArenaRoom()` injection pattern from `server/src/__tests__/reconnect.test.ts` — no `@colyseus/testing`, no real sockets. `deferred-work.md` is append-only: never edit or delete existing entries, only append.

**Block If:** matchSmoke cannot reach 3 consecutive clean passes without changing files outside `server/scripts/matchSmoke.mjs` (e.g. it would require touching `shared/` sim, `roomOptions.ts` plumbing, or match/zone semantics) — that means the flake is not test-local and needs Eric's call. Also block if investigation contradicts the "already implemented" findings (guard at `ArenaRoom.ts:634` or `kickIfStillJoining` missing/behaviorally different).

**Never:** Do not implement the five design-reserved deferred items (grace-budget chaining, half-resume token policy, sunk-while-away death UX, match.abort telemetry reclassification, PortalAdapter seam extensions) — they stay deferred to Eric/Epics 5-7. Do not add a world-seed room option or any new dev room option. Do not change `CONFIG` gameplay values, `PROTOCOL_VERSION`, or any wire type. Do not touch production code paths for the smoke fix. Do not bump `VERSION` (no shipped-game behavior changes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Frame send to unconfirmed client | fake client with `state: ClientState.JOINING` in `room.clients` during `afterStep()` | `client.send` never called for it; JOINED peers still receive `MSG.frame` | No error expected |
| Client confirms join | same client flips to `JOINED` before next `afterStep()` | receives frames from that tick on | No error expected |
| Client stuck in JOINING past deadline | joining deadline elapses (drive `kickIfStillJoining` directly or via fake clock) | `client.leave(CloseCode.WITH_ERROR)` called; roster slot freed via normal teardown | No error expected |
| Client joined before deadline | client reaches `JOINED`, deadline fires anyway | no kick — `kickIfStillJoining` is a no-op for JOINED clients | No error expected |
| matchSmoke full run | `node server/scripts/matchSmoke.mjs` on a free port | all steps pass; drones die to storm at end-radius 0; results broadcast with winner A | Non-zero exit with step-labelled assert on failure |
| matchSmoke port squatted | foreign listener already on smoke port | refuses to boot with clear message (copy `metricsSmoke` `portOpen` guard) | Clean abort, no orphan server |

</intent-contract>

## Code Map

- `server/src/rooms/ArenaRoom.ts` -- guard exists at `afterStep()` (~L634: `client.state !== ClientState.JOINED` skip); `armJoiningDeadline` (~L341), `kickIfStillJoining` (~L348), re-armed on reconnect (~L419). Read-only this cycle; tests pin it.
- `server/src/__tests__/reconnect.test.ts` -- the harness pattern to copy: bare `new ArenaRoom()`, injected `world`/`state`/`clients`, fake client literals, private-method invocation.
- `server/src/__tests__/` -- new test file `joiningGuard.test.ts` goes here.
- `shared/src/constants.ts` -- `CONFIG.net.joiningDeadlineSeconds: 10` (~L223); reference in tests, do not change.
- `server/scripts/matchSmoke.mjs` -- the only file the smoke fix may touch: `ZONE_OVERRIDE.endRadiusFraction` 0.1→0 (kills the 90u pocket; `isOutside` is strict `>` so only 0 leaves no safe puddle), step budgets, post-B-sunk input behavior for A if needed, `portOpen` pre-boot guard.
- `server/scripts/metricsSmoke.mjs` -- source of the `portOpen` guard pattern (~L259).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append triage section.

## Tasks & Acceptance

**Execution:**
- [x] `server/src/__tests__/joiningGuard.test.ts` -- new regression suite covering all four room-guard rows of the I/O matrix -- pins the story-0.3 hardening that currently has zero coverage.
- [x] `server/scripts/matchSmoke.mjs` -- set `ZONE_OVERRIDE.endRadiusFraction: 0`; lengthen step budgets to absorb torpedo luck and the storm-kill tail (storm floor lands at grace 45s + shrink 60s = t≈105s after go-live; battleship drone 120hp / 4dps needs +30s — size step-5 budget ≥ 180s accordingly); add `portOpen` pre-boot guard; if A drifts storm-dead after B sinks, adjust only the script's post-sink input behavior -- makes the one manual full-lifecycle smoke deterministic-ish and re-runnable.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append a dated `## 2026-07-18 — deferred-work cycle triage` section: items 1+3 resolved by story 0.2 (gate live: `roomOptions.ts` `protocolVersionError`, `ArenaRoom.onAuth` ServerError 525, client `connectErrorStatus` refresh message — tested in `connection.test.ts`/`reconnect.test.ts`); item 2 resolved by story 0.3 + tests added this cycle; matchSmoke item fixed this cycle; remaining five items restated as reserved for Eric (Epics 5/6.7/7) -- keeps the log truthful as the single deferred-work source.

**Acceptance Criteria:**
- Given the new test suite, when `npm test -w server` runs, then all four guard scenarios pass without real sockets and the suite fails if the `afterStep` guard or `kickIfStillJoining` is removed.
- Given the hardened smoke, when `node server/scripts/matchSmoke.mjs` is run 3 times consecutively, then all 3 runs exit 0.
- Given the appended triage section, when the deferred-work log is read, then every one of the 9 original items has an unambiguous disposition (resolved / fixed-this-cycle / reserved-for-Eric) and no existing entry was modified.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` -- expected: lint + tsc ×3 + all tests green (653 + new suite).
- `for i in 1 2 3; do node server/scripts/matchSmoke.mjs || exit 1; done` -- expected: 3 consecutive exit-0 runs.
- `git diff --stat` -- expected: no changes outside the three task files plus this cycle's workflow artifacts (`spec-deferred-work-cycle.md`).
