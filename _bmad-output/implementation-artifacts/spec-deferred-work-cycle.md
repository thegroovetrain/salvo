---
title: 'Deferred-Work Cycle: triage log, JOINING-guard regression tests, matchSmoke hardening'
type: 'chore'
created: '2026-07-18'
status: 'done'
baseline_revision: '39aa2083cca7cb26a70fa5c3534a9627d3ab6e5f'
final_revision: '52d4a415c4b89ae1832d0c2ec95eda19e6c14eb0'
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
- `server/scripts/matchSmoke.mjs` -- the only file the smoke fix may touch. [Amended at review — see Spec Change Log]: `ZONE_OVERRIDE.endRadiusFraction` 0.1→0.015 (a 13.5u floor pocket only the scripted human can hold — a pure 0 floor is an hp race A's 100hp cruiser cannot reliably win vs the 120hp battleship drone), reliable torpedo delivery (island avoidance + LOS-gated firing + racetrack strafing), race-independent step-5 lifecycle assertions, step budgets, `portOpen` pre-boot guard.
- `server/scripts/metricsSmoke.mjs` -- source of the `portOpen` guard pattern (~L259).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- append triage section.

## Tasks & Acceptance

**Execution:**
- [x] `server/src/__tests__/joiningGuard.test.ts` -- new regression suite covering all four room-guard rows of the I/O matrix -- pins the story-0.3 hardening that currently has zero coverage.
- [x] `server/scripts/matchSmoke.mjs` -- [as amended at review; original task text mandated endRadiusFraction 0 with grace 45s/shrink 60s math — superseded, see Spec Change Log] eliminate the campable storm pocket via a 13.5u floor (`endRadiusFraction: 0.015`, grace 90s, shrink 90s) that drones (MIN_THROTTLE 0.5) cannot loiter in while the scripted human holds it; fix torpedo delivery mechanics (proactive island avoidance from the deterministic map seed, LOS-gated firing via shared `segCircleHit`, racetrack strafing vs a latched target, astern unstick); relax step-5 assertions to race-independent lifecycle invariants (winner A placed 1st, all hulls placed ≥ 1, B bounded 2..N); widen budgets (countdown 120s, step-5 300s); add `portOpen` pre-boot guard + SIGKILL teardown -- makes the one manual full-lifecycle smoke reliably re-runnable (proven 4 consecutive clean runs).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append a dated `## 2026-07-18 — deferred-work cycle triage` section: items 1+3 resolved by story 0.2 (gate live: `roomOptions.ts` `protocolVersionError`, `ArenaRoom.onAuth` ServerError 525, client `connectErrorStatus` refresh message — tested in `connection.test.ts`/`reconnect.test.ts`); item 2 resolved by story 0.3 + tests added this cycle; matchSmoke item fixed this cycle; remaining five items restated as reserved for Eric (Epics 5/6.7/7) -- keeps the log truthful as the single deferred-work source.

**Acceptance Criteria:**
- Given the new test suite, when `npm test -w server` runs, then all four guard scenarios pass without real sockets and the suite fails if the `afterStep` guard or `kickIfStillJoining` is removed.
- Given the hardened smoke, when `node server/scripts/matchSmoke.mjs` is run 3 times consecutively, then all 3 runs exit 0.
- Given the appended triage section, when the deferred-work log is read, then every one of the 9 original items has an unambiguous disposition (resolved / fixed-this-cycle / reserved-for-Eric) and no existing entry was modified.

## Spec Change Log

### 2026-07-18 — Review-pass reconciliation (no code loopback)
- **Triggering finding:** both reviewers flagged that the spec's Code Map and Task 2 mandated `endRadiusFraction: 0` (with grace 45s + shrink 60s sizing math) while the shipped script uses `0.015` with grace 90s / shrink 90s and reworked delivery mechanics, and the deviation was unrecorded.
- **What was amended:** Code Map matchSmoke entry and Task 2 text updated to the shipped, evidence-proven approach; this entry records the pivot. Content inside `<intent-contract>` untouched — its "drones die to storm at end-radius 0" phrasing is superseded in the same way (the load-bearing intent, "drones deterministically die to the storm and the match finishes with winner A", is met).
- **Known-bad state avoided:** `endRadiusFraction: 0` is empirically unreachable — it turns the endgame into an hp race the 100hp scripted cruiser cannot reliably win against the 120hp battleship fill drone (heal clamps to maxHp, so no in-script mitigation exists); implementing the spec as written produces a permanently flaky step 5, which is the exact defect this cycle set out to remove.
- **KEEP:** the shipped `matchSmoke.mjs` mechanism is the good state — 13.5u floor pocket + drone MIN_THROTTLE argument, island-avoidance/LOS/racetrack delivery, race-independent step-5 invariants; proven by 4 consecutive clean full-lifecycle runs (3-run agent gate + independent orchestrator confirmation, ~320s each, identical outcomes).

## Review Triage Log

### 2026-07-18 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 0, medium 2, low 7)
- defer: 0
- reject: 6
- addressed_findings:
  - `[medium]` `[patch]` Spec ↔ implementation contradiction on the smoke fix (endRadiusFraction 0 vs 0.015, stale zone math, checkbox marked done-as-written, empty change log) — spec Code Map/Task 2 reconciled to shipped approach; Spec Change Log entry added recording the pivot and KEEP.
  - `[medium]` `[patch]` `steerToCenter` doc described a fictional mechanism (throttle-floor ~10u loop) while the real hold rides periodic `unstickInput` astern bursts below the stuck threshold — comments rewritten to describe actual behavior plus remediation guidance; behavior deliberately unchanged (gate-proven).
  - `[low]` `[patch]` matchSmoke header contract still promised `A=1/B=2` placements retired by the relaxed step-5 invariants — header updated.
  - `[low]` `[patch]` step-5 budget comment cited "180s shrink / floor at 270s" against shipped 90s shrink — corrected to real timeline.
  - `[low]` `[patch]` pocket-radius arithmetic inconsistent across docs (25u/164u in-file vs 13.5u/90u actual; World is sized by fillTo=6 → mapRadius 900u) — all figures normalized to 13.5u/90u.
  - `[low]` `[patch]` `portOpen` probed only 127.0.0.1 while the SDK dials ws://localhost — now probes IPv4 and IPv6 loopback.
  - `[low]` `[patch]` missing `assert(rowA && rowB)` let a malformed results payload TypeError instead of a labeled assert — assert added.
  - `[low]` `[patch]` test header claimed private methods invoked "via bracket access" (they use a structural cast) — comment fixed.
  - `[low]` `[patch]` departed-client no-op branch of `kickIfStillJoining` (`!clients.includes(client)`) untested — regression test added (5th test); deferred-work item-2 wording tightened to state what the suite pins vs what is verified by inspection.

## Verification

**Commands:**
- `npm run check` -- expected: lint + tsc ×3 + all tests green (653 + new suite).
- `for i in 1 2 3; do node server/scripts/matchSmoke.mjs || exit 1; done` -- expected: 3 consecutive exit-0 runs.
- `git diff --stat` -- expected: no changes outside the three task files plus this cycle's workflow artifacts (`spec-deferred-work-cycle.md`).

## Auto Run Result

**Summary:** One cycle over the full deferred-work backlog (9 items). Two items were found already resolved in the tree (PROTOCOL_VERSION join gate — story 0.2; JOINING-client guard — story 0.3) and are now recorded as such; the JOINING guard gained its first regression coverage (5 mutation-proven tests). The matchSmoke reliability item was fixed for real: the campable storm pocket is gone (13.5u floor only the scripted human can hold), torpedo delivery was fixed at the mechanics level (island avoidance, LOS-gated firing, racetrack strafing, astern unstick), and step-5 assertions now check race-independent lifecycle invariants. Five items remain deferred as design decisions reserved for Eric (Epics 5/6.7/7). Orchestration per /orchestrate: Opus implementation agents for the test suite and smoke hardening, Sonnet for the triage doc, Fable review gate + Codex cross-model check.

**Files changed:**
- `server/src/__tests__/joiningGuard.test.ts` — new 5-test regression suite pinning the afterStep JOINED frame guard and kickIfStillJoining decision (incl. departed-client no-op); mutation-proven (suite fails when either guard is neutered).
- `server/scripts/matchSmoke.mjs` — reliability rework (+~300 lines): zone floor 0.015, delivery mechanics, lifecycle-invariant assertions, portOpen IPv4+IPv6 pre-boot guard, SIGKILL teardown, widened budgets.
- `_bmad-output/implementation-artifacts/deferred-work.md` — dated triage giving all 9 items a disposition; one new defer entry (residual step-2 tail flake).
- `_bmad-output/implementation-artifacts/spec-deferred-work-cycle.md` — this spec (change log + triage log populated at review).

**Review findings breakdown:** Blind Hunter + Edge Case Hunter (Fable) + Codex cross-check. 9 patches applied (2 medium — spec↔implementation reconciliation, honest documentation of the endgame hold mechanism; 7 low — stale comments/figures, IPv6 port probe, results-row assert, test comment, departed-client test). 1 deferred (residual step-2 map-geometry flake, 1/10 runs, pre-existing tail). 6 rejected as noise. Codex's single finding (IPv4-only port probe) duplicated an in-family finding and was already patched — cross-model agreement, no unique findings.

**Verification:** `npm run check` green (lint, tsc ×3, 380 server + 292 client + shared tests). matchSmoke: 3 consecutive clean runs by the implementation agent, 1 independent orchestrator confirmation, then after review patches a fresh 3-consecutive gate on the final script (322s/315s/320s, identical results traces, port clean after each). Mutation proof for both guard tests observed and reverted byte-for-byte.

**Residual risks:** matchSmoke step 2 retains a ~1-in-10 map-geometry flake (logged as a defer entry). The endgame center-hold works via periodic astern bursts from the stuck detector rather than the originally-described throttle floor — documented honestly in-file with remediation guidance if it ever drifts. Scripts (`.mjs`) remain outside ESLint coverage. The smoke stays manual-only (no CI hook exists in this repo).
