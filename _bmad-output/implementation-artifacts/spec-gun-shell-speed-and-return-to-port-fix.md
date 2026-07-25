---
title: 'Gun-family shell speed standardization + Return to Port fix'
type: 'bugfix'
created: '2026-07-25'
status: 'done'
baseline_revision: '7df936ae4bf2031c91d242252ea3ecdaa8bed347'
final_revision: 'c2e93bd38ac9aec1297482cdf239108e14a3e1e9'
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

### 2026-07-25 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 2, low 5)
- defer: 1: (high 0, medium 0, low 1)
- reject: 4
- addressed_findings:
  - `[medium]` `[patch]` Refit modal never hidden at match end (stayed painted/interactive over results, digit picks still sent spends) — onResults now hides it before showResults (main.ts).
  - `[medium]` `[patch]` ESC flips meaning the instant results land (a press aimed at the refit modal could instantly tear down to reload) — 400ms arming grace `CLIENT_CONFIG.results.keyGraceMs` gates results-phase ESC/Enter; button click ungated.
  - `[low]` `[patch]` `returnToPort.ts` latch set before unguarded `onStart()` — a sync throw would strand permanently; wrapped in try/catch + regression test.
  - `[low]` `[patch]` Rewritten collision broadside test asserted a speed floor (spurious failure if speed retuned < ~260 u/s) — crossing half-length now `Math.max(maxTravel/2, beam/2 + radius + 1)`, floor assertion deleted.
  - `[low]` `[patch]` Focused results BUTTON suppresses the keyboard chokepoint (`textEntryFocused` matches BUTTON; mousedown-drag-off left ESC dead) — mousedown preventDefault on the button (the 2-1 ledger's recommended convention).
  - `[low]` `[patch]` Results test pinned "first button in overlay" — button got stable id `results-return`, test selects by id.
  - `[low]` `[patch]` Dead `settleAd` scaffolding in returnToPort.test.ts — deleted.

Rejected (4): outer deadline around the ad break (safeAdapter invariant holds at its single construction site); dual-latch future-caller hazard (speculative — all callers route through `returnToPort(g)`); 1s leave race → transient ghost seat (self-mitigated: room disposes seconds later); version-bump classification (orchestrator ruling 0.17.1 stands, surfaced to Eric in the run report). Deferred (1): RETURN TO PORT activation feedback → deferred-work.md. Cross-model picture: Codex — no findings, build-on-it; both Fable hunters — zero CONFIRMED player-facing defects; all patches were hardening-tier.

## Design Notes

Speed ruling rationale (for Eric's veto): 300 u/s = 6.7× fastest hull (45); flight 650u→2.17s (max range stays dodgeable: TB displaces ~98u ≫ 15u burst), 330u→1.1s (lead rewarded; BB displaces 38u — class identity), 150u→0.5s. Real-world early-era scale (~20×) was flagged by Eric as likely too fast; 300 sits mid-band of the 250–400 counterplay window. Cannon identity survives via damage 50 / burst 30 / reload 15s. Swept collision (`sim/shell.ts` segment tests) is speed-safe to ~6600 u/s (perception skip bound), so 300 is deep in safe territory.

## Verification

**Commands:**
- `npm run check` -- expected: lint + tsc ×3 + full suite green (was 1474+ tests; count grows with new client tests)
- `npm test -w client -- returnToPort` -- expected: new suite green; hang-case test demonstrably fails if the race is removed

## Auto Run Result

**Summary:** Standardized the gun-family muzzle velocity (standard gun 130 / battleship cannon 200 / star shells 130 → one shared 300 u/s; max-range flight 5.0s → 2.2s) and fixed the RETURN TO PORT dead-end (room.leave() raced vs 1000ms so the chain always reaches location.reload(); Enter/ESC on results per UX-DR27 with a 400ms arming grace; refit modal hidden at match end). v0.17.0 → 0.17.1.

**Files changed:**
- `shared/src/constants.ts` — three shellSpeed literals → 300 + standardized comments
- `shared/src/__tests__/barrel.test.ts` — literal pins re-pinned to 300
- `shared/src/__tests__/collision.test.ts` — worst-case sweep now covers the whole gun family; obsolete per-tick-travel<beam ceiling replaced with swept-detection proofs (grazing chord, thinnest-hull broadside), speed-floor-safe
- `server/src/__tests__/{cannon,starShells,combat}.test.ts` — stale speed prose refreshed (comments only)
- `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap` — regenerated (speed-derived velocities / flight-tick counts only, audited)
- `client/src/app/returnToPort.ts` — NEW: latched, always-settling return chain (ad break → bounded leave → reload), onStart throw-safe
- `client/src/main.ts` — chain wired via makeGameReturnToPort; results-phase Enter/ESC handlers with arming grace; modal hidden + resultsShownAt stamped on results arrival
- `client/src/input/keyboard.ts` — Enter/NumpadEnter bound into the chokepoint (onConfirm hook)
- `client/src/ui/results.ts` — stable `results-return` button id; mousedown preventDefault (keeps chokepoint alive)
- `client/src/config.ts` — CLIENT_CONFIG.results.keyGraceMs = 400
- `client/src/__tests__/{returnToPort,results,keyboard}.test.ts` — 12 new returnToPort chain tests (incl. the never-settles regression pin), DOM wiring pins, Enter chokepoint pins
- `VERSION` + `package.json` — 0.17.1; `_bmad-output/gds-workflow-status.yaml` — cycle note

**Review breakdown:** 2 Fable hunters + Codex cross-model (Codex: no findings, build-on-it). 7 patches applied (2 medium, 5 low — all hardening-tier, zero confirmed player-facing defects), 1 deferred (RETURN TO PORT activation feedback — design surface, Eric's call), 4 rejected.

**Verification:** `npm run check` EXIT=0 — lint 0 errors (2 pre-existing max-lines warnings), tsc ×3 clean, tests 261 + 647 + 581 = 1489 (was 1474). Regression pin proven: reload not called before the 1000ms race, called after.

**Residual risks / for Eric's veto:**
- The 300 u/s value is a Fable ruling under Eric's delegation (rationale in Design Notes; the constant is a one-line retune).
- Version classification: 0.17.1 treats this as bugfix+tuning; if Eric counts a balance retune as a feature, it should have been 0.18.0.
- Feel of 400ms results-key grace and the 1000ms leave race are CLIENT_CONFIG/exported constants, both trivially tunable.

### Post-run Eric rulings (2026-07-25, pre-merge)

- **Speed retuned 300 → 500 u/s** (max-range 650u flight ≈ 1.3s). Constants, barrel.test pins, prose refreshed; intentQueue's no-phantom-refire pin given flight-time headroom (aimDist 100 → 400 — at 500 u/s the shell legitimately burst inside the old observation window); golden frames regenerated.
- **No version bump** — VERSION/package.json stay 0.17.0 (reverting this spec's 0.17.1 task).
- **Reconciled with main**: this was the third of three concurrent agents; radar-sweep-rpm (PR #64) and story 2-2 The Hotbar merged first. origin/main merged into the branch (conflicts: config.ts results+hotbar blocks kept side-by-side; deferred-work + gds-workflow-status entries combined).
