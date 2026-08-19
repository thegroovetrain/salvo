// MULTI-SHELL SPREAD GEOMETRY — the ONE straddle rule, shared (Story 7-5
// wave 2, R2.3 + R2.16).
//
// Two features in this story fire several shells from one click and must place
// them identically on the server (which resolves the shots) and on the client
// (which draws one aim-preview line + burst circle PER SHELL): the BROADSIDE
// BARRAGE's angular fan and BARREL's parallel tracks. They share a single
// STRADDLE law, stated once here:
//
//     offset_i = (i - (count - 1) / 2) × step,   i = 0 .. count-1
//
// An ODD count therefore puts one shell exactly on the click (offset 0 — Eric:
// *"One shell will *absolutely* hit at the target point"*), and an EVEN count
// straddles it symmetrically with NO shell on it (Eric: *"when there are 4
// turrets specifically, there is no middle turret that will absolutely hit the
// target location"*). That behaviour falls out of the formula rather than being
// special-cased per turret count, which is why 3/4/5 turrets need no branches.
//
// The two features differ ONLY in what `step` means and in what the offset is
// applied to: the broadside spreads ANGULARLY about the click bearing with every
// shell ending at the click's own RANGE (an arc at constant radius), while
// BARREL offsets each shell LATERALLY, perpendicular to the aim bearing, so its
// volley covers a constant-width band at every range.
//
// Pure over plain numbers/points: zero I/O, no CONFIG reads (every angle and
// spacing arrives from the caller's effectiveStats/CONFIG), deterministic.

import type { Vec2 } from '../math/vec.js';

/**
 * THE straddle ladder: `count` offsets of `step`, centered on zero. Odd counts
 * include an exact 0 (the shell on the click); even counts straddle it. Returns
 * `[]` for a non-positive/non-finite count and `[0]` for a single shot, so a
 * degenerate call still fires exactly one shell on the bearing.
 */
export function straddleOffsets(count: number, step: number): number[] {
  const n = Math.floor(count);
  if (!Number.isFinite(n) || n <= 0) return [];
  if (n === 1 || !Number.isFinite(step)) return new Array<number>(Math.max(1, n)).fill(0);
  const mid = (n - 1) / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push((i - mid) * step);
  return out;
}

/**
 * The per-shell BEARINGS of a broadside fan: `count` shells evenly spaced
 * across the FULL fan, whose extremes sit at `bearing ± halfAngle`. A single
 * shell flies exactly on the bearing (there is no fan to spread it across).
 * Bearings are returned unwrapped — `bearing + offset` — because every consumer
 * feeds them straight into cos/sin or into an angle-difference test, both of
 * which are wrap-agnostic.
 */
export function fanBearings(bearing: number, count: number, halfAngle: number): number[] {
  const n = Math.max(0, Math.floor(count));
  const step = n > 1 ? (2 * halfAngle) / (n - 1) : 0;
  return straddleOffsets(n, step).map((d) => bearing + d);
}

/**
 * The per-shell TARGET POINTS of a broadside fan: every shell ends its run at
 * the CLICK'S RANGE, so the pattern is an arc at constant radius from the ship
 * (R2.3), spread angularly about the click bearing. A degenerate click ON the
 * ship centre (zero radius) returns that point for every shell rather than
 * NaNs.
 */
export function fanTargets(origin: Vec2, target: Vec2, count: number, halfAngle: number): Vec2[] {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const r = Math.hypot(dx, dy);
  const bearing = Math.atan2(dy, dx);
  return fanBearings(bearing, count, halfAngle).map((b) => ({
    x: origin.x + Math.cos(b) * r,
    y: origin.y + Math.sin(b) * r,
  }));
}

/**
 * The per-shell LATERAL OFFSET VECTORS of a parallel volley (BARREL, R2.16):
 * world-space displacements perpendicular to `bearing`, `spacing` apart,
 * straddling the aim line. ADD each to BOTH the muzzle point and the target
 * point of its shell — that is what makes the tracks parallel rather than
 * fanned, and what keeps each shell bursting at its own point.
 */
export function parallelOffsets(bearing: number, count: number, spacing: number): Vec2[] {
  const px = -Math.sin(bearing);
  const py = Math.cos(bearing);
  return straddleOffsets(count, spacing).map((d) => ({ x: px * d, y: py * d }));
}
