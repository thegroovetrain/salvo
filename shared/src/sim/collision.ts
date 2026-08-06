// Ship-vs-world collision resolution, shared by the server sim (world.ts) and
// client prediction (prediction.ts) so the two never diverge on rocks or the
// map edge. Positional corrections only — no reflection/bounce; the speed
// response lives in `applyGroundingDamp` below, which BOTH sides call with the
// result of `resolveShipPose` (one implementation, no mirrored copies).
//
// GROUNDING vs THE MAP EDGE (Eric ruling 2026-08-06, "boundary + directional
// damp"). Two things changed here, both fixing the "pinned in open ocean" bug:
//
//   (a) The map-edge clamp is HEADING-AWARE and is NOT grounding. It used to
//       clamp the CENTER at `mapRadius − polygonMaxRadius` — a heading-
//       INDEPENDENT worst-case hull radius (62.29u for a battleship), i.e. an
//       invisible wall 62.3u inside the drawn boundary no matter which way the
//       hull pointed — and then report that press as `contact`, so the speed
//       damp fired in open water with the nearest land hundreds of units away.
//       Now the clamp uses the hull's EXACT fit at its actual pose
//       (`polygonFitLimit`), so the bow — or the beam, when running parallel —
//       just touches the drawn edge, and pressing the edge reports NO contact
//       at all: the boundary is a wall, not a tar pit.
//
//   (b) The damp is DIRECTIONAL. `resolveShipPose` now reports how HEAD-ON the
//       land contact was (`headOn`, 0 = grazing … 1 = dead-on), derived from
//       the net escape normal the push-out used, and the damp scales with it —
//       full at a dead-on ram, none at a graze. A hull scraping a coast keeps
//       its way and its helm; a hull driving square into rock loses way.
//
// WHY THE DAMP IS A SPEED CAP AND NOT A PER-TICK MULTIPLIER. The shipped rule
// was `speed *= islandSpeedMult` EVERY tick contact persisted, so under
// sustained contact speed converged to `accel·dt·m/(1−m)` = 0.083 u/s for a
// battleship. Rudder authority scales with speed (sim/ship.ts), so that is
// 0.24 deg/s — a 90° turn takes six minutes, and holding throttle SUSTAINS the
// pin. ANY sustained sub-1 multiplier collapses to that fixed point (a 45°
// scrape at a "mild" 0.73 factor still settles near 0.7 u/s), so scaling the
// MULTIPLIER by head-on-ness would not have delivered the ruling's "keeps helm
// authority, and can always turn away". The cap form is stateless, non-
// compounding, and reaches a fixed point that is a real speed: at a dead-on
// contact the hull holds `islandSpeedMult × maxSpeed` (8.75 u/s for a
// battleship — above its 8 u/s steerage speed, so FULL rudder authority),
// while its POSITION stays blocked by the push-out/rollback below. Escape is
// structural: turn away, the contact becomes grazing, the cap lifts, the hull
// accelerates off. `CONFIG.ship.islandSpeedMult` is still the one tunable.
//
// Islands are POLYGON coastlines (cycle 51): every island test runs the
// mandatory bounding-circle broadphase (`isle.x/y/r`) before the exact
// hull-polygon vs island-polygon overlap test (any hull edge crossing or
// entering the coastline, or the island wholly inside the hull), built from
// the silhouette.ts primitives (segPolygonHit at OVERLAP_PAD — see the
// constant for why radius 0 is not exact) with coastNormal from the
// island.ts seam — no second polygon library.
//
// ALGORITHM — pose-validity rollback (playtest finding #64: "boats should be
// blocked by islands completely"). The candidate pose after kinematics is
// resolved against the previous tick's pose, which is VALID by induction
// (spawn is validated; every tick lands overlap-free, so the next tick's prev
// is clean). Steps, first success wins — "success" = the transformed silhouette
// overlaps NO island polygon AND the center respects the boundary clamp:
//   1. Clamp the candidate center to the map boundary (radius − the hull's
//      reach along the outward radial AT THAT ATTEMPT'S HEADING, so each
//      attempt clamps for its own pose). The map edge stays a CIRCLE — only
//      islands are polygons — and remains IMPENETRABLE: the clamp is exact
//      (scaling along the radial leaves the radial direction, and therefore
//      the extent, unchanged) and `withinBoundary` re-checks it after every
//      push-out.
//   2. (i)  candidate pose, then up to MAX_PASSES push-out passes over all
//           islands. The push DIRECTION is the NEAREST-BOUNDARY normal —
//           toward the closest point of the island's coastline from inside,
//           away from it from outside (island.ts coastNormal; cycle 59 — the
//           skeleton normal retired with the star-shape invariant, since a
//           thresholded height field has arbitrary topology). The generator
//           bounds the minimum local coastline feature at ~4.9u (marching-
//           squares corner clamp), which is what keeps the nearest boundary a
//           safe aim; the rollback below makes the residual bad-direction
//           case (measured 0.004% of 260k prototype trials) non-fatal. The
//           push DISTANCE is the minimal translation along that normal that
//           clears the island (bisection on the exact overlap test,
//           DEPTH_TOL), capped at the strict upper bound on true penetration
//           `isle.r + polyMax − dist(center, bounding centre)` — the polygon
//           analogue of the old circle cap (bounding circles separated ⟹
//           polygons separated), so no single pass can teleport the hull.
//           When even the capped translation cannot clear (a cove arm in the
//           way), the full cap is applied and the next pass re-aims from the
//           new nearest boundary point.
//      (ii) candidate x/y with the PREVIOUS heading — the rudder is blocked by
//           rock while forward motion is kept (this is what stops a hull
//           rotating THROUGH an island into a perpendicular wedge with no
//           translation escape).
//      (iii) full revert to the previous pose (x, y, AND heading) — guaranteed
//           clear by induction.
// POST-INVARIANT: on return the ship's silhouette overlaps NO island and the
// hull fits inside the map circle. There is no silent give-up.
//
// The damp applies ONCE per tick regardless of how many islands/passes touched
// the ship — the pre-#64 per-contact damping collapsed speed to ~0 in a
// two-island wedge, killing throttle escape (and rudder authority, which
// scales with speed/steerageSpeed).

