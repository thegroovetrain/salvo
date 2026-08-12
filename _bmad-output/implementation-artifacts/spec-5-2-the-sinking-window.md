---
title: 'Story 5.2: The Sinking Window'
type: 'feature'
created: '2026-08-12'
status: 'done'
baseline_revision: 'b6fe07a2ae8c0220a16c06bed331c88d71672594'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Death is a hard stop — a hull at 0 HP transitions `alive → sunk` in one instant and the
client snaps to a focused ELIMINATED modal inside a single 50 ms frame, with no beat, no agency and
no chance to answer. Story 5.1 landed the `alive | sinking(since) | sunk(at)` union but left
`sinking` deliberately unreachable, and left the Epic 1 AR7 activation gate a passthrough with its
policy TBD.

**Approach:** Make `sinking` reachable for a flat 5 seconds between 0 HP and the bottom. All
bookkeeping (kill credit, XP, bounty, the `sunk` event, the kill feed, AFLOAT, the win check) fires
**unmoved at sink-entry**; the window is purely the dying captain's beat — the hull decelerates to a
stop while every weapon, ability and the foghorn stay live, and the refit is closed. `isAfloat` does
not move: three named seams re-open for `sinking` instead.

## Boundaries & Constraints

**Always:**
- **Amendments 10-17 in `epic-5-context-amendments.md` are BINDING.** On any conflict between this
  spec and that file, the amendment wins. Read it before writing code.
- `isAfloat(lc)` stays byte-identical (`kind === 'alive'`) and **no existing call site of it moves**
  (amendment 15). New behaviour is additive `isSinking()`-aware predicates at named seams only.
- **Exactly one `sunk` event per life**, emitted where it is emitted today (amendment 1/11).
- Sinking decel is a **shared pure function** called identically by `world.ts` and
  `client/src/sim/prediction.ts` — the `applyGroundingDamp` precedent — so the two sides cannot
  diverge.
- Every gameplay-authoritative tunable lives in `shared/src/constants.ts` `CONFIG`.
- Cyclomatic complexity ≤ 10; `npm run check` fully green is the ship gate.
- The master perception invariant keeps **exactly SIX** declared exceptions. The new wire key is
  self-private on `you` and adds none.

**Block If:**
- Any change would require a seventh declared exception to the master perception invariant, or would
  disclose another player's lifecycle state.
- Delivering the flat 5 s window would require changing a shipped combat tunable (damage, reload,
  speed, range) — those are Eric's and are not in scope.

**Never:**
- Never defer kill credit, XP, bounty, the `sunk` event, the kill feed, AFLOAT or the win check to
  founder (amendment 11 rejected this explicitly).
- Never let damage on a sinking hull do anything — no hp, no re-sink, no shortened window
  (amendment 12).
- Never grant a sinking hull the unfogged spectator view (amendment 7).
- Never make a sinking hull win-eligible, or hold `finish()` open for one (amendments 14/17).
- Never add per-class window lengths, a `finishing` match sub-state, or an enemy-facing sinking tell.
- Do not touch Story 5.3's territory: the omniscient reveal, the camera zoom-out, nameplates on all
  hulls, or the results modal's contents.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sink entry | Hull reaches 0 HP in `active` | `alive → sinking(now)`; ONE `sunk` event; killer credited, XP/bounty/AFLOAT/kill-feed all fire now; `respawnAt` armed as today | No error expected |
