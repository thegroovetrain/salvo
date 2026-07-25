---
title: 'Gun-family shell speed standardization + Return to Port fix'
type: 'bugfix'
created: '2026-07-25'
status: 'in-progress'
baseline_revision: '7df936ae4bf2031c91d242252ea3ecdaa8bed347'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** (1) The results screen's RETURN TO PORT button can permanently dead-end: `returnToPort()` (`client/src/main.ts:563`) latches `g.returning` then awaits `requestAdBreak()` → `g.room.leave()` with no timeout; `leave()` hangs forever if the socket already closed (server disposes the room 10s after finish), the latch also disarms `handleRoomLeave`'s fallback reload, and the UX-ratified Enter/ESC keys (UX-DR27) were never implemented — no path home. (2) Gun-family projectiles are far too slow (gun/starShells 130 u/s, cannon 200 u/s ⇒ 5.0s flight at max range 650u), Eric ruling 2026-07-25: standardize all three to one much faster value with counterplay preserved.

**Approach:** (1) Extract the return chain into a testable factory, time-box `room.leave()` (race vs ~1000ms timer) so the chain always settles to `location.reload()`; add Enter/ESC = Return to Port while the results overlay is up. (2) Set `CONFIG.gun.shellSpeed = CONFIG.cannon.shellSpeed = CONFIG.starShells.shellSpeed = 300` (Fable ruling under Eric's delegation, flagged for veto); update the two pinning tests deliberately.

## Boundaries & Constraints

**Always:**
- Keep the portal ad-break ordering: `requestAdBreak()` (already 35s-bounded by `safeAdapter`) completes BEFORE the bounded `leave()` → reload; never let a future real ad be cut off by this fix.
- Keep the double-click latch semantics (second click is a no-op); the fix is that the chain always settles, not removing the latch.
- Speed change is `shared/src/constants.ts` literals + comments only — no `effectiveStats()`/upgrade coupling exists and none may be added; no wire-contract change, PROTOCOL_VERSION stays 12.
- `collision.test.ts` rewrite must keep a genuine worst-case-from-CONFIG tunneling proof: include the WHOLE gun family (+torpedo) in `maxProjSpeed` and assert swept detection (`segCircleHit` vs `MAP_RULES.MIN_R` island; `segPolygonHit` vs thinnest hull broadside) at that speed.
- New client tests use the extracted factory with fake timers; the leave()-never-settles case must fail against the pre-fix behavior.

**Block If:** the standardized speed would require touching torpedo/mine values, perception rules, or the wire contract to keep tests green.

**Never:** touch `CONFIG.torpedo.*` / `CONFIG.mine.*`; change damage/reload/burst/range of any weapon; reorder ad break after leave; add a shellSpeed upgrade; modify `goldenFrames.test.ts:199,347` / `perception.test.ts:416` (their literal `130`s are spawn x-coordinates, not speed pins); split into multiple PRs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy return | Results shown, click RETURN TO PORT, socket alive | ad break settles → leave() resolves → `location.reload()` | No error expected |
| Dead room | Socket already closed when clicked | leave() never settles → timeout (~1000ms) wins race → reload anyway | Race timer is the handler |
| leave() rejects | leave() throws | catch → reload still fires | swallow, reload |
| Keyboard return | Results shown, press Enter or ESC | identical to click (same `returnToPort`) | — |
| Double activation | Click/key twice | second is a no-op (latch); first chain still reloads | — |
| Refit-modal ESC | Alive, TAB modal open, press ESC | closes modal only — results keys must be gated on results phase | — |

</intent-contract>

## Code Map

- `client/src/main.ts` -- `returnToPort()` :563-576 (the defect), `handleRoomLeave()` :579-591, `handleEscape` :396, keydown chokepoint (Story 2-1) — wire results-phase Enter/ESC here
- `client/src/ui/results.ts` -- overlay + button (:97 listener); already correct, add no logic
- `client/src/portal/safeAdapter.ts` -- proves `requestAdBreak()` self-bounds at 35s
- `shared/src/constants.ts` -- :153 gun, :249 cannon (comment "fastest projectile afloat" goes stale), :272 starShells (comment "= the standard gun's")
- `shared/src/__tests__/barrel.test.ts` -- :99-125 literal `toEqual` pins of cannon/starShells blocks — must edit
- `shared/src/__tests__/collision.test.ts` -- :23,100-115 obsolete `< beam` ceiling (=180 u/s; cannon at 200 already violates it, test omits cannon) — rewrite as swept-detection proof
- `server/src/__tests__/cannon.test.ts` :53, `starShells.test.ts` ~:56, `combat.test.ts` :269 -- stale speed prose in comments only; assertions auto-track
- `client/src/__tests__/results.test.ts` -- extend; new `returnToPort.test.ts` beside it
- `VERSION` + root `package.json` -- 0.17.0 → 0.17.1 (bugfix/tuning revision)
- `_bmad-output/gds-workflow-status.yaml` -- advance `last_updated` + append cycle note (standing directive)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/main.ts` -- extract `makeReturnToPort(deps: { requestAdBreak, leaveRoom, reload, onStart })` (or equivalent seam) used by `returnToPort`; chain = adBreak → `Promise.race([leaveRoom(), delay(1000)])` → `finally(reload)` -- the hang can no longer strand the player _(factory lives in the new `client/src/app/returnToPort.ts`; main.ts holds one instance per Game via `makeGameReturnToPort`)_
- [x] `client/src/main.ts` -- in the Story 2-1 keydown chokepoint, when match phase is results (results overlay up): Enter and ESC invoke the same return path; keep refit-ESC behavior when alive -- implements UX-DR27 _(new `onConfirm` hook + `Enter`/`NumpadEnter` binding in input/keyboard.ts; both gated on `state.matchOver`)_
- [x] `client/src/__tests__/returnToPort.test.ts` -- new; fake-timer tests for every I/O row incl. the never-settles pin -- regression proof
- [x] `client/src/__tests__/results.test.ts` -- add: button click fires callback exactly once; double `showResults` leaves one overlay with a live button -- DOM wiring pin
- [x] `shared/src/constants.ts` -- set all three `shellSpeed` to 300; rewrite the two stale comments to "standardized gun-family muzzle velocity (Eric ruling 2026-07-25)" -- the balance change
- [x] `shared/src/__tests__/barrel.test.ts` -- update literal pins to 300 -- deliberate re-pin
- [x] `shared/src/__tests__/collision.test.ts` -- `maxProjSpeed = max(gun, cannon, starShells, torpedo)`; replace the `< beam`/`< 2*MIN_R` margin assertions with swept-detection assertions at `maxTravel` -- closes the latent cannon-omission gap
- [x] `server/src/__tests__/{cannon,starShells,combat}.test.ts` -- refresh stale speed prose in comments -- doc hygiene
- [x] `VERSION` + `package.json` -- bump 0.17.1 -- versioning rule
- [x] `_bmad-output/gds-workflow-status.yaml` -- `last_updated: 2026-07-25` + one-line cycle summary appended to the comment -- standing directive
- [x] `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap` -- regenerated (not in the Code Map): the fixture pins serialized frames, so the injected shells' `vx`/`vy` (derived from `CONFIG.gun.shellSpeed`) and the burst scenarios' tick counts move with the speed change; `goldenFrames.test.ts` itself untouched
- [x] `client/src/__tests__/keyboard.test.ts` -- `Enter`/`NumpadEnter` moved from the unbound list to the preventDefault-every-bound-key list + an `onConfirm` press-edge test -- the chokepoint's own pin

**Acceptance Criteria:**
- Given the results screen with a dead socket, when RETURN TO PORT is clicked (or Enter/ESC pressed), then the client reloads to the home screen within ~1.5s.
- Given a live socket, when returning, then the ad-break seam still runs to completion before leave/reload (null adapter today: instant).
- Given the new speed, when any of gun/cannon/starShells fires, then shell speed on the wire is 300 u/s and max-range flight ≈ 2.2s.
- Given `npm run check`, then lint (complexity ≤ 10), all three type-checks, and the full suite pass with zero remaining references pinning 130/200 as gun-family speeds.

## Spec Change Log

## Review Triage Log

## Design Notes

Speed ruling rationale (for Eric's veto): 300 u/s = 6.7× fastest hull (45); flight 650u→2.17s (max range stays dodgeable: TB displaces ~98u ≫ 15u burst), 330u→1.1s (lead rewarded; BB displaces 38u — class identity), 150u→0.5s. Real-world early-era scale (~20×) was flagged by Eric as likely too fast; 300 sits mid-band of the 250–400 counterplay window. Cannon identity survives via damage 50 / burst 30 / reload 15s. Swept collision (`sim/shell.ts` segment tests) is speed-safe to ~6600 u/s (perception skip bound), so 300 is deep in safe territory.

## Verification

**Commands:**
- `npm run check` -- expected: lint + tsc ×3 + full suite green (was 1474+ tests; count grows with new client tests)
- `npm test -w client -- returnToPort` -- expected: new suite green; hang-case test demonstrably fails if the race is removed