import { CONFIG } from '../constants.js';
import type { Island } from '../types.js';
import type { Vec2 } from '../math/vec.js';
import type { ShipState } from './ship.js';
import { segCircleHit } from '../math/geom.js';
import { coastNormal } from './island.js';
import {
  pointInPolygon,
  polygonFitLimit,
  polygonMaxRadius,
  segPolygonHit,
  transformPolygon,
} from './silhouette.js';

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

/** What one tick's pose resolution reports to the speed response. */
export interface ShipPoseResult {
  /**
   * True iff the hull touched LAND this tick (push-out, blocked rudder, or a
   * full revert). Pressing the MAP EDGE is deliberately NOT contact — the edge
   * is a wall, not ground (Eric ruling 2026-08-06).
   */
  contact: boolean;
  /**
   * How head-on that land contact was: 0 = grazing (the hull's motion runs
   * along the coast), 1 = dead-on (motion straight into it). Measured as the
   * ship's direction of travel against the net escape normal the push-out
   * used; a full revert reports 1 (the hull made no ground at all). Always 0
   * when `contact` is false.
   */
  headOn: number;
}

/** One attempt's outcome: cleared?, did any push move it, and the net escape. */
interface Attempt {
  cleared: boolean;
  moved: boolean;
  nx: number;
  ny: number;
}

/** Scratch accumulator for one attempt's net escape vector (allocation-free). */
const ACC = { x: 0, y: 0, moved: false };

/**
 * Resolve a candidate ship pose (after kinematics) to a valid one via the
 * rollback algorithm described in the file header. `prev` is the previous
 * tick's pose (valid by induction); `ship` holds the candidate and is mutated
 * to the final pose. `localPoly` is the ship's LOCAL silhouette
 * (hullSilhouette(id)); `scratch` is reused for the transformed world polygon
 * so the 20Hz loop can run allocation-light. POSITIONAL ONLY — feed the result
 * to `applyGroundingDamp` for the speed response (both sides do, so they
 * cannot diverge).
 */
export function resolveShipPose(
  prev: Pose,
  ship: ShipState,
  islands: readonly Island[],
  mapRadius: number,
  localPoly: readonly Vec2[],
  scratch: Vec2[] = [],
): ShipPoseResult {
  const polyMax = polygonMaxRadius(localPoly);
  const bx = ship.x;
  const by = ship.y;

  // (i) candidate pose. A pure boundary press clears here having moved nothing
  //     through the island push-out, so it reports no contact.
  let r = attemptClear(ship, bx, by, ship.heading, islands, mapRadius, localPoly, polyMax, scratch);
  if (r.cleared) return landContact(ship, r, false);

  // (ii) candidate position, previous heading — rudder blocked by rock.
  r = attemptClear(ship, bx, by, prev.heading, islands, mapRadius, localPoly, polyMax, scratch);
  if (r.cleared) return landContact(ship, r, true);

  // (iii) full revert to the previous valid pose: no ground made at all.
  ship.x = prev.x;
  ship.y = prev.y;
  ship.heading = prev.heading;
  return { contact: true, headOn: 1 };
}

