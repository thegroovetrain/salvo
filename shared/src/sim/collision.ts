// Ship-vs-world collision resolution, shared by the server sim (world.ts) and
// client prediction (prediction.ts) so the two never diverge on rocks or the
// map edge. Positional corrections only — no reflection/bounce; the caller
// applies the islandSpeedMult speed damp ONCE per tick when this reports
// contact (island push-out OR boundary press).
//
// Islands are POLYGON coastlines (cycle 51): every island test runs the
// mandatory bounding-circle broadphase (`isle.x/y/r`) before the exact
// hull-polygon vs island-polygon overlap test (any hull edge crossing or
// entering the coastline, or the island wholly inside the hull), built from
// the silhouette.ts primitives (segPolygonHit at OVERLAP_PAD — see the
// constant for why radius 0 is not exact) with skeletonNormal from the
// island.ts seam — no second polygon library.
//
// ALGORITHM — pose-validity rollback (playtest finding #64: "boats should be
// blocked by islands completely"). The candidate pose after kinematics is
// resolved against the previous tick's pose, which is VALID by induction
// (spawn is validated; every tick lands overlap-free, so the next tick's prev
// is clean). Steps, first success wins — "success" = the transformed silhouette
// overlaps NO island polygon AND the center respects the boundary clamp:
//   1. Clamp the candidate center to the map boundary (radius − polygonMaxRadius).
//      The map edge stays a CIRCLE — only islands are polygons.
//   2. (i)  candidate pose, then up to MAX_PASSES push-out passes over all
//           islands. The push DIRECTION is the SKELETON NORMAL — away from the
//           nearest point of the island's skeleton (island.ts skeletonNormal).
//           Every island polygon is star-shaped about its skeleton (a map-gen
//           invariant), so that direction is ALWAYS a valid escape — including
//           from inside a concave cove, where a nearest-edge normal could wedge
//           the hull against the far arm. The push DISTANCE is the minimal
//           translation along that normal that clears the island (bisection on
//           the exact overlap test, DEPTH_TOL), capped at the strict upper
//           bound on true penetration `isle.r + polyMax − dist(center,
//           bounding centre)` — the polygon analogue of the old circle cap
//           (bounding circles separated ⟹ polygons separated), so no single
//           pass can teleport the hull. When even the capped translation
//           cannot clear (a cove arm in the way), the full cap is applied and
//           the next pass re-aims from the new nearest skeleton point.
//      (ii) candidate x/y with the PREVIOUS heading — the rudder is blocked by
//           rock while forward motion is kept (this is what stops a hull
//           rotating THROUGH an island into a perpendicular wedge with no
//           translation escape).
//      (iii) full revert to the previous pose (x, y, AND heading) — guaranteed
//           clear by induction.
// POST-INVARIANT: on return the ship's silhouette overlaps NO island and the
// center respects the boundary clamp. There is no silent give-up.
//
// The islandSpeedMult damp applies ONCE per tick at the CALL SITE regardless of
// how many islands/passes touched the ship — the old per-contact damping
// collapsed speed to ~0 in a two-island wedge, killing throttle escape (and
// rudder authority, which scales with speed/steerageSpeed).

import type { Island } from '../types.js';
import type { Vec2 } from '../math/vec.js';
import type { ShipState } from './ship.js';
import { segCircleHit } from '../math/geom.js';
import { skeletonNormal } from './island.js';
import { pointInPolygon, polygonMaxRadius, segPolygonHit, transformPolygon } from './silhouette.js';

/** Tiny outward pad so a just-cleared pose reads as strictly non-overlapping. */
const PUSH_EPS = 1e-6;
/** Max full sweeps over all islands per push attempt before it gives up. */
const MAX_PASSES = 4;
/** Bisection tolerance (u) on the minimal clearing translation in pushOutOf. */
const DEPTH_TOL = 1e-3;
/**
 * Edge-test pad for the exact overlap predicate. segSegClosest returns ~1e-15
 * FLOAT DUST (not exactly 0) at a proper segment crossing, so a radius-0
 * segPolygonHit can MISS a genuine hull-edge/coastline crossing whose
 * endpoints all sit outside the other polygon. Any pad comfortably above the
 * dust and comfortably below PUSH_EPS restores exact crossing detection
 * without ever re-flagging a pose the push just cleared (PUSH_EPS = 1000×).
 */
