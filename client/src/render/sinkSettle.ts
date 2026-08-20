// THE PROGRESSIVE SETTLE (Story 5.2 fix, Eric ruling 2026-08-13) — the pure
// window-fraction math behind "I can SEE that hull going down", and the client's
// only source for it. Zero Pixi, zero state, zero clock of its own: every
// timestamp arrives as a parameter (the frame's server `t` for an enemy, the
// clock estimate for our own hull), exactly as sim/sinkingWindow.ts takes them.
//
// WHAT THIS FIXES. Epic-5 amendment 18 moved the enemy-side wreck tint and the
// crimson `sink` plume from sink-entry to FOUNDER, and it was right about the
// TINT: a hull rendering "already dead" while it was still turning and shooting
// is the exact misread the sinking window exists to prevent. But it left the
// five seconds between the two beats with NO enemy-side feedback at all — you
// sank a drone, the feed said so, and the hull sailed on looking perfectly
// healthy until it snapped to a wreck. Eric, on playing it: *"there is no
// indication onscreen they are down and sinking at all... it looks as though
// nothing happened and its a delayed death bug."*
//
// The answer is a CONTINUOUS interpolation across the window rather than a step
// at either end: at t=0 the hull looks alive (amendment 18's insight preserved),
// at the founder deadline it looks EXACTLY like the wreck tint that latches
// there (so the handover cannot pop), and every instant between is on the ramp.
//
// AND SINCE AMENDMENT 32 THIS RAMP IS THE WHOLE FOUNDER STORY. The plume moved
// back to the killing blow, where it marks the hit rather than the resting
// place, so nothing detonates at the far end of the window any more — Eric:
// *"Slowly fading to black is indication enough that it has sunk."* This module
// is what that sentence names. The math is unchanged; what changed is that it
// no longer runs toward a second explosion, it runs toward the only thing left.
//
// LINEAR, NOT EASED, and the reasoning is borrowed verbatim rather than
// reinvented: shared/src/sim/sinking.ts already argues it for the speed cap
// ("a constant cap-fall rate reads as engine-death drag rather than a crash
// stop"). Running the LOOK on the same shape as the MOTION means the hull's
// appearance decays at exactly the rate its way falls off — one ritardando, not
// two — and it costs no invented easing constant.
//
// FAIL-CLOSED MEANS FULLY SETTLED HERE, which is the opposite direction from
// `sinkingRemaining`'s own NaN rule and deliberately so. That function fails a
// corrupt clock toward STOPPING a hull; this one inherits the same arithmetic
// (a NaN elapsed reads as zero remaining) and therefore fails toward the WRECK
// look — which is correct, because nothing calls into this module for a hull
// that has not already been declared sunk. A broken clock renders the terminal
// truth, never a live-looking hull that is actually gone.

import { CONFIG, sinkingRemaining } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01 } from '../util/math.js';
import type { SinkingOwn } from '../sim/sinkingWindow.js';

/**
 * How far through its sinking window a hull that entered at `sinceMs` is at
 * `nowMs`: 0 at sink-entry (alive-looking), 1 at (and after) founder (the wreck
 * look, exactly). The complement of the shared `sinkingRemaining`, so the two
 * sides of the beat can never drift — the same function that scales the speed
 * cap scales the look.
 *
 * Out-of-range inputs are clamped by the shared helper, in both directions: a
 * negative elapsed (clock skew putting `nowMs` before sink-entry) reads 0, an
 * expired window reads 1, and a NaN timestamp reads 1 (see the header).
 */
export function settleProgress(sinceMs: number, nowMs: number): number {
  return 1 - sinkingRemaining(sinceMs, nowMs);
}

/**
 * The same fraction, taken from the FOUNDER DEADLINE instead of the entry time
 * — the shape the enemy path actually holds. `net/roomBindings.ts` stamps a
 * witnessed sinking's deadline (`arrival t + CONFIG.ship.sinkingWindowMs`, the
 * same arithmetic the server's `founderDeadline` does) and never learns the
 * enemy's self-private `sinkingUntil`, so the deadline is the datum on hand.
 */
export function settleToDeadline(deadlineMs: number, nowMs: number): number {
  return settleProgress(deadlineMs - CONFIG.ship.sinkingWindowMs, nowMs);
}