| Ritardando | Hull in `sinking`, helm at full ahead | Speed decays to 0 over 5000 ms; rudder still bites while making way; hull still pushes out of islands and still lays wake | No error expected |
| Guns live | Sinking hull clicks any of the 7 equipment, or honks | Activation proceeds exactly as when alive (gate returns no `'dead'`); horn sounds | Normal per-row denials (`no-ammo`, `out-of-arc`) unchanged |
| Refit closed | Sinking hull opens the upgrade menu / picks an upgrade / heals | Refused; menu reads inert. No point spent, no boon granted, no hp restored | Denial, not a throw |
| Finish-off attempt | Shell/mine/torpedo/storm hits a hull already `sinking` | No-op: no damage, no re-sink, no window change. No illegal transition | `hitShip` early-returns before any lifecycle edge |
| Founder | 5000 ms elapse in `sinking` | `sinking → sunk`; NO second `sunk` event; client enters spectate | No error expected |
| No wallhack | Sinking hull's frame is built | Frame stays FOGGED and carries `you` — never `spec: true` | `spectates()` keyed on `isSunk` |
| Same-tick wipe | Every remaining captain enters `sinking` on one tick | Match finishes with `winnerId: ''`; results read DRAW, not `WINNER: UNKNOWN` | No error expected |
| Match ends mid-window | Last captain sinks; a hull is still sinking | Match finishes at sink-entry; the results flow supersedes the remaining window (amendment 17) | No error expected |
| Legacy client | Client sends `pv: 33` | Rejected at matchmake by `protocolVersionError` before a seat is reserved | Existing PV gate |

</intent-contract>

## Code Map

- `shared/src/sim/lifecycle.ts` -- the union + transition table. Needs an `isSinking()` predicate
  sibling of `isAfloat`/`isSunk`; the `sink` and `founder` edges already exist and are already legal.
- `shared/src/sim/sinking.ts` -- **NEW.** The pure decel fold + founder-deadline math, called by both
  `world.ts` and `prediction.ts`. Model it on `applyGroundingDamp` (`shared/src/sim/collision.ts:273`).
- `shared/src/constants.ts` -- `CONFIG.ship.sinkingWindowMs = 5000` (amendment 13).
- `shared/src/types.ts` -- one optional self-private `OwnShip` key for the founder deadline, appended
  last (the `slowedUntil`/`dazzledUntil` precedent at `:319-326`).
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 33 → 34.
- `server/src/game/world.ts` -- `sinkShip` (`:1215`) splits: bookkeeping stays, the transition becomes
  `sink`; a new `founderSinking` STEP_ORDER row takes `sinking → sunk` at the deadline. Re-open the
  three seams: motion (`:1841`, `:1887`, `:1920`), weapons/horn (`:2733`, `:2811`, `:2855`, `:2881`),
  and block the refit (`:1423`, `:1560`). `hitShip` (`:2329`) early-returns on `sinking`.
- `server/src/game/signals.ts` -- `contactSignal.visible` (`:424`) and `blipSignal.visible` (`:575`)
  keep a sinking hull perceivable.
- `server/src/game/frames.ts` -- `spectates()` (`:112`) moves to `isSunk`; project the new `you` key.
- `server/src/game/match.ts` -- `finish()` (`:375`) produces `winnerId: ''` on a same-tick wipe
  instead of falling back to `latestSunkHuman()`; rewrite the `computePlacements` proof comment
  (`:477-491`) that textually depends on "`sinkShip` is the sole edge".
- `server/src/__tests__/stepOrder.test.ts` -- the order-identity pin; the new row is a deliberate edit.
- `client/src/sim/prediction.ts` -- fold sinking decel into `tickKin()` (`:399-403`).
- `client/src/main.ts` -- the third state: defer the ELIMINATED modal to founder, hold the camera on
  the own hull, keep hotbar/firing/aim/horn live, refit inert. Beware `alive: you?.alive ?? true`
  (`:548`).