const OVERLAP_PAD = 1e-9;

/** Scratch Vec2s for the allocation-free translated-overlap test. */
const S0: Vec2 = { x: 0, y: 0 };
const S1: Vec2 = { x: 0, y: 0 };

/** A minimal pose — the previous, induction-valid tick's placement. */
export interface Pose {
  x: number;
  y: number;
  heading: number;
}

/**
 * Resolve a candidate ship pose (after kinematics) to a valid one via the
 * rollback algorithm described in the file header. `prev` is the previous
 * tick's pose (valid by induction); `ship` holds the candidate and is mutated
 * to the final pose. `localPoly` is the ship's LOCAL silhouette
 * (hullSilhouette(id)); `scratch` is reused for the transformed world polygon
 * so the 20Hz loop can run allocation-light. Returns whether the ship touched
 * an island or the boundary this tick — the caller damps speed once if so.
 */
export function resolveShipPose(
  prev: Pose,
  ship: ShipState,
  islands: readonly Island[],
  mapRadius: number,
  localPoly: readonly Vec2[],
  scratch: Vec2[] = [],
): { contact: boolean } {
  const polyMax = polygonMaxRadius(localPoly);
  const clamped = clampCenter(ship, mapRadius, polyMax);
  const bx = ship.x;
  const by = ship.y;

  // (i) candidate pose.
  let r = attemptClear(ship, bx, by, ship.heading, islands, mapRadius, localPoly, polyMax, scratch);
  if (r.cleared) return { contact: clamped || r.moved };

  // (ii) candidate position, previous heading — rudder blocked by rock.
  r = attemptClear(ship, bx, by, prev.heading, islands, mapRadius, localPoly, polyMax, scratch);
  if (r.cleared) return { contact: true };

  // (iii) full revert to the previous valid pose.
  ship.x = prev.x;
  ship.y = prev.y;
  ship.heading = prev.heading;
  return { contact: true };
}

/**
 * Place the ship at (baseX, baseY, heading), push it out of every island for up
 * to MAX_PASSES, and report whether the resulting pose is clear (overlap-free
 * and inside the boundary) and whether any push moved it.
 */
function attemptClear(
  ship: ShipState,
  baseX: number,
  baseY: number,
  heading: number,
  islands: readonly Island[],
  mapRadius: number,
  localPoly: readonly Vec2[],
  polyMax: number,
  scratch: Vec2[],
): { cleared: boolean; moved: boolean } {
  ship.x = baseX;
  ship.y = baseY;
  ship.heading = heading;
  const world = transformPolygon(localPoly, baseX, baseY, heading, scratch);
  const moved = pushClear(ship, world, islands, polyMax);
  const cleared = !overlapsAny(ship, world, islands, polyMax) && withinBoundary(ship, mapRadius, polyMax);
  return { cleared, moved };
}

/** Up to MAX_PASSES sweeps pushing the hull out of every island. */
function pushClear(ship: ShipState, world: Vec2[], islands: readonly Island[], polyMax: number): boolean {
  let moved = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let any = false;
    for (const isle of islands) {
      if (pushOutOf(ship, world, isle, polyMax)) any = true;
    }
    if (!any) break;
    moved = true;
  }
  return moved;
}

/**
 * Exact overlap test between the hull polygon translated by (ox, oy) and one
 * island's coastline: any hull edge crossing or starting inside the polygon
 * (segPolygonHit at OVERLAP_PAD — its start-inside rule also catches "hull
 * wholly inside island", and each edge is broadphased on the bounding circle
 * first), or the island wholly inside the hull (one island vert,
 * back-translated). The offset form lets pushOutOf probe candidate
 * translations allocation-free.
 */