/**
 * THE OWN HULL'S settle — the same ramp, CAPPED at
 * `CLIENT_CONFIG.ship.ownSettleMax`, and the cap is the whole ruling.
 *
 * Before this, the own hull SNAPPED to the full wreck look the instant `alive`
 * went false (`main.ts` renderOwn, `setDowned(!status.alive)`) — which was both
 * incoherent with the enemy treatment being built here and, worse, a live
 * legibility defect: `sunkTint` has zero green and blue and a Pixi tint
 * multiplies, so a cyan/lime/spring captain spent their last five fighting
 * seconds steering a black silhouette at 0.4 alpha across a black ocean. Now
 * the own hull leaves sink-entry looking exactly as it did alive and settles
 * PART of the way, so the tell is there without ever costing the player the
 * ship they are still aiming with.
 *
 * It holds at the cap past founder rather than completing, on purpose: there is
 * a ~½ RTT gap between our founder tick and the `spec` frame that hands the
 * screen to the spectate path, and completing the ramp here would pop the hull
 * to full wreck for a few frames on the way out. The value is continuous
 * everywhere.
 *
 * WHAT THIS FUNCTION GOVERNS, EXACTLY (corrected, epic-7 amendment 29): the
 * live sinking window PLUS that ½-RTT gap — and NOTHING after it.
 * `spectateSettle` below finishes the job. The doc block used to claim this one
 * "only tints a view that `renderOwn` does not draw at all while spectating",
 * which was true when amendment 21 was written and became FALSE at Story 5.3
 * (epic-5 amendment 31, correction #1), where the own wreck was ruled to STAY
 * on screen through the whole reveal. Nothing re-read the claim, so the sprite
 * simply froze at the cap for the entire spectate/results period — Eric, on
 * seeing it: *"my ship should be sunk, not visible in full-color motionless in
 * the middle of the map."* The stale premise is what hid the defect; it is
 * corrected here rather than deleted so the next reader sees the seam.
 *
 * No `spectating` parameter, unlike the sim/sinkingWindow.ts predicates — and
 * the omission is checked, not lazy. Those predicates gate CAPABILITY (a stale
 * `you` that still carries a future deadline would keep a torn-down hull's
 * controls live), while this one only picks a tint, and its answer past founder
 * is the constant cap either way. A spectator's stale `you` reads either
 * `alive: true` (the winner → 0) or an expired deadline (→ the cap), which is
 * the same answer spectating would have forced.
 */
export function ownSettle(you: SinkingOwn | null | undefined, nowMs: number): number {
  if (!you || you.alive) return 0;
  const max = CLIENT_CONFIG.ship.ownSettleMax;
  // `alive: false` with NO window is a hull already past founder (or a server
  // that never opened one) — terminal, so it takes the capped end state whole.
  if (you.sinkingUntil === undefined) return max;
  return settleToDeadline(you.sinkingUntil, nowMs) * max;
}

