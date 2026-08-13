// THE PROGRESSIVE SETTLE (Story 5.2 fix, Eric ruling 2026-08-13) — the pure
// window-fraction math behind "I can SEE that hull going down", and the client's
// only source for it. Zero Pixi, zero state, zero clock of its own: every
// timestamp arrives as a parameter (the frame's server `t` for an enemy, the
// clock estimate for our own hull), exactly as sim/sinkingWindow.ts takes them.
//
// WHAT THIS FIXES. Epic-5 amendment 18 moved the enemy-side wreck tint and the
// crimson `sink` plume from sink-entry to FOUNDER, and it was right to: a hull
// rendering "already dead" while it was still turning and shooting is the exact
// misread the sinking window exists to prevent. But it left the five seconds
// between the two beats with NO enemy-side feedback at all — you sank a drone,
// the feed said so, and the hull sailed on looking perfectly healthy until it
// snapped to a wreck. Eric, on playing it: *"there is no indication onscreen
// they are down and sinking at all... it looks as though nothing happened and
// its a delayed death bug."*
//
// The answer is a CONTINUOUS interpolation across the window rather than a step
// at either end: at t=0 the hull looks alive (amendment 18 preserved), at the
// founder deadline it looks EXACTLY like the wreck the deferred plume lands on
// (so the handover cannot pop), and every instant between is on the ramp.
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
 * a ~½ RTT gap between our founder tick and the `spec` frame that hides the own
 * view, and completing the ramp would pop the hull to full wreck for a few
 * frames on the way out. The value is continuous everywhere.
 *
 * No `spectating` parameter, unlike the sim/sinkingWindow.ts predicates — and
 * the omission is checked, not lazy. Those predicates gate CAPABILITY (a stale
 * `you` that still carries a future deadline would keep a torn-down hull's
 * controls live), while this one only tints a view that `renderOwn` does not
 * draw at all while spectating. A spectator's stale `you` reads either
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