function hullOverlapsIsland(world: readonly Vec2[], ox: number, oy: number, isle: Island): boolean {
  for (let i = 0, j = world.length - 1; i < world.length; j = i++) {
    S0.x = world[j].x + ox;
    S0.y = world[j].y + oy;
    S1.x = world[i].x + ox;
    S1.y = world[i].y + oy;
    if (segCircleHit(S0, S1, isle, isle.r) === null) continue;
    if (segPolygonHit(S0, S1, isle.poly, OVERLAP_PAD) !== null) return true;
  }
  S0.x = isle.poly[0].x - ox;
  S0.y = isle.poly[0].y - oy;
  return pointInPolygon(S0, world);
}

/** True iff the world polygon overlaps any island (bounding-circle broadphase first). */
function overlapsAny(
  ship: ShipState,
  world: readonly Vec2[],
  islands: readonly Island[],
  polyMax: number,
): boolean {
  for (const isle of islands) {
    if (Math.hypot(ship.x - isle.x, ship.y - isle.y) > polyMax + isle.r) continue;
    if (hullOverlapsIsland(world, 0, 0, isle)) return true;
  }
  return false;
}

/** True iff the whole silhouette (bounding circle polyMax) fits the map. */
function withinBoundary(ship: ShipState, mapRadius: number, polyMax: number): boolean {
  return Math.hypot(ship.x, ship.y) <= mapRadius - polyMax + PUSH_EPS;
}

/** Clamp the center so the hull's bounding circle stays inside the map edge. */
function clampCenter(ship: ShipState, mapRadius: number, polyMax: number): boolean {
  const limit = mapRadius - polyMax;
  const d = Math.hypot(ship.x, ship.y);
  if (d <= limit) return false;
  const scale = limit / d;
  ship.x *= scale;
  ship.y *= scale;
  return true;
}

/**
 * Push the ship's world polygon (and center) out of one island polygon.
 * Positional only; returns true when an overlap was corrected.
 *
 * Direction: the SKELETON NORMAL — from the nearest point of the island's
 * skeleton toward the ship center. Star-shapedness about the skeleton (map-gen
 * invariant) makes this always a valid escape direction, even from inside a
 * concave cove.
 *
 * Distance: the minimal translation along that normal that clears the island
 * (bisection on the exact overlap test), capped at the strict upper bound on
 * true penetration `isle.r + polyMax − dist(center, bounding centre)` — the
 * polygon analogue of the old circle cap: separating the bounding circles
 * certainly separates the polygons, and the bound is > 0 whenever the shapes
 * overlap. No single pass can teleport the hull; if the cap itself cannot
 * clear (an overhanging cove arm), the full cap is applied and the next pass
 * re-aims from the new nearest skeleton point.
 */
function pushOutOf(ship: ShipState, world: Vec2[], isle: Island, polyMax: number): boolean {
  const dc = Math.hypot(ship.x - isle.x, ship.y - isle.y);
  if (dc > polyMax + isle.r) return false; // bounding-circle broadphase
  if (!hullOverlapsIsland(world, 0, 0, isle)) return false;

  const { nx, ny } = skeletonNormal(ship, isle);
  const cap = isle.r + polyMax - dc;
  const depth = escapeDepth(world, isle, nx, ny, cap) + PUSH_EPS;
  ship.x += nx * depth;
  ship.y += ny * depth;
  for (const p of world) {
    p.x += nx * depth;
    p.y += ny * depth;
  }
  return true;
}

/**
 * Minimal translation along (nx, ny), within [0, cap], that clears the hull of
 * the island — found by bisection against the exact overlap test (the hull is
 * KNOWN to overlap at 0). Returns `cap` when even the capped translation still
 * overlaps (the caller's multi-pass loop re-aims next pass).
 */
function escapeDepth(world: readonly Vec2[], isle: Island, nx: number, ny: number, cap: number): number {
  if (hullOverlapsIsland(world, nx * cap, ny * cap, isle)) return cap;
  let lo = 0;
  let hi = cap;
  while (hi - lo > DEPTH_TOL) {
    const mid = (lo + hi) / 2;
    if (hullOverlapsIsland(world, nx * mid, ny * mid, isle)) lo = mid;
    else hi = mid;
  }
  return hi;
}
