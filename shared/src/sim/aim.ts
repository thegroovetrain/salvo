// AIM GEOMETRY — the shared truth about where a shot STARTS and where it ENDS.
//
// Every function here was PROMOTED verbatim out of the server's equipment rows
// (equipment/ballistics.ts hullClearOffset/muzzleSpawn, equipment/guns.ts
// clampInsideMap/burstPointAlong/muzzleOrTarget/BARREL_FAN_STEP_RAD,
// equipment/torpedoes.ts minCommandDistance) so the CLIENT can compute the
// exact same points for its ordnance aim previews. Behavior is byte-identical
// — the server rows now re-import these and keep only their ShipRecord-shaped
// wrappers, which is what makes "the preview circle IS where the shell bursts"
// a structural guarantee instead of a promise.
//
// Pure over plain data (a pose + a hull id + numbers), zero I/O, no ShipRecord:
// the client has a predicted pose and its own effectiveStats, and that is all
// these need. Nothing here reads CONFIG for a BOON-SCALABLE value — every
// range/radius arrives as an argument from the caller's effectiveStats().

import { CONFIG, type HullId } from '../constants.js';
import { pointInCircle, segCircleExit } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';
import type { Circle } from '../types.js';
import { hullSilhouette, polygonMaxRadius, segPolygonHit, transformPolygon } from './silhouette.js';

/** The minimum a firing pose needs to be: world position + heading. */
export interface AimPose {
  x: number;
  y: number;
  heading: number;
}

/**
 * rad — the fixed angular spread between ADJACENT shells of a multi-barrel fan
 * (Story 2.8, TWIN/TRIPLE MOUNT). DRAFT HANDWAVE (implementer-drafted; 2.10's
 * evidence pass may promote/tune it): 3° reads as a volley at typical gun
 * ranges without shotgunning the blast. Shared because the aim preview draws
 * one line + one burst circle PER BARREL and must fan them identically.
 */
export const BARREL_FAN_STEP_RAD = (3 * Math.PI) / 180;

/**
 * Hull-clearing spawn offset: half the FIRER'S hull length (per hull envelope)
 * plus `extra` so the spawned entity starts OUTSIDE the firer's own silhouette
 * polygon. length/2 is EXACT at the bow tip (origin-centered, bow along +x),
 * but it is NOT the maximal hull reach on every bearing: the silhouette's stern
 * corners exceed length/2 (the battleship reaches ≈62.29u at ~5.5° off dead
 * astern vs its 62u half-length). That is safe for the CURRENT users —
 * torpedoes launch off the bow (never near the stern corners) and mines are
 * owner-immune so a stern-drop that starts a hair inside the transom can never
 * self-trigger; the 360° gun uses muzzleSpawn below instead. `extra` is
 * normally the projectile/trigger radius; callers that want genuine margin fold
 * it into `extra` (see fireTorpedo's spawnClearance). Owner immunity is
 * permanent, so no grace is involved.
 */
export function hullClearOffset(hullLength: number, extra: number): number {
  return hullLength / 2 + extra;
}

/**
 * Hull-SILHOUETTE muzzle spawn (Eric ruling 2026-07-21 — no dead ring): the
 * point where a ray from the ship CENTER along bearing `dir` crosses the
 * ship's own transformed silhouette boundary, pushed `clearance` further out
 * along the bearing. Built entirely from the shared silhouette helpers: cast
 * INWARD from a point guaranteed outside the hull (polygonMaxRadius +
 * clearance + 1) toward the center — the earliest inbound segPolygonHit at
 * `clearance` radius is the boundary crossing nearest the outside on that
 * bearing. On a concave bearing whose open cavity admits the projectile
 * radius (the mineLayer transom notch, dead astern), that crossing is the
 * cavity's inner wall: the shell legitimately spawns INSIDE the open notch —
 * still outside the silhouette polygon — and flies out through it. Gun shells
 * use this on every bearing (360° gun); torpedoes/mines keep the
 * hullClearOffset bow/astern rules above.
 */
export function muzzleSpawn(pose: AimPose, hullId: HullId, dir: number, clearance: number): Vec2 {
  const local = hullSilhouette(hullId);
  const poly = transformPolygon(local, pose.x, pose.y, pose.heading);
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  const far = polygonMaxRadius(local) + clearance + 1;
  const outer: Vec2 = { x: pose.x + ux * far, y: pose.y + uy * far };
  // The inbound segment ends at the ship center (inside the silhouette), so a
  // hit always exists; `?? 0` is an unreachable fail-safe (spawn at `outer`)
  // rather than a crash in the middle of a tick.
  const s = segPolygonHit(outer, pose, poly, clearance) ?? 0;
  return {
    x: outer.x + (pose.x - outer.x) * s + ux * clearance,
    y: outer.y + (pose.y - outer.y) * s + uy * clearance,
  };
}

/** The water disk is centered at the world origin (the boundary clamp too). */
const MAP_ORIGIN: Vec2 = { x: 0, y: 0 };
/** Keep a clamped burst point this far inside the water disk (u) so a rim shot
 *  bursts at a legitimate in-water point rather than expiring at the map edge. */
const MAP_EDGE_EPSILON = 1;

/**
 * Pull `target` back inside the water disk along the center→target ray: if that
 * segment exits the map circle, clamp to the exit crossing minus a small
 * epsilon. Built on the shared segCircleExit primitive — no hand-rolled root
 * solving. A target already inside the disk is returned unchanged. Guards a rim
 * ship firing outward: a map-edge crossing must not beat the burst at an
 * otherwise in-range point (the shell would silently expire at the edge).
 */