/**
 * THE CONTINUATION — the own hull's settle from the cap to the wreck, run by
 * the SPECTATE path once `renderOwn` has stopped drawing (Eric ruling
 * 2026-08-20, epic-7 amendment 29).
 *
 * Two correct rulings collided and left a gap between them. Epic-5 amendment 21
 * capped the own ramp and made it HOLD at the cap past founder, on a written
 * justification that assumed the own view was about to be hidden. Epic-5
 * amendment 31 (correction #1) then ruled the own wreck STAYS on screen through
 * the omniscient reveal — and `renderSpectate` re-projects the wreck's
 * nameplate every frame but never touched `setSink`. So the hull sat at exactly
 * `sink = 0.3` — a nearly full-hue, nearly full-alpha ship — parked in the
 * middle of the ocean for the whole results period.
 *
 * THE TERMINAL LOOK IS THE ONE THE GAME ALREADY HAS. This walks to exactly
 * `setSink(1)`, byte-for-byte the wreck look every enemy hull gets
 * (`render/ships.ts` `hullLook`: *"There is one wreck look and one function
 * that produces it"*). No second wreck treatment is minted here. Identity in
 * death is carried by the nameplate, which Story 5.3 ratified as riding the
 * wreck. (The ratified mockup's `PROPOSAL` legend — *"own hull held at 45%
 * opacity in personal Cyan"* — was never ratified or built; it is ledgered in
 * amendment 29 as Eric's to take, not silently discarded.)
 *
 * CONTINUOUS AT THE HANDOVER IN BOTH DIRECTIONS. The ramp STARTS at the cap, so
 * at `nowMs === you.sinkingUntil` this returns exactly `ownSettle`'s terminal
 * value and the founder→spectate seam cannot pop, however many frames of ½ RTT
 * sit between the two. And BEFORE founder it hands straight back to `ownSettle`
 * rather than clamping — because spectate genuinely can begin mid-window (see
 * the branch below), and flooring that case at the cap would pop the hull
 * UPWARD and then freeze it. The ONE row where the two functions deliberately
 * disagree is `alive: false` with NO window: `ownSettle` reads it as the cap,
 * this reads it as the whole wreck, because by then there is nothing left to
 * protect and fail-closed wins.
 *
 * REVIEW-GATE NOTE, kept because it is the kind of thing that gets re-broken:
 * the mid-window case is NOT clock-skew paranoia. It is a reachable ending —
 * see the `elapsed < 0` branch for the two server seams that produce it.
 *
 * THE DURATION IS DERIVED, NOT A FEEL KNOB. An enemy hull travels 0 → 1 across
 * `CONFIG.ship.sinkingWindowMs`; ours travels 0 → cap across the same window
 * and stops. Covering the remaining `(1 - cap)` at the ENEMY's rate therefore
 * takes `sinkingWindowMs * (1 - cap)` = 3500 ms — the own hull finishes going
 * down at exactly the canonical rate, and the number moves automatically if
 * either shipped constant does. `ownSettleMax` itself is untouched (epic-5
 * amendment 21 binds it *"may shrink, never grow"*).
 *
 * FAIL-CLOSED MEANS FULLY SETTLED (module header): a missing window, a NaN clock
 * or a degenerate duration renders the TERMINAL wreck, never a live-looking hull
 * that is actually gone. `clamp01` PASSES NaN THROUGH UNCHANGED, so every way of
 * minting one has to be headed off before it reaches the clamp — the finite
 * check on `elapsed`, and the `dur > 0` check on the divisor (written `!(dur >
 * 0)` so a NaN duration fails closed too). A NaN reaching `setSink` would be
 * doubly bad: `NaN >= 1` is false, so the caller's latch would never arm and the
 * bad value would be re-applied every frame for the rest of the match.
 */
export function spectateSettle(you: SinkingOwn | null | undefined, nowMs: number): number {
  // THE `=== false` SHAPE, NOT `!alive` — main.ts's standing `alive ?? true`
  // trap. A MISSING `alive` must read as AFLOAT (no wreck), never as sunk,
  // exactly as `ownWreckPose` and `enterSpectateVisuals` read it. Getting this
  // backwards would hand the wreck look to a hull every other caller believes
  // is still swimming. A winner spectating at `phase: finished` takes this
  // return too, and so does a client that never received a `you`.
  if (!you || you.alive !== false) return 0;
  const cap = CLIENT_CONFIG.ship.ownSettleMax;
  // `alive: false` with NO window is a hull already past founder (or a server
  // that never opened one) — terminal, so it takes the wreck whole.
  if (you.sinkingUntil === undefined) return 1;
  const elapsed = nowMs - you.sinkingUntil;
  if (!Number.isFinite(elapsed)) return 1; // corrupt clock → the wreck, never a live hull
  // SPECTATE CAN BEGIN BEFORE FOUNDER, so this is a real branch and not skew
  // paranoia: `frames.ts` `spectates()` returns true for EVERYONE the instant
  // `phase === 'finished'`, and `match.ts`'s `holdsForSinkingCaptain` safety-net
  // deadline lands a finish regardless of lifecycle. A revenge kill in a 1v1
  // puts the winner into spectate mid-window. Handing back to `ownSettle` there
  // is what makes the handover continuous IN BOTH DIRECTIONS — clamping to 0
  // would floor this at the cap and pop the hull UPWARD, then freeze it, which
  // is the very defect this function exists to delete.
  if (elapsed < 0) return ownSettle(you, nowMs);
  const dur = CONFIG.ship.sinkingWindowMs * (1 - cap);
  if (!(dur > 0)) return 1; // a degenerate window is terminal, not a 0/0 NaN
  const f = clamp01(elapsed / dur);
  // `f >= 1 → 1` rather than letting the lerp land it: `0.3 + 0.7 * 1` is
  // 0.9999999999999999 in IEEE doubles. `hullLook` has no `sink === 1` branch
  // to miss (it special-cases `s <= 0` only, and `mixColor` rounds each channel,
  // so the TINT would be byte-identical either way) — what the exact 1 buys is a
  // clean terminal value for the `s >= 1` latch in `main.ts` and for
  // `toEqual(hullLook(0, 1, 1))` comparisons.
  return f >= 1 ? 1 : cap + (1 - cap) * f;
}
