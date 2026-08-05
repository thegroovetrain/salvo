// Island geometry queries — THE single seam every island consumer uses
// (LOS, swept shells, mine legality, spawn clearance, drone avoidance,
// collision push-out). No consumer may iterate polygon edges itself: every
// function here runs the mandatory bounding-circle broadphase (`isle.x/y/r`)
// BEFORE any exact polygon test, and all polygon math delegates to the
// concave-safe primitives in silhouette.ts — no second polygon library.
//
// `isle.core` (largest disc about the bounding centre fully inside the
// polygon) gives the opposite early-out for LOS: a segment through the core
// is definitely blocked, no edges visited.

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
 * core disc is definitely blocked — the core is fully inside the polygon),
 * then the exact edge test.
 */
export function islandBlocksSegment(a: Vec2, b: Vec2, isle: Island): boolean {
  if (segCircleHit(a, b, isle, isle.r) === null) return false;
  if (isle.core > 0 && segCircleHit(a, b, isle, isle.core) !== null) return true;
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
 * Closest point on the skeleton POLYLINE to `p`, with its distance. Projects
 * onto every skeleton SEGMENT (not just the vertices) — a 1-point skeleton
 * degenerates to that point. This is THE definition of "the skeleton" for
 * both the push-out consumer (`skeletonNormal`, below) and the map-gen
 * star-shape accept predicate (`islandShape.ts` `isStarShaped`), which MUST
 * call this same function: when the two disagreed — nearest vertex on one
 * side, nearest point on the polyline on the other — a hull amidships a long
 * 2-point ridge got its escape direction from a far endpoint, heavily
 * TANGENTIAL to the coast, and the "minimal clearing translation" slid it
 * along the coastline instead of off it. The skeleton is 1-3 points (0-2
 * segments), so this stays a couple of dot products; no spatial structure.
 */
export function nearestOnSkeleton(p: Vec2, skel: readonly Vec2[]): Vec2 & { dist: number } {
  let bx = skel[0].x;
  let by = skel[0].y;
  let bd = Infinity;
  for (let i = 0, segs = Math.max(skel.length - 1, 1); i < segs; i++) {
    const a = skel[i];
    const b = skel[Math.min(i + 1, skel.length - 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < bd) {
      bd = d;
      bx = qx;
      by = qy;
    }
  }
  return { x: bx, y: by, dist: bd };
}

/**
 * Unit direction from the nearest point of the SKELETON POLYLINE toward `p`,
 * plus the distance to it. The skeleton is the push-out authority: every
 * island polygon is star-shaped about it (validated at generation with THIS
 * SAME `nearestOnSkeleton`), so this direction is always a valid escape from
 * inside the polygon — the outward ray leaves the coastline and never
 * re-enters it, so no concave pocket can trap a hull and no push slides a
 * hull along the coast. Degenerate (`p` exactly on the skeleton) => +x.
 */
export function skeletonNormal(p: Vec2, isle: Island): { nx: number; ny: number; dist: number } {
  const s = nearestOnSkeleton(p, isle.skeleton);
  if (s.dist <= 1e-9) return { nx: 1, ny: 0, dist: 0 };
  return { nx: (p.x - s.x) / s.dist, ny: (p.y - s.y) / s.dist, dist: s.dist };
}