/**
 * Speed response to a resolved tick (Eric ruling 2026-08-06 — see the file
 * header for why this is a CAP and not a per-tick multiplier). Under land
 * contact the hull's speed is capped at `maxSpeed × (1 − headOn × (1 −
 * islandSpeedMult))`: untouched at a graze, `islandSpeedMult × maxSpeed` at a
 * dead-on ram. `maxSpeed` is the hull's RATED effective max (the server's
 * `ship.stats.kinematics.maxSpeed`, the predictor's `this.kin.maxSpeed`) —
 * deliberately NOT the per-tick boosted/slowed value, so both sides read the
 * identical number without threading per-tick kinematics into a second pass.
 * Never raises speed; sign (astern) is preserved.
 */
export function applyGroundingDamp(ship: ShipState, res: ShipPoseResult, maxSpeed: number): void {
  if (!res.contact || res.headOn <= 0) return;
  const cap = maxSpeed * groundingSpeedFactor(res.headOn);
  if (ship.speed > cap) ship.speed = cap;
  else if (ship.speed < -cap) ship.speed = -cap;
}

/** Fraction of rated max speed a contact of this head-on-ness still allows. */
export function groundingSpeedFactor(headOn: number): number {
  const k = clamp01(headOn);
  return 1 - k * (1 - CONFIG.ship.islandSpeedMult);
}

function clamp01(v: number): number {
  if (!(v > 0)) return 0; // also catches NaN
  return v > 1 ? 1 : v;
}

/** Map a CLEARED attempt to its result; `forced` marks the rudder-blocked branch. */
function landContact(ship: ShipState, r: Attempt, forced: boolean): ShipPoseResult {
  if (!r.moved) return { contact: forced, headOn: 0 };
  return { contact: true, headOn: headOnness(ship, r.nx, r.ny) };
}

/**
 * How square the hull's travel was to the obstacle: the cosine between its
 * direction of motion (heading, negated when making sternway) and the INWARD
 * direction of the net escape vector, clamped to [0, 1]. Driving straight at
 * the rock → 1; sliding along it → 0; backing away → 0.
 */
function headOnness(ship: ShipState, nx: number, ny: number): number {
  const len = Math.hypot(nx, ny);
  if (len === 0 || ship.speed === 0) return 0;
  const dir = ship.speed < 0 ? -1 : 1;
  const mx = Math.cos(ship.heading) * dir;
  const my = Math.sin(ship.heading) * dir;
  return clamp01(-(mx * nx + my * ny) / len);
}

/**
 * Place the ship at (baseX, baseY, heading), clamp it to the map edge for THAT
 * heading, push it out of every island for up to MAX_PASSES, and report
 * whether the resulting pose is clear (overlap-free and inside the boundary),
 * whether any push moved it, and the net escape vector those pushes applied.
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
): Attempt {
  ship.x = baseX;
  ship.y = baseY;
  ship.heading = heading;
  clampCenter(ship, mapRadius, localPoly);
  const world = transformPolygon(localPoly, ship.x, ship.y, heading, scratch);
  pushClear(ship, world, islands, polyMax);
  const cleared =
    !overlapsAny(ship, world, islands, polyMax) && withinBoundary(ship, mapRadius, localPoly);
  return { cleared, moved: ACC.moved, nx: ACC.x, ny: ACC.y };
}

/** Up to MAX_PASSES sweeps pushing the hull out of every island, accumulating
 *  the net escape vector into ACC (read straight back by attemptClear). */
function pushClear(ship: ShipState, world: Vec2[], islands: readonly Island[], polyMax: number): void {
  ACC.x = 0;
  ACC.y = 0;
  ACC.moved = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let any = false;
    for (const isle of islands) {
      if (pushOutOf(ship, world, isle, polyMax)) any = true;
    }
    if (!any) break;
    ACC.moved = true;
  }
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

/**
 * Max center distance from the map centre at which the WHOLE hull still fits
 * inside the map circle at this pose — exact, from the silhouette and the
 * outward radial (ship.x/d, ship.y/d). One pass over ~8-17 verts, which is
 * what keeps the heading-aware boundary affordable per ship per tick.
 */
function boundaryLimit(ship: ShipState, mapRadius: number, localPoly: readonly Vec2[], d: number): number {
  return polygonFitLimit(localPoly, ship.heading, ship.x / d, ship.y / d, mapRadius);
}

/** True iff the whole silhouette fits inside the map circle at this pose. */
function withinBoundary(ship: ShipState, mapRadius: number, localPoly: readonly Vec2[]): boolean {
  const d = Math.hypot(ship.x, ship.y);
  if (d === 0) return true;
  return d <= boundaryLimit(ship, mapRadius, localPoly, d) + PUSH_EPS;
}

/**
 * Clamp the center along the radial so the hull's actual extent TOWARD THE
 * EDGE just touches it — heading-aware, so a hull running parallel to the
 * boundary is stopped by its beam and a hull driving at it by its bow, instead
 * of both being stopped by the worst-case bounding radius. Scaling along the
 * radial leaves the radial direction (and hence the extent) unchanged, so one
 * pass is exact. Never reported as grounding.
 */