- `client/src/ui/results.ts` -- `winnerBanner()` (`:45`) needs a DRAW reading for `winnerId === ''`.
- `client/src/ui/upgradeMenu.ts` -- inert while sinking (`:264` already has the shape).

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/lifecycle.ts` -- add `isSinking()` beside `isAfloat`/`isSunk`, with the same
      "deliberately not a complement" doc discipline -- one named predicate, so the three re-opened
      seams read identically.
- [x] `shared/src/constants.ts` -- add `CONFIG.ship.sinkingWindowMs = 5000` -- amendment 13's single
      constant, all classes.
- [x] `shared/src/sim/sinking.ts` -- NEW pure module: the decel fold and the founder-deadline
      predicate -- so server and client cannot diverge (the `applyGroundingDamp` precedent). Must
      COMPOSE with a live speedBoost rather than refuse it (amendment 10).
- [x] `shared/src/types.ts` + `shared/src/index.ts` -- add the optional self-private `OwnShip` key;
      bump `PROTOCOL_VERSION` to 34 -- the client needs a third state and `alive` alone cannot carry it.
- [x] `server/src/game/world.ts` -- split `sinkShip` so bookkeeping is unmoved and the edge becomes
      `sink`; add the `founderSinking` STEP_ORDER row; re-open motion, weapons/equipment/horn;
      block the refit/heal; make `hitShip` a no-op on a sinking victim -- amendments 10/11/12/15.
- [x] `server/src/game/signals.ts` -- keep a sinking hull visible as contact and blip -- "still a
      participant, still a target".
- [x] `server/src/game/frames.ts` -- `spectates()` on `isSunk`; project the new key -- discharges
      amendment 7's recorded warning.
- [x] `server/src/game/match.ts` -- same-tick wipe yields `winnerId: ''`; rewrite the placement proof
      comment -- amendment 14.
- [x] `server/src/__tests__/stepOrder.test.ts` -- update the order-identity pin for the new row --
      amendment 6 requires the reorder be a deliberate, reviewed edit.
- [x] `client/src/sim/prediction.ts` -- fold the shared sinking decel into `tickKin()` -- prediction
      desyncs the moment the wire discloses `sinking` otherwise.
- [x] `client/src/main.ts` -- implement the third state (defer modal to founder, hold camera, keep
      controls live, refit inert, show `GOING DOWN WITH THE SHIP!`) -- the modal is focused and calls
      `clearKeys()`, so a live helm is impossible until it defers.
- [x] `client/src/ui/results.ts` + `client/src/ui/upgradeMenu.ts` -- DRAW banner for an empty winner;
      menu inert while sinking.
- [x] Tests -- cover every row of the I/O & Edge-Case Matrix, plus the AC-mandated perception and
      input-validation invariants during sinking, plus a test asserting `isAfloat`'s call sites did
      not move.

**Acceptance Criteria:**
- Given a hull reaching 0 HP, when it enters `sinking`, then exactly one `sunk` event is emitted and
  the killer's credit, XP, bounty, the kill-feed line and the AFLOAT decrement all land on that same
  tick — none of them at founder.
- Given a sinking hull, when 5000 ms elapse, then it transitions to `sunk` and no second `sunk` event
  is emitted for that life.
- Given a sinking hull in the active phase, when its frame is built, then the frame is fogged and
  carries `you` — a sinking captain never receives the unfogged spectator view.
- Given a sinking hull, when any observer's frame is built, then it still appears as a contact and a
  blip under the normal sight/radar rules — and no field anywhere discloses that it is sinking.
- Given a sinking hull, when the player fires any of the seven equipment or sounds the horn, then the
  activation is permitted exactly as when alive; when they open the refit or heal, it is refused.
- Given a sinking hull, when any ordnance or the storm hits it, then nothing happens — no damage, no
  re-sink, no change to the founder deadline, and no illegal-transition throw.
- Given every remaining captain enters `sinking` on the same tick, when the match finishes, then
  `winnerId` is `''` and the results read as a draw rather than `WINNER: UNKNOWN`.
- Given `npm run check`, when it runs, then lint, all three type-checks and the full suite pass.

## Spec Change Log

## Review Triage Log

### 2026-08-12 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 2, medium 0, low 4)
- defer: 4: (high 0, medium 0, low 4)
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` `hasLiveOwnHull` was missed by the widening sweep and still read `you.alive`,
    false for the whole window — so every gun/cannon/star-shell shot played BOTH the close `fireGun`
    cue and the distant `gunReport` world tone at ~0 m, the exact double-sound the function's own
    comment forbids, on every shot of the beat the story exists to create. The world-cue listener
    also silently moved from the hull to the camera. Fixed by composing `!spectating` with the
    sinking predicate; `inOwnBlast` deliberately kept its narrow `alive`-only predicate, since
    amendment 12 makes damage a no-op so silence there would buy nothing. New audio-seam tests,
    proven to fail without the fix.
  - `[high]` `[patch]` The enemy-side death presentation fired at sink-entry, so a hull still
    turning, boosting and firing rendered in the faded `sunkTint` with its crimson plume up to 110 u
    astern of where it actually went down. Split per amendment 18: identity (feed line, cue, AFLOAT)
    stays at sink-entry, location (plume, wreck tint) moves to founder with its position re-resolved
    there. `seen`-gating moved byte-identical; no wire field, no perception exception.
  - `[low]` `[patch]` Founder-time hygiene (the prime revert, the banner) hung off a latch gated on
    `phase === 'active'`, so it was unreachable outside the active phase. Split into a window latch
    and a debrief latch; the results modal stays gated exactly as before. Production-unreachable
    (damage and respawn are mutually exclusive by phase) — fixed as defensive hygiene.
  - `[low]` `[patch]` A stale `you` could read as sinking after the match finished mid-window.
    `spectating` is now a REQUIRED argument to the sinking predicates rather than a defaulted one,
    so a new call site cannot skip it silently; tests extended from null/undefined to stale.
  - `[low]` `[patch]` Two load-bearing comments were factually wrong and this codebase treats
    comments as documentation: a ledgered claim that the killing blow can fire an HP sting (it
    cannot — `ownHpFrac` is null once `alive` is false), and a cross-tick/same-tick distinction in
    `mutualDestructionWinner` the code can no longer make. Both corrected; the `recordSink`
    leave-stamp aliasing hazard written down rather than papered over.
  - `[low]` `[patch]` The client armed a respawn ETA the server never armed, flashing
    `SUNK — RESPAWNING IN 0s` in the active phase for ~½ RTT at founder. Fixed at the source via a
    phase-derived `respawnArmed` dep written the way the server writes it (the three ready-room
    phases named, never `!== 'active'`), so unknown phases fail closed.

