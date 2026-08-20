---
title: 'The own wreck finishes going down (spectate completes the settle)'
type: 'bugfix'
created: '2026-08-20'
status: 'done'
baseline_revision: '5de9e0c'
final_revision: '1cd5532'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** While spectating after your own ship sinks, your hull sits on the water at
~full personal hue, motionless, for the entire spectate/results period. Eric: *"my ship
should be sunk, not visible in full-color motionless in the middle of the map."* Two
correct rulings collided. Story 5.2 (epic-5 amendment 21) capped the OWN hull's sink
settle at `CLIENT_CONFIG.ship.ownSettleMax` (0.3) and made it **hold at the cap past
founder rather than completing**, justified in `sinkSettle.ts` by a premise that is now
false: *"this one only tints a view that `renderOwn` does not draw at all while
spectating."* Story 5.3 (epic-5 amendment 31, correction #1) then made the own wreck
**stay on screen** through spectate. `renderSpectate` re-projects the wreck's nameplate
every frame but never drives `g.ownView.setSink(...)` — that call lives only in
`renderOwn` (`main.ts:2950`), which stops running at founder. The sprite therefore
freezes at exactly `sink = 0.3`: tint ≈ `0xDCB3B3`, alpha 0.82, scale 0.955.

**Approach:** Leave `ownSettle`/`ownSettleMax` byte-identical — the cap and its
hold-past-founder pin still correctly govern the live sinking window and the ~½ RTT gap
before the `spec` frame. Add a spectate-side CONTINUATION that walks the own hull from
the cap to exactly `setSink(1)`, the game's one ratified wreck look, and place the wreck
hull once at the authoritative `ownWreckPose` so hull and nameplate share one datum.

## Boundaries & Constraints

**Always:**
- The terminal look is the EXISTING `setSink(1)` — one wreck look, one function
  (`render/ships.ts:189`). Invent no second wreck treatment.
- The value must be CONTINUOUS across the founder→spectate handover (no pop): the
  continuation starts AT the cap and rises from there.
- Duration is DERIVED, never a new feel literal:
  `CONFIG.ship.sinkingWindowMs * (1 - ownSettleMax)` = 3500 ms, i.e. the own hull
  finishes going down at exactly the canonical rate every enemy hull already runs.
- Datum is the retained founder deadline `you.sinkingUntil`; `net.you` is never cleared
  on death. Fail-closed = FULLY SETTLED (module doctrine, `sinkSettle.ts` header): a
  missing window or NaN clock renders the terminal wreck, never a live-looking hull.
- RENDER BUDGET (epic-7 amendment 4): the omniscient reveal already BREACHES its render
  leg at 11.8 ms vs 10 ms. The ramp must LATCH — stop calling `setSink` once complete —
  and the hull is positioned ONCE at spectate entry, not per frame.
- The new settle math is a PURE function in `render/sinkSettle.ts` (zero Pixi, zero
  state, timestamps as parameters), matching that module's stated contract.

**Block If:**
- The fix would require RAISING `CLIENT_CONFIG.ship.ownSettleMax` — epic-5 amendment 21
  binds it *"may shrink, never grow"*. HALT rather than raise it.
- Making the own wreck read as sunk turns out to require a NEW wire field, a server
  change, or a `PROTOCOL_VERSION` bump. This is client presentation only.

**Never:**
- Do not touch `ownSettle`, `ownSettleMax`, or the enemy settle path
  (`roomBindings.ts` `presentWreck`/`driveSettle`) — the enemy contract stays
  byte-identical.
