// The sinking window's motion + deadline math (Story 5.2, Eric rulings
// 2026-08-12, amendments 10/13) — THE one shared module both sim sides call so
// a sinking hull predicts and reconciles with zero ad-hoc drift: the server's
// stepShips and the client's prediction/replay fold the IDENTICAL cap at the
// identical 50 ms dt (the applyGroundingDamp precedent, sim/collision.ts).
// Pure, deterministic, zero I/O: no clock, no RNG — every timestamp arrives as
// a parameter from the server's single World clock (or the client's estimate
// of it), and nothing is mutated but the ship state handed in.
//
// THE DECAY CURVE — a LINEAR speed CAP, full max at sink-entry to exactly 0 at
// the founder deadline: `cap(now) = maxSpeed × (1 − elapsed/window)`, applied
// after stepShip as a symmetric clamp on signed speed. Why this shape:
//
//   - A CAP, never a per-tick multiplier. The compounding multiplier was a
//     shipped grounding defect (cycle 59): its fixed point collapsed to
//     0.083 u/s and took rudder authority with it. A cap derived purely from
//     (since, now) is STATELESS and NON-COMPOUNDING — applying it twice in one
//     tick, or replaying it across a client reconcile, yields the same speed.
//   - LINEAR, not exponential. An exponential decay never actually reaches
//     zero, so "decelerates to a stop over ~5 s" (the AC) would need an
//     epsilon cutoff — a second tunable and a second thing to desync. The
//     linear ramp hits exactly 0 at exactly `sinceMs + sinkingWindowMs`, so
//     "stopped" and "foundered" agree on the same tick by construction (the
//     window is a multiple of the 50 ms sim dt).
//   - LINEAR, not eased. A constant cap-fall rate (maxSpeed/window ≈ 6-9 u/s²
//     across the three classes, at or below their rated brake decel) reads as
//     engine-death drag rather than a crash stop, and keeps the hull making
//     way — and therefore keeps RUDDER AUTHORITY, which stepShip scales by
//     speed/steerageSpeed — for as much of the window as possible. A sinking
//     captain turning to bring guns to bear is the point of the story.
//
// THE RUDDER IS NEVER TOUCHED HERE. Helm inputs flow through stepShip exactly
// as when alive; this module only caps the speed afterward. Steering authority
// falls with speed the way it naturally does, not by any cut-off.
//
// SPEEDBOOST COMPOSES (amendment 10 — Eric admitted the boost while sinking on
// the fitment criterion, KNOWING it fights the ritardando). Callers pass the
// PER-TICK effective forward max — the post-boostedKinematics/slowedKinematics
// ShipConfig.maxSpeed — which is DELIBERATELY UNLIKE applyGroundingDamp's
// rated max: the boost raises the ceiling the ramp scales, so a mid-window
// boost genuinely lifts the cap by bonus × remaining (a doomed surge the hull
// can accelerate into) while still reaching exactly 0 at the deadline. The
// decel is a cap the boost pushes against, never a state that refuses it.

import { CONFIG } from '../constants.js';
import type { ShipState } from './ship.js';

/** [0,1] clamp that fails CLOSED: NaN (a corrupt timestamp) reads as 0, so a
 *  broken clock stops a sinking hull rather than freeing it. */
function clamp01(v: number): number {
  if (!(v > 0)) return 0; // also catches NaN
  return v > 1 ? 1 : v;
}

/**
 * Fraction of the sinking window still AHEAD of `nowMs` for a hull sinking
 * since `sinceMs`: 1 at sink-entry, 0 at (and forever after) the founder
 * deadline. The core primitive the cap scales by — also directly renderable
 * as a client-side countdown fraction.
 */
export function sinkingRemaining(sinceMs: number, nowMs: number): number {
  return clamp01(1 - (nowMs - sinceMs) / CONFIG.ship.sinkingWindowMs);
}

/**
 * The speed a sinking hull may still make at `nowMs`: `maxSpeed` scaled by the
 * remaining window fraction. `maxSpeed` is the PER-TICK effective forward max
 * (post boost/slow folds — see the header: this is where amendment 10's
 * composition lives), so a live speedBoost raises this cap and a prop-fouling
 * slow lowers it, and either way it is exactly 0 at the founder deadline.
 */
export function sinkingSpeedCap(maxSpeed: number, sinceMs: number, nowMs: number): number {
  return maxSpeed * sinkingRemaining(sinceMs, nowMs);
}

/**
 * Clamp a sinking hull's signed speed to the window's cap — call it right
 * after stepShip (and after applyGroundingDamp; both are pure caps, so order
 * between them cannot matter — the minimum wins either way). Never raises
 * speed, preserves sign (a hull making sternway decays to a stop the same
 * way), mutates nothing but `ship.speed`. Callers gate on isSinking() — this
 * function assumes the hull IS sinking and applies the cap unconditionally.
 */
export function applySinkingDecel(
  ship: ShipState,
  maxSpeed: number,
  sinceMs: number,
  nowMs: number,
): void {
  const cap = sinkingSpeedCap(maxSpeed, sinceMs, nowMs);
  if (ship.speed > cap) ship.speed = cap;
  else if (ship.speed < -cap) ship.speed = -cap;
}

/**
 * The absolute server-clock ms a hull sinking since `sinceMs` founders —
 * `since + CONFIG.ship.sinkingWindowMs`. This is the value the server stamps
 * into the self-private `OwnShip.sinkingUntil` wire key, so the client renders
 * a countdown against its server-clock estimate without a second clock.
 */
export function founderDeadline(sinceMs: number): number {
  return sinceMs + CONFIG.ship.sinkingWindowMs;
}

/**
 * Has the window expired — is it time for the `founder` edge (`sinking →
 * sunk`)? Inclusive (`>=`) so the founder tick and the cap reaching exactly 0
 * agree on the SAME tick: the hull stops moving on the tick it founders,
 * never one tick apart on the two sides.
 */
export function hasFoundered(sinceMs: number, nowMs: number): boolean {
  return nowMs >= founderDeadline(sinceMs);
}
