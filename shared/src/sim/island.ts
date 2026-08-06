// Island geometry queries — THE single seam every island consumer uses
// (LOS, swept shells, mine legality, spawn clearance, drone avoidance,
// collision push-out). No consumer may iterate polygon edges itself: every
// function here runs the mandatory bounding-circle broadphase (`isle.x/y/r`)
// BEFORE any exact polygon test, and all polygon math delegates to the
// concave-safe primitives in silhouette.ts — no second polygon library.
//
// `isle.core` (largest disc about the POLE OF INACCESSIBILITY fully inside
// the polygon — cycle 59: about `isle.pole`, NOT the bounding centre, because
// a hook island's centroid falls in its own bay) gives the opposite early-out
// for LOS: a segment through the core is definitely blocked, no edges visited.
//
// The cycle-51 skeleton (`nearestOnSkeleton`/`skeletonNormal`) is RETIRED with
// the capsule generator: a thresholded height field has arbitrary topology, so
// no star-shape guarantee exists to make a skeleton ray a valid escape. The
// push-out authority is now the NEAREST BOUNDARY POINT (`coastNormal`), with
// collision.ts's 3-step rollback making a rare bad direction non-fatal
// (measured 0.004% escape failures over 260,637 prototype trials).

import { segCircleHit } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { closestPointOnPolygon, pointInPolygon, segPolygonHit } from './silhouette.js';

/**
 * Beyond `r + ISLAND_DIST_SLACK` from the bounding centre, islandDistance
 * returns the cheap conservative lower bound `dist - r` instead of the exact
 * coastline distance. 128u comfortably exceeds every clearance threshold in
 * use (SPAWN_MARGIN 64, CHANNEL_MIN 48, nav erosion ~24), so the lower bound
 * is decision-equivalent wherever it is compared against one of them.
 */
export const ISLAND_DIST_SLACK = 128;

/**
 * Earliest hit fraction of segment a->b against the island's coastline, or
 * null on a clean miss (0 when `a` starts inside — the segCircleHit rule, so
 * swept collision cannot tunnel out). Bounding-circle broadphase first; exact
 * via segPolygonHit at radius 0. Concave coves are genuinely missable.
 */
export function islandSegHit(a: Vec2, b: Vec2, isle: Island): number | null {
  if (segCircleHit(a, b, isle, isle.r) === null) return null;
  return segPolygonHit(a, b, isle.poly, 0);
}

/**
 * True iff segment a->b crosses this island (the LOS primitive). Broadphase
 * on the bounding circle, then the `core` early-out (a segment hitting the
 * core disc — centred on the POLE, where the core is measured — is definitely
 * blocked: the core is fully inside the polygon), then the exact edge test.
 */
export function islandBlocksSegment(a: Vec2, b: Vec2, isle: Island): boolean {
  if (segCircleHit(a, b, isle, isle.r) === null) return false;
  if (isle.core > 0 && segCircleHit(a, b, isle.pole, isle.core) !== null) return true;
  return segPolygonHit(a, b, isle.poly, 0) !== null;
}

/** True iff `p` is on this island's land. Broadphase on `r`, then exact. */
export function pointInIsland(p: Vec2, isle: Island): boolean {
  const dx = p.x - isle.x;
  const dy = p.y - isle.y;
  if (dx * dx + dy * dy > isle.r * isle.r) return false;
  return pointInPolygon(p, isle.poly);
}

/**
 * SIGNED distance from `p` to the coastline: negative inside the island,
 * positive on the water. Broadphase-gated: beyond `r + ISLAND_DIST_SLACK`
 * the cheap lower bound `dist - r` is returned (always <= the true
 * distance — see ISLAND_DIST_SLACK for why that is decision-equivalent).
 */
export function islandDistance(p: Vec2, isle: Island): number {
  const d = Math.hypot(p.x - isle.x, p.y - isle.y);
  if (d > isle.r + ISLAND_DIST_SLACK) return d - isle.r;
  const boundary = closestPointOnPolygon(p, isle.poly).dist;
  return pointInPolygon(p, isle.poly) ? -boundary : boundary;
}

/** Closest point on the island's coastline to `p`, with its distance. */
export function nearestCoastPoint(p: Vec2, isle: Island): Vec2 & { dist: number } {
  return closestPointOnPolygon(p, isle.poly);
}

/**
 * Unit ESCAPE direction toward open water from `p` against this island's
 * coastline, plus the distance to the nearest boundary point — the push-out
 * authority (cycle 59, replacing the retired `skeletonNormal`).
 *
 *   - `p` INSIDE the polygon: points from `p` toward its nearest boundary
 *     point (the shortest way OUT of the land).
 *   - `p` OUTSIDE: points from the nearest boundary point toward `p` (the
 *     direction that INCREASES clearance — the hull overlaps an edge while
 *     its centre is on the water).
 *
 * Degenerate (`p` exactly on the coastline): aims away from the pole of
 * inaccessibility — the deepest interior point, so "away from it" is the best
 * available outward guess — and +x if `p` sits on the pole itself.
 */
export function coastNormal(p: Vec2, isle: Island): { nx: number; ny: number; dist: number } {
  const q = closestPointOnPolygon(p, isle.poly);
  if (q.dist <= 1e-9) {
    const px = p.x - isle.pole.x;
    const py = p.y - isle.pole.y;
    const d = Math.sqrt(px * px + py * py);
    if (d <= 1e-9) return { nx: 1, ny: 0, dist: 0 };
    return { nx: px / d, ny: py / d, dist: 0 };
  }
  const inside = pointInPolygon(p, isle.poly);
  const sign = inside ? 1 : -1;
  return { nx: (sign * (q.x - p.x)) / q.dist, ny: (sign * (q.y - p.y)) / q.dist, dist: q.dist };
}