- Do not change the sinking WINDOW's look. Mockup F1's DECIDED row (*"hull stays full
  personal hue until gone"*) governs the five seconds you are still fighting; this
  change begins at founder.
- Do not add an on-water death register, a new beat, a key surface, or anything the
  player must dismiss — epic-5 amendment 24 ruled the reveal is *"the backdrop"*.
- Do not restack layers (epic-5 amendment 22: a hull outranks its own echo).
- Do not route the wreck through the null-own-pose path (`main.ts` hides hull + plate
  entirely there — epic-6 amendment 19 trap).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Alive | `you.alive === true` | 0 — no settle, hull untouched | No error expected |
| Inside sinking window | `alive:false`, `now < sinkingUntil` | Unchanged capped ramp via `ownSettle` (0 → cap) | No error expected |
| Founder instant | `now === sinkingUntil` | Exactly the cap — continuous with `ownSettle` | No error expected |
| Mid-continuation | `now = sinkingUntil + 1750` | cap + (1-cap)×0.5 = 0.65 | No error expected |
| Complete | `now >= sinkingUntil + 3500` | Exactly 1 — the wreck look, byte-for-byte | Latches; stops driving |
| Sunk, no window | `alive:false`, `sinkingUntil === undefined` | 1 (terminal, fail-closed) | No error expected |
| Corrupt clock | NaN timestamp | 1 (fail-closed to the wreck) | Never a live-looking hull |
| Winner spectating | `you.alive === true` at `phase:finished` | No own wreck drawn at all | Guard is `=== false` |
| No `you` ever received | `net.you == null` | No own wreck drawn | Null-safe, no throw |

</intent-contract>

## Code Map

- `client/src/render/sinkSettle.ts` -- the pure settle math; `ownSettle` (capped) lives here and its spectate doc claim is now false. New pure `spectateSettle` belongs beside it.
- `client/src/main.ts:3806` -- `enterSpectateVisuals`, the one-shot that keeps the sprite visible when `wrecked`; the right place to position the wreck hull once.
- `client/src/main.ts:3898` -- `renderSpectate`, which must drive the continuation each frame until it latches.
- `client/src/main.ts:1271` -- `ownWreckPose`, the authoritative wreck datum (last server pose).
- `client/src/main.ts:2950` -- `renderOwn`'s capped `setSink` call; stays byte-identical.
- `client/src/render/ships.ts:320` -- `ShipView.setSink`; `setSink(1)` IS `setDowned(true)`.
- `client/src/config.ts:877` -- `ownSettleMax: 0.3` and its "may shrink, never grow" rationale (scoped to the alive window).
- `client/src/__tests__/sinkSettle.test.ts:271` -- pins the hold-at-cap; stays GREEN, comment restated.
- `client/src/__tests__/nameplates.test.ts:362` -- carries a stale comment about `updateOwnPlate` not running while spectating.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/sinkSettle.ts` -- add pure `spectateSettle(you, nowMs)` returning the cap→1 continuation off `you.sinkingUntil`, with the derived 3500 ms duration and fail-closed-to-1 rules -- one module owns all settle math.
- [x] `client/src/render/sinkSettle.ts` -- correct `ownSettle`'s doc block: the claim that the view is not drawn while spectating is FALSE since Story 5.3; state that the cap now governs the window plus the ½-RTT gap, and that `spectateSettle` finishes the job -- the stale premise is what hid this defect.
- [x] `client/src/main.ts` -- in `enterSpectateVisuals`'s `wrecked` branch, position `g.ownView` once at `ownWreckPose` so the hull and its nameplate share one datum -- removes the predicted-vs-server pose divergence.
- [x] `client/src/main.ts` -- in `renderSpectate`, drive `g.ownView.setSink(spectateSettle(...))` while the wreck exists and the ramp is unfinished, latching once it reaches 1 -- respects the already-breaching reveal render budget.
- [x] `client/src/__tests__/sinkSettle.test.ts` -- test the I/O matrix rows for `spectateSettle`: continuity at the cap, the mid-ramp value, exact 1 at completion, terminal/no-window, NaN fail-closed, null-safety, and that a cyan hull at 1 is the same wreck look every enemy gets.
- [x] `client/src/__tests__/sinkSettle.test.ts` -- restate the `holds AT the cap past founder` comment so it names the ½-RTT gap only, not "before the spec frame hides it" -- the pin survives, its rationale narrows.
- [x] `client/src/__tests__/nameplates.test.ts` -- correct the stale `updateOwnPlate NOT running while spectating` comment -- it does run, for the wreck.
- [x] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- add amendment 29 recording the collision, the ruling (complete to the one wreck look), and the LEDGERED unratified alternative (the mockup's 45%-opacity personal-hue proposal) as Eric's call.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- annotate the open 5-2/5-3 "shipped with no visual verification" entries: this is the defect they predicted, now found by eye and fixed.
- [x] `VERSION`, `package.json`, `package-lock.json` -- bump to 0.17.115 (lockfile was stale at 0.17.108; `npm install` synced it to match).
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` + `_bmad-output/gds-workflow-status.yaml` -- stamp cycle 115, and BACK-FILL the missing cycles 110-114 stamps -- the standing both-trackers-same-PR rule.

**Acceptance Criteria:**
- Given my hull has foundered and I am spectating, when 3500 ms have passed since the founder deadline, then my wreck renders at exactly the same look `setSink(1)` gives every enemy wreck (crimson tint, `sunkAlpha`, `sunkScale`).
- Given the founder→spectate handover, when the first spectate frame draws, then the hull's settle value differs from the capped value by at most the elapsed-time term — no visible jump.
- Given the ramp has completed, when further spectate frames draw, then `setSink` is not called again (latched) — no added per-frame cost on the reveal.
- Given I WON the match and am spectating at `phase: finished`, when the results period runs, then no own wreck is drawn and no second copy of my hull appears.
- Given my wreck is on screen, when the reveal zooms out, then my nameplate stays attached to the wreck's hull rather than drifting.
- Given `npm run check`, when it runs, then lint, all three type-checks and the full suite pass.

## Spec Change Log

## Review Triage Log

### 2026-08-20 — Review pass (Blind Hunter + Edge Case Hunter, deduplicated)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 2, low 6)
- defer: 4: (high 0, medium 1, low 3)
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `[medium]` `[patch]` SPECTATE CAN BEGIN BEFORE FOUNDER, and the code clamped it to the cap — a pop UPWARD then a multi-second freeze, this cycle's own defect in miniature. Verified reachable: `frames.ts:139` `spectates()` is true for EVERYONE at `phase === 'finished'`, and `match.ts` `holdsForSinkingCaptain()` is bypassed past `finishDeadline`, so a revenge kill in a 1v1 puts the winner into spectate mid-window. Fixed by handing back to `ownSettle` for `elapsed < 0`. This restored the spec's OWN I/O matrix row ("Inside sinking window → unchanged capped ramp via `ownSettle`"), so the spec was right and the code deviated — hence patch, not bad_spec. Pinned by a new test, PROVEN to discriminate (reverting the branch fails it).
  - `[medium]` `[patch]` The wrecked branch positioned the hull but never set `gfx.visible = true`. `renderOwn` is the only place that sets it, and `renderAlive`'s null-own-pose branch (`main.ts:3692`) sets it false — reachable on the last frames before the handover (reconnect force-snap drains `ownBuffer`; the `P` toggle does the same). Spectator frames carry no `you`, so the pose never returns and the one-shot never re-runs: the wreck would be absent for the entire reveal while `updateOwnPlate` kept re-showing its callsign over open water. One line added.
  - `[low]` `[patch]` The alive-guard was the `!alive` shape while its comment claimed the `=== false` shape — inverted, in the exact spot the codebase keeps its standing `alive ?? true` warning. Now `you.alive !== false`, comment rewritten.
  - `[low]` `[patch]` The NaN guard did not cover the operation that mints NaN: `0/0` from a degenerate duration would return NaN, and because `NaN >= 1` is false the latch would never arm and the bad value would re-apply every frame forever. Added `!(dur > 0) → 1`.
  - `[low]` `[patch]` The exactness comment cited a `hullLook` special case at `sink === 1` that does not exist (it special-cases `s <= 0` only; `mixColor` rounds, so the tint is byte-identical either way). Corrected to the true reason: a clean terminal value for the latch and for `toEqual` comparisons.
  - `[low]` `[patch]` `driveOwnWreckSettle` re-sampled `g.clock.serverNow()` although the frame's `now` (which IS `serverNow()`, sampled once at `main.ts:4111`) was in scope — against the render loop's own stated same-instant doctrine. Now passed in.
  - `[low]` `[patch]` The latch doc claimed the flag is "reset" and that "a second life settles from scratch". Neither `sinkSettled` nor its neighbour `visualsSet` is ever reset, and there is no second life after a sinking. Reworded to state the real mechanism (rebuilt on requeue, safe because `spectating` is itself a one-way latch) and to flag what breaks if that changes.
  - `[low]` `[patch]` The continuity claim was stated absolutely in three places while being true at exactly one instant. Reworded to name both directions and the one row where the two functions deliberately disagree (`alive:false` with no window: cap vs 1).

## Design Notes

**Why complete to `setSink(1)` rather than the mockup's 45% proposal.** The ratified
mockup (`death-reveal-results-1.html`) tags its reveal treatment — *"own hull held at 45%
opacity in personal Cyan (identity persists in death)"* — as a `PROPOSAL`; only *"your
wreck is marked"* is DECIDED, and the *"full personal hue"* DECIDED row is scoped to F1,
the sinking window. Implementing the proposal would mint a SECOND wreck look, which
`ships.ts:189` forbids in as many words (*"There is one wreck look and one function that
produces it"*). Eric's own amendment-32 sentence — *"Slowly fading to black is indication
enough that it has sunk"* — names this ramp. Identity in death is carried by the
nameplate, which Story 5.3 ratified as staying on the wreck. **The 45% alternative is
ledgered in amendment 29 as Eric's to take; it is not silently discarded.**

**Why the duration is 3500 ms and not a feel knob.** The enemy ramp travels 0→1 across
`CONFIG.ship.sinkingWindowMs`. The own ramp travels 0→cap across the same window, then
stops. Continuing at the ENEMY's rate covers the remaining `(1 - cap)` in
`sinkingWindowMs * (1 - cap)` = 3500 ms. So the number falls out of two shipped
constants; if either moves, it moves with them.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity <= 10), three type-checks clean, full suite green with the new `spectateSettle` cases.
- `npx vitest run client/src/__tests__/sinkSettle.test.ts` -- expected: existing `ownSettle` pins still green (unmodified behaviour) plus the new continuation cases.

**Manual checks (if no CLI):**
- Sink in a solo-vs-AI match; across the first ~3.5 s of spectate the hull darkens continuously to the same wreck look enemy hulls wear, with its callsign plate riding it; nothing pops at the handover.