## Design Notes

**Why `isAfloat` does not move (amendment 15).** The pre-answer plan was to widen `isAfloat` to
include `sinking` and subtract exceptions. Eric's rulings removed its foundation: the kill lands
immediately, damage is a no-op, and the outcome is decided at sink-entry — so the win check, damage,
roster, XP, repairs, refit and respawn all want the *shipped* answer. Widening would make "sinking
counts as alive" the silent default for every call site added to the sim in future, which is the
wrong default for a hull that is dead in every sense the bookkeeping cares about. Three additive,
enumerable re-openings is both the smaller change and the more correct one.

**The three seams, and nothing else:**

```
motion         stepShips :1841 | resolveCollisions :1887 | sampleWakes :1920
weapons/horn   consumeClick :2733 | consumePress :2811 | hornControl :2855 | gate :2881
perception     contactSignal.visible signals.ts:424 | blipSignal.visible signals.ts:575
```

**Two traps that will silently break this.** `main.ts:548` reads `alive: you?.alive ?? true`, so any
frame shape that omits `you` mid-window reads as alive. And `computePlacements`' correctness argument
(`match.ts:477-491`) is a *comment* whose reasoning depends verbatim on "`sinkShip` is the sole edge
and always emits `sunk`" — splitting the transition invalidates the argument even where behaviour
holds, so the comment must be rewritten rather than left to rot.

**The speedBoost composition.** Amendment 10 admits speedBoost while sinking even though it fights
the ritardando. The decel must therefore be a **cap the boost pushes against**, not a state that
refuses activation — a boost during sinking should feel like a doomed surge, not a no-op.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), all three type-checks pass, full suite
  green with the new tests included.
