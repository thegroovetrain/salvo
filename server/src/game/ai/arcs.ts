// THE ARC OPENING (Story 10.12, Eric 2026-11-11, R2: "always angle off" —
// every hull, chasing or running, turns just far enough off the target for
// EVERY turret to bear whenever the target is in gun range; one rule for all
// four hulls).
//
// One pure function: given the bearing the posture wants, return the bearing
// NEAREST to it on which a hull holding steady has every main-battery turret
// bearing on the target point. The arc question itself is never re-derived
// here — every candidate heading is asked of the shared `turretBears`, from
// each turret's own station, so station parallax close in is the shared
// law's, not a second copy of it.
//
// THE SEARCH. Write a candidate heading as the target's bearing rotated by an
// angle θ ∈ [0, π] toward one SIDE of the target line. Each turret's "bears"
// set is one interval of θ, so the headings on which ALL bear are one
// interval too, and it always holds the beam-on heading (θ = π/2) at any
// range a helm fights at. The wanted bearing's own θ is its angle off the
// target line; when it does not bear, the answer is the edge of the interval
// nearer to it — found by bisecting between the wanted θ (does not bear) and
// π/2 (bears), a fixed number of halvings.
//
// THE MARGIN. The helm is a proportional controller: it closes on the bearing
// it is given ever more slowly and, against a steady target, never quite
// arrives. Handed the exact edge it would sit a hair short of it — one turret
// still masked — for many seconds. So the answer is `ARC_OPEN_MARGIN_RAD`
// INSIDE the edge (toward the beam, never past it): the hull crosses the edge
// itself while it is still turning briskly, and the end turret is left a
// little train in hand instead of resting on its stop.
//
// THE SIDE is the side of the target line the BOW lies on right now (port of
// the line when the bow is exactly on it): a hull already angled one way is
// never asked to swing through the target line to the other, so the answer
// cannot flap between two mirror headings while the wanted bearing sits near
// the line. A wanted bearing on the far side is read by its mirror image —
// the same angle off the line, on the bow's side.
//
// Pure: no state, no rng, no clock, no `world.js`.

import { CONFIG, angleDiff, bearing, turretBears, turretMounts, wrapAngle, type HullId, type Vec2 } from '@salvo/shared';

/** Halvings of the bisection: the edge it finds lies within
 *  `ARC_OPEN_TOLERANCE_RAD` of the true edge of the all-bearing interval. */
const BISECTIONS = 12;

/** rad — the search's resolution: the widest first bracket (wanted dead on or
 *  dead off the target, against the beam) halved `BISECTIONS` times. The
 *  returned bearing is never more than this plus `ARC_OPEN_MARGIN_RAD` past
 *  the least rotation that opens every arc. */
export const ARC_OPEN_TOLERANCE_RAD = Math.PI / 2 / 2 ** BISECTIONS;

/** rad — how far inside the edge of the all-bearing interval the answer
 *  sits (see the header): the `CONFIG.bots.arcOpenMarginDeg` dial. */
export const ARC_OPEN_MARGIN_RAD = (CONFIG.bots.arcOpenMarginDeg * Math.PI) / 180;

/** Does EVERY turret of the hull bear on `target` from `pos` on this heading
 *  (the shared arc test, each from its own station)? A hull with no battery
 *  has nothing masked: true. */
export function allTurretsBear(hullId: HullId, pos: Vec2, heading: number, target: Vec2): boolean {
  const pose = { x: pos.x, y: pos.y, heading };
  const n = turretMounts(hullId).length;
  for (let i = 0; i < n; i += 1) {
    if (!turretBears(hullId, i, pose, target)) return false;
  }
  return true;
}

/** +1 / −1 — the side of the line from `pos` to `target` the bow lies on
 *  (counter-clockwise positive; +1 when the bow is exactly on the line). */
export function bowSide(pos: Vec2, target: Vec2, heading: number): number {
  return angleDiff(bearing(pos, target), heading) >= 0 ? 1 : -1;
}

/**
 * THE BEARING THAT OPENS EVERY ARC: `want` itself when a hull steady on it
 * already has every turret bearing on `target`; otherwise the bearing nearest
 * to `want`, on the bow's side of the target line, on which every turret
 * bears (to within `ARC_OPEN_TOLERANCE_RAD`), taken `ARC_OPEN_MARGIN_RAD`
 * further toward the beam. `want` unchanged for a hull
 * with no battery, and when even the beam-on heading masks a turret (the
 * target is alongside the hull — there is no heading to offer).
 */
export function openArcBearing(hullId: HullId, pos: Vec2, target: Vec2, want: number, heading: number): number {
  if (allTurretsBear(hullId, pos, want, target)) return want;
  const brg = bearing(pos, target);
  const side = bowSide(pos, target, heading);
  const at = (theta: number): number => wrapAngle(brg + side * theta);
  let open = Math.PI / 2;
  if (!allTurretsBear(hullId, pos, at(open), target)) return want;
  let masked = Math.abs(angleDiff(brg, want));
  for (let i = 0; i < BISECTIONS; i += 1) {
    const mid = (open + masked) / 2;
    if (allTurretsBear(hullId, pos, at(mid), target)) open = mid;
    else masked = mid;
  }
  const toBeam = Math.PI / 2 - open;
  return at(open + Math.sign(toBeam) * Math.min(Math.abs(toBeam), ARC_OPEN_MARGIN_RAD));
}
