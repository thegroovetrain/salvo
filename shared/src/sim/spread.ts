// MULTI-SHELL SPREAD GEOMETRY — the ONE straddle rule, shared (Story 7-5
// wave 2, R2.3 + R2.16; broadside aiming re-derived by Eric's 2026-08-20
// per-turret-arc ruling).
//
// Several features place a ladder of evenly-spaced offsets symmetrically about
// a centre and must place them identically on the server (which resolves the
// shots) and on the client (which draws one aim-preview line + burst circle
// PER SHELL). They share a single STRADDLE law, stated once here:
//
//     offset_i = (i - (count - 1) / 2) × step,   i = 0 .. count-1
//
// An ODD count therefore puts one entry exactly on the centre and an EVEN
// count straddles it symmetrically. Its consumers today: BARREL's parallel
// gun tracks (lateral offsets about the aim line — an odd barrel count puts
// one shell exactly on the click, Eric: *"One shell will *absolutely* hit at
// the target point"*), and the BROADSIDE BARRAGE's turret MUZZLE positions
// along the hull plus their MOUNT BEARINGS across the beam sector
// (sim/aim.ts turretMuzzles / turretMountBearings).
//
// THE BROADSIDE'S ANGULAR SHELL FAN IS GONE (`fanBearings`/`fanTargets`,
// deleted 2026-08-20): under Eric's per-turret-arc model nobody designs a
// spread — each turret fires as close to the click as its OWN arc allows and
// the pattern EMERGES (sim/aim.ts turretAimPoints). The straddle law now
// spaces the GUNS, not the shells.
//
// Pure over plain numbers/points: zero I/O, no CONFIG reads (every spacing
// arrives from the caller's effectiveStats/CONFIG), deterministic.

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