- `npm test -w shared` -- expected: the new `sinking.ts` fold and lifecycle predicate tests pass.
- `npm test -w server` -- expected: perception/anti-cheat invariants still enforce exactly six
  declared exceptions; the STEP_ORDER identity pin matches the new row; sinking-window behaviour
  tests pass.
- `npm test -w client` -- expected: prediction parity across the sinking boundary; results DRAW
  banner.

## Auto Run Result

Status: done — cycle 77 (0.17.77), PV 33 → 34, epic-5 amendments 10-19.

**Implemented change.** `sinking` is reachable for a flat 5000 ms between 0 HP and the bottom. The
hull decelerates linearly to a stop while every weapon, ability and the foghorn stay live and the
refit is closed; all death bookkeeping fires unmoved at sink-entry. `isAfloat` did not move and none
of its ~30 call sites changed — three named seams re-open for sinking instead (motion,
weapons/equipment/horn, perceivability), which is both the smaller change and the safer default for
every call site added to the sim in future. The AR7 sinking-activation TBD, open since Epic 1, is
closed.

**Files changed** (leaving tests aside):
- `shared/src/sim/sinking.ts` — NEW: the linear speed cap and founder-deadline math, stateless from
  `(since, now)` so double-application and client replay are no-ops.
- `shared/src/sim/lifecycle.ts` — `isSinking()`; `isAfloat`'s body byte-identical and now pinned.
- `shared/src/constants.ts` / `types.ts` / `index.ts` — the 5000 ms constant, the self-private
  `OwnShip.sinkingUntil`, PV 34.
- `server/src/game/world.ts` — the `sinkShip` split, the `founderSinking` STEP_ORDER row, the three
  seams, the refit block, the `hitShip`/`burnShip` no-ops.
- `server/src/game/frames.ts` — `spectates()` on `isSunk` (amendment 7 discharged); the new key.
- `server/src/game/signals.ts` — a sinking hull stays a contact and a blip.
- `server/src/game/match.ts` — the same-tick-wipe draw; the placement proof comment rewritten.
- `client/src/sim/sinkingWindow.ts` — NEW: the third state's pure predicates.
- `client/src/sim/prediction.ts`, `main.ts`, `net/roomBindings.ts`, `render/hud.ts`, `ui/results.ts`,
  `ui/upgradeMenu.ts`, `score.ts` — prediction parity, the third state, the deferred modal, the
  identity/location presentation split, the DRAW banner, the inert refit.

**Review findings.** 6 patched (2 high, 4 low), 4 deferred, 0 rejected, 0 intent gaps, 0 bad-spec —
no loopback. The two high findings were both real and both would have shipped: an own-shot
double-sound audible on every shot of the window, and an enemy-side "already dead" wreck tint on a
hull still fighting. Three of Blind Hunter's four "user-visible regressions" were re-triaged down to
low after verifying that `damageEnabled` and `respawnEnabled` are mutually exclusive by phase, which
makes them unreachable in a real match.

**Verification.** `npm run check` green: 719 shared + 1094 server + 2376 client = **4189 tests**
(baseline 4106), lint 0 errors with the 2 expected pre-existing warnings. Every regression test from
the review pass was proven to fail without its fix. The anti-cheat suite was strengthened rather than
adapted — `verifyFoggedFrame` now pins the exact `Contact` key set, making amendment 16's
no-disclosure claim structural; the master perception invariant still has exactly six exceptions.

**Residual risks.** No live or visual verification was run — the banner timing, the hotbar surviving
the window and the camera hold all want one human look, and the audio seam that carried the worst
finding had no test coverage at all before this cycle. Two orchestrator rulings await Eric's confirm
or veto (amendment 17's truncated final window; amendment 18's groan-vs-plume separation), and one
design question is open for him (wounded smoke stopping at sink-entry as a tell by omission). All
four are in `deferred-work.md`.