function clampCenter(ship: ShipState, mapRadius: number, localPoly: readonly Vec2[]): void {
  const d = Math.hypot(ship.x, ship.y);
  if (d === 0) return;
  const limit = boundaryLimit(ship, mapRadius, localPoly, d);
  if (d <= limit) return;
  const scale = limit / d;
  ship.x *= scale;
  ship.y *= scale;
}

/**
 * Push the ship's world polygon (and center) out of one island polygon.
 * Positional only; returns true when an overlap was corrected.
 *
 * Direction: the NEAREST-BOUNDARY normal — toward the closest coastline point
 * from inside the polygon, away from it from outside (island.ts coastNormal).
 * The cycle-59 successor of the retired skeleton normal: the generator's
 * ~4.9u minimum local feature size keeps this a safe aim, and the caller's
 * rollback ladder absorbs the vanishing residual where it is not.
 *
 * Distance: the minimal translation along that normal that clears the island
 * (bisection on the exact overlap test), capped at the strict upper bound on
 * true penetration `isle.r + polyMax − dist(center, bounding centre)` — the
 * polygon analogue of the old circle cap: separating the bounding circles
 * certainly separates the polygons, and the bound is > 0 whenever the shapes
 * overlap. No single pass can teleport the hull.
 *
 * When NO translation along the normal clears the island — a hull wedged
 * between the two arms of one bay, where pushing off one arm presses into the
 * other — nothing is applied and the overlap is left for the caller's
 * ROLLBACK ladder (the previous pose is valid by induction, so the hull
 * simply stops, headOn = 1). The retired star-shape era instead applied the
 * FULL cap here and re-aimed next pass, which was safe when every escape ray
 * was structurally valid; on real hook/bay topology it accepted a cleared
 * pose ~190u away — a teleport straight across the landmass (measured by the
 * ram-and-escape suite). Failing into the rollback is the behavior the
 * anti-teleport bound actually promises.
 */
function pushOutOf(ship: ShipState, world: Vec2[], isle: Island, polyMax: number): boolean {
  const dc = Math.hypot(ship.x - isle.x, ship.y - isle.y);
  if (dc > polyMax + isle.r) return false; // bounding-circle broadphase
  if (!hullOverlapsIsland(world, 0, 0, isle)) return false;

  const { nx, ny } = coastNormal(ship, isle);
  const cap = isle.r + polyMax - dc;
  const clearing = escapeDepth(world, isle, nx, ny, cap);
  if (clearing === null) return true; // wedged: leave it to the rollback ladder
  const depth = clearing + PUSH_EPS;
  ACC.x += nx * depth;
  ACC.y += ny * depth;
  ship.x += nx * depth;
  ship.y += ny * depth;
  for (const p of world) {
    p.x += nx * depth;
    p.y += ny * depth;
  }
  return true;
}

/** First bracket step of the exponential clearing search (u) — comfortably
 *  below any real single-tick penetration, so the common case costs one
 *  overlap test more than plain bisection did. */
const ESCAPE_STEP = 0.5;

/**
 * Minimal translation along (nx, ny), within [0, cap], that clears the hull
 * of the island (the hull is KNOWN to overlap at 0). Returns null when no
 * translation up to `cap` clears: the caller falls through to the rollback
 * ladder rather than teleporting.
 *
 * EXPONENTIAL BRACKET, then bisection — not plain bisection over [0, cap].
 * Plain bisection assumes overlap is monotone along the push direction, which
 * the retired star-shape invariant used to guarantee; on a real hook island a
 * hull in a bay sees overlap-clear-overlap-clear along the normal (the far
 * arm), the cap/2 midpoint lands on a far overlap, and bisection converges to
 * a crossing on the island's FAR SIDE — a "minimal" push of ~190u straight
 * across the landmass (measured by the ram-and-escape suite). Doubling a
 * bracket from ESCAPE_STEP finds the FIRST clear translation instead, so the
 * result is within 2x of the true penetration; the interior of the final
 * bracket spans [pen, 2·pen] and cannot skip past an arm.
 */
function escapeDepth(
  world: readonly Vec2[],
  isle: Island,
  nx: number,
  ny: number,
  cap: number,
): number | null {
  let lo = 0;
  let hi = ESCAPE_STEP;
  while (hi < cap && hullOverlapsIsland(world, nx * hi, ny * hi, isle)) {
    lo = hi;
    hi *= 2;
  }
  if (hi >= cap) {
    if (hullOverlapsIsland(world, nx * cap, ny * cap, isle)) return null;
    hi = cap;
  }
  while (hi - lo > DEPTH_TOL) {
    const mid = (lo + hi) / 2;
    if (hullOverlapsIsland(world, nx * mid, ny * mid, isle)) lo = mid;
    else hi = mid;
  }
  return hi;
}
