// Ship-vs-world collision resolution, shared by the server sim (world.ts) and
// client prediction (prediction.ts) so the two never diverge on rocks or the
// map edge. Positional corrections only — no reflection/bounce; the caller
// applies the islandSpeedMult speed damp ONCE per tick when this reports
// contact (island push-out OR boundary press).
//
// ALGORITHM — pose-validity rollback (playtest finding #64: "boats should be
// blocked by islands completely"). The candidate pose after kinematics is
// resolved against the previous tick's pose, which is VALID by induction
// (spawn is validated; every tick lands overlap-free, so the next tick's prev
// is clean). Steps, first success wins — "success" = the transformed silhouette
// overlaps NO island AND the center respects the boundary clamp:
//   1. Clamp the candidate center to the map boundary (radius − polygonMaxRadius).
//   2. (i)  candidate pose, then up to MAX_PASSES push-out passes over all
//           islands. Push distance is the true penetration along the push
//           normal, capped at the strict upper bound (isle.r + polyMax − dist)
//           so no single pass can teleport the hull (the old deep-overlap push
//           used nearest-boundary distance and could jump ~97u in one tick).
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

import type { Circle } from '../types.js';
import type { Vec2 } from '../math/vec.js';
import type { ShipState } from './ship.js';
import {
  closestPointOnPolygon,
  pointInPolygon,
  polygonMaxRadius,
  transformPolygon,
} from './silhouette.js';

const EPS = 1e-9;
/** Tiny outward pad so a just-cleared pose reads as strictly non-overlapping. */
const PUSH_EPS = 1e-6;
/** Max full sweeps over all islands per push attempt before it gives up. */
const MAX_PASSES = 4;

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
  islands: readonly Circle[],
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
  islands: readonly Circle[],
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
  const cleared = !overlapsAny(world, islands) && withinBoundary(ship, mapRadius, polyMax);
  return { cleared, moved };
}

/** Up to MAX_PASSES sweeps pushing the hull out of every island. */
function pushClear(ship: ShipState, world: Vec2[], islands: readonly Circle[], polyMax: number): boolean {
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

/** True iff the world polygon overlaps any island circle. */
function overlapsAny(world: readonly Vec2[], islands: readonly Circle[]): boolean {
  for (const isle of islands) {
    if (pointInPolygon(isle, world)) return true;
    if (closestPointOnPolygon(isle, world).dist < isle.r) return true;
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
 * Push the ship's world polygon (and center) out of one island circle.
 * Positional only; returns true when an overlap was corrected. The push
 * direction is from the island center toward the hull's closest boundary point
 * (shallow overlap) — or, when the island center sits INSIDE the hull (deep
 * overlap), from island center toward ship center (dead-center degenerates to
 * +x). The deep-overlap displacement is capped at the strict upper bound on
 * true penetration so no single pass can teleport the hull.
 */
function pushOutOf(ship: ShipState, world: Vec2[], isle: Circle, polyMax: number): boolean {
  const q = closestPointOnPolygon(isle, world);
  const inside = pointInPolygon(isle, world);
  if (!inside && q.dist >= isle.r) return false;

  let nx: number;
  let ny: number;
  let depth: number;
  if (!inside && q.dist > EPS) {
    nx = (q.x - isle.x) / q.dist;
    ny = (q.y - isle.y) / q.dist;
    depth = isle.r - q.dist;
  } else {
    const dx = ship.x - isle.x;
    const dy = ship.y - isle.y;
    const d = Math.hypot(dx, dy);
    nx = d > EPS ? dx / d : 1;
    ny = d > EPS ? dy / d : 0;
    depth = Math.min(isle.r + q.dist, isle.r + polyMax - d);
  }

  depth += PUSH_EPS;
  ship.x += nx * depth;
  ship.y += ny * depth;
  for (const p of world) {
    p.x += nx * depth;
    p.y += ny * depth;
  }
  return true;
}