export function clampInsideMap(center: Vec2, target: Vec2, mapRadius: number): Vec2 {
  const t = segCircleExit(center, target, MAP_ORIGIN, mapRadius);
  if (t === null) return target; // the ray never leaves the disk
  // Defense-in-depth (unreachable for a live ship — the boundary clamp keeps
  // every center polyMax inside the rim): a degenerate exit at the segment
  // start would collapse the target onto the ship center; keep the range-
  // clamped target instead (pre-clamp behavior: the shell expires at the edge).
  if (t <= 0) return target;
  const len = Math.hypot(target.x - center.x, target.y - center.y);
  const back = len <= 0 ? 0 : Math.max(0, t - MAP_EDGE_EPSILON / len);
  return { x: center.x + (target.x - center.x) * back, y: center.y + (target.y - center.y) * back };
}

/**
 * The clicked burst point for ANY point-burst system (gun / cannon / star
 * shells / a command-detonation fish), generalized over an explicit bearing so
 * the multi-barrel fan can aim each shell at its OWN range-preserved point:
 * along `dir` at the clicked distance `aimDist`, clamped to the system's
 * EFFECTIVE max range `rangeU` AND to the water disk (an in-range rim shot
 * still bursts in-bounds instead of expiring at the map edge). BOTH distances
 * are measured from the ship CENTER.
 *
 * `minU` is an optional MINIMUM commanded distance (COMMAND DETONATION clamps
 * the point out past its own spawn clearance so a point-blank click can never
 * sit BEHIND the launched fish); it wins over `rangeU` in the degenerate
 * minU > rangeU case, and 0 (the default) is the historical clamp
 * byte-for-byte.
 */
export function burstPointAlong(
  center: Vec2,
  aimDist: number,
  mapRadius: number,
  rangeU: number,
  dir: number,
  minU = 0,
): Vec2 {
  const dist = Math.min(Math.max(aimDist, minU), Math.max(rangeU, minU));
  const target = { x: center.x + Math.cos(dir) * dist, y: center.y + Math.sin(dir) * dist };
  return clampInsideMap(center, target, mapRadius);
}

/**
 * Where a point-burst shell spawns: normally the hull-silhouette muzzle edge
 * along the aim bearing (muzzleSpawn — no dead ring). But a point-blank click
 * INSIDE the muzzle (target no farther from the ship center than the
 * muzzle-spawn distance + shellRadius) would otherwise spawn the shell PAST its
 * own target, flying outward to a splash — a new INNER dead ring (up to ~64u on
 * a battleship bow). Spawn AT the target instead, so next tick's stepShell
 * bursts there immediately (distToTarget 0). Eric ruling 2026-07-21: no dead
 * ring, inner or outer. `shellRadius` is the firing system's collision radius.
 */
export function muzzleOrTarget(
  pose: AimPose,
  hullId: HullId,
  dir: number,
  target: Vec2,
  shellRadius: number,
): Vec2 {
  const muzzle = muzzleSpawn(pose, hullId, dir, shellRadius);
  const targetDist = Math.hypot(target.x - pose.x, target.y - pose.y);
  const muzzleDist = Math.hypot(muzzle.x - pose.x, muzzle.y - pose.y);
  return targetDist <= muzzleDist + shellRadius ? { x: target.x, y: target.y } : muzzle;
}

/** u — how far PAST the fish's own spawn point the nearest legal COMMAND
 *  DETONATION point sits (Story 2.8 review, P7). A commanded burst point
 *  inside the bow spawn clearance would lie BEHIND the just-spawned fish:
 *  distToTarget is measured forward along the track, so the fish would never
 *  reach it and would run to the map edge instead of detonating. */
const COMMAND_MIN_EPSILON = 1;

/** The nearest legal commanded burst distance from the ship CENTER: the fish's
 *  own spawn offset along the bearing (hullClearOffset with the torpedo's
 *  hitRadius + spawnClearance — exactly what makeBallistic uses) plus a small
 *  epsilon, so the burst point is always AHEAD of the spawn point. */
export function minCommandDistance(hullLength: number): number {
  return (
    hullClearOffset(hullLength, CONFIG.torpedo.hitRadius + CONFIG.torpedo.spawnClearance) +
    COMMAND_MIN_EPSILON
  );
}

/**
 * Is a placement/drop point ILLEGAL water (Story 1.10 'blocked')? True when the
 * point lands inside any island circle or outside the water disk. The mine AND
 * decoy rows refuse a blocked point WITHOUT consuming anything, so the client's
 * mine-placement preview reads the SAME predicate to draw its blocked tell —
 * promoted here (from equipment/mines.ts dropBlocked) so the two can never
 * disagree about which water is legal. Built on the shared circle primitives.
 */
export function blockedWater(p: Vec2, islands: readonly Circle[], mapRadius: number): boolean {
  if (!pointInCircle(p, MAP_ORIGIN, mapRadius)) return true; // off the water disk
  for (const isle of islands) {
    if (pointInCircle(p, isle, isle.r)) return true; // inside a rock
  }
  return false;
}

/** Where a TORPEDO leaves the tube: the bow-clear offset along its launch
 *  bearing (the makeBallistic spawn rule for a projectile with no explicit
 *  `origin` — hullClearOffset with hitRadius + spawnClearance). */
export function torpedoSpawn(pose: AimPose, hullLength: number, dir: number): Vec2 {
  const off = hullClearOffset(hullLength, CONFIG.torpedo.hitRadius + CONFIG.torpedo.spawnClearance);
  return { x: pose.x + Math.cos(dir) * off, y: pose.y + Math.sin(dir) * off };
}
