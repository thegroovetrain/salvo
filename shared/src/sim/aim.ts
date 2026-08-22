// AIM GEOMETRY — the shared truth about where a shot STARTS and where it ENDS.
//
// Every function here was PROMOTED verbatim out of the server's equipment rows
// (equipment/ballistics.ts hullClearOffset/muzzleSpawn, equipment/guns.ts
// clampInsideMap/burstPointAlong/muzzleOrTarget) so the
// CLIENT can compute the
// exact same points for its ordnance aim previews. Behavior is byte-identical
// — the server rows now re-import these and keep only their ShipRecord-shaped
// wrappers, which is what makes "the preview circle IS where the shell bursts"
// a structural guarantee instead of a promise.
//
// Pure over plain data (a pose + a hull id + numbers), zero I/O, no ShipRecord:
// the client has a predicted pose and its own effectiveStats, and that is all
// these need. Nothing here reads CONFIG for a BOON-SCALABLE value — every
// range/radius arrives as an argument from the caller's effectiveStats().

import { CONFIG, hullEnvelope, type HullId } from '../constants.js';
import { wrapAngle } from '../math/angle.js';
import { pointInCircle, segCircleExit } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { pointInIsland } from './island.js';
import { hullSilhouette, polygonMaxRadius, segPolygonHit, transformPolygon } from './silhouette.js';
import { straddleOffsets } from './spread.js';

/** The minimum a firing pose needs to be: world position + heading. */
export interface AimPose {
  x: number;
  y: number;
  heading: number;
}

// BARREL_FAN_STEP_RAD (the 3° angular step between adjacent shells of a
// multi-barrel fan) is RETIRED — Story 7-5 wave 2, R2.16: BARREL's extra shells
// fly on PARALLEL TRACKS now, not a spreading fan, so an angular step is the
// wrong shape entirely. Its replacement is CONFIG.gun.barrelSpacingU (a LATERAL
// distance) resolved through sim/spread.ts parallelOffsets, which both sides
// call for the same reason this constant was shared: the aim preview draws one
// line + one burst circle PER BARREL and must place them identically.

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
 * The clicked burst point for ANY point-burst system (gun / broadside / star
 * shells), generalized over an explicit bearing so a multi-shell volley can aim
 * each shell at its OWN range-preserved point:
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

/** deg -> rad — CONFIG.broadside's arc fields are authored in degrees. SAME
 *  ASSOCIATION as sim/arcs.ts's `deg` (`(d * PI) / 180`), so a mount bearing
 *  and the twin-sector gate land on identical doubles. */
const degToRad = (d: number): number => (d * Math.PI) / 180;

/**
 * THE BROADSIDE TURRETS' MOUNT BEARINGS (Eric ruling 2026-08-20) — each turret
 * owns a FIRING ARC of its own: this mount bearing ± the traverse half-angle
 * (`EffectiveStats.broadside.traverseRad`). The mounts are straddled across
 * ±`CONFIG.broadside.turretMountSpreadDeg` about the firing beam by the SAME
 * straddle law that spaces the muzzles, so together the battery covers the
 * whole ±60° sector while each gun stays individually narrow.
 *
 * INDEX-PAIRED WITH `turretMuzzles`, AND UNCROSSED — the bow-most muzzle gets
 * the bow-most mount. The pairing falls out of one sign identity: muzzle `i`
 * sits at `-side × d_i` along the heading, and the world mount is
 * `heading + side × (arcOffset + side × m_i)` = `heading + side·arcOffset +
 * m_i` — the side factors cancel, so BOTH arrays read the same ascending
 * straddle and no per-side branch exists to get wrong. Uncrossed matters
 * beyond tidiness: it is what makes parallax work AGAINST convergence up
 * close (a near click overshoots each gun's own arc) and FOR it near max
 * range, which is the whole "rare without upgrades, close to max range"
 * mechanism.
 *
 * The mount spread is FIXED as `count` grows (the turretSpanFactor rule
 * applied to bearings): extra turrets densify the same covered sector, so
 * more guns bear on any given click — never a wider battery.
 */
export function turretMountBearings(heading: number, count: number, side: 1 | -1): number[] {
  const n = Math.max(0, Math.floor(count));
  const spread = degToRad(CONFIG.broadside.turretMountSpreadDeg);
  const step = n > 1 ? (2 * spread) / (n - 1) : 0;
  const beam = heading + side * degToRad(CONFIG.broadside.arcOffsetDeg);
  return straddleOffsets(n, step).map((m) => beam + m);
}

/** One turret's resolved shot: where it fires FROM, where its shell BURSTS,
 *  and whether its own arc bears on the click (target === the click exactly). */
export interface TurretAim {
  muzzle: Vec2;
  target: Vec2;
  onClick: boolean;
}

/**
 * THE BROADSIDE BARRAGE'S AIM SOLUTION — the ONE answer both sides read
 * (Eric ruling 2026-08-20, replacing the designed fan of R2.3).
 *
 * Every turret fires AS CLOSE TO THE CLICK AS ITS OWN ARC ALLOWS: if the
 * bearing from THAT turret's muzzle to the click lies inside its arc
 * (`turretMountBearings[i] ± traverseRad`) it fires EXACTLY at the click —
 * the returned target IS the click point, byte-identical, so "one shell will
 * absolutely hit at the target point" holds for every gun that bears.
 * Otherwise it fires at its arc LIMIT, still at the click's RANGE (measured
 * muzzle→click), so the pattern stays an arc at constant radius rather than a
 * cone — and the spread of a salvo is EMERGENT geometry, not a designed fan.
 *
 * The bearing test is PARALLAX-TRUE — measured from each muzzle, never the
 * ship centre. That is the mechanism, not a nicety: muzzle→click bearings
 * differ by ~atan(hullOffset/R), so a distant click can sit in every arc at
 * once while a close one overshoots them all, which is exactly Eric's
 * "convergence is very rare without upgrades and aiming close to max range".
 * BROADSIDE SPREAD widens `traverseRad`, bringing more guns onto a click.
 *
 * `click` MUST arrive already range- and map-clamped (`burstPointAlong`) —
 * both callers do exactly that. A clamped limit shot takes the same
 * `clampInsideMap` pull-back the click itself took, so a limit target swung
 * off the water disk still bursts in-bounds (an off-disk target expires with
 * no burst); an on-click target is inside the disk by contract and the clamp
 * is a no-op on it. It is a FUNCTION rather than two agreeing call sites
 * because the previewed circle IS where the shell bursts: the server's
 * `broadsideAim` and the client's `broadsidePreview` both call this and
 * cannot diverge. COVERAGE GUARANTEE (pinned in aim.test.ts): mountSpread +
 * base traverse ≥ the ±60° sector, so any legal click beyond point-blank
 * water has at least one gun ON it.
 *
 * Degenerate click on a muzzle: distance 0 — the shell "flies" nowhere and
 * bursts at the click; onClick by construction.
 */
export function turretAimPoints(
  pose: AimPose,
  hullId: HullId,
  count: number,
  side: 1 | -1,
  click: Vec2,
  traverseRad: number,
  mapRadius: number,
): TurretAim[] {
  const mounts = turretMountBearings(pose.heading, count, side);
  return turretMuzzles(pose, hullId, count, side).map((muzzle, i) => {
    const dx = click.x - muzzle.x;
    const dy = click.y - muzzle.y;
    const off = wrapAngle(Math.atan2(dy, dx) - mounts[i]);
    if (Math.abs(off) <= traverseRad || (dx === 0 && dy === 0)) {
      return { muzzle, target: { x: click.x, y: click.y }, onClick: true };
    }
    const dir = mounts[i] + Math.sign(off) * traverseRad;
    const dist = Math.hypot(dx, dy);
    const limit = { x: muzzle.x + Math.cos(dir) * dist, y: muzzle.y + Math.sin(dir) * dist };
    return { muzzle, target: clampInsideMap(muzzle, limit, mapRadius), onClick: false };
  });
}

/**
 * THE BROADSIDE BATTERY'S MUZZLE POINTS — `count` SEPARATE, EVENLY-SPACED guns
 * along the hull's fore-aft axis, on the firing beam (Eric's correction
 * 2026-08-19: *"You currently have every cannon firing from the same point on
 * the side of the ship, but this is wrong. It is supposed to be three separate,
 * evenly-spaced points on the ship that they fire from. When you get an extra
 * turret, this is represented as the three evenly-spaced points changing to
 * four or five."*).
 *
 * MORE GUNS, NOT A LONGER SHIP. The battery spans a FIXED
 * `hull.length × CONFIG.broadside.turretSpanFactor` whatever `count` is, so
 * BROADSIDE TURRETS re-spaces the SAME midship section into 5 then 6 points
 * (from the base 4) — tighter spacing, never a longer line of guns.
 *
 * The along-hull distribution is the SAME straddle law the muzzle positions use
 * (`sim/spread.ts straddleOffsets`), not new spacing maths: an odd count puts
 * one turret exactly amidships (offset 0) and an even count straddles midships
 * with none on it, falling out of the formula rather than being special-cased
 * per turret count. Each muzzle is then pushed out to the half-BEAM on the
 * firing side, so it sits on the hull's edge rather than its centreline — at or
 * outside the silhouette everywhere, since `hull.beam` IS the silhouette's
 * maximum beam.
 *
 * `side` is `twinSectorSide`'s answer (sim/arcs.ts) and MUST NOT be re-derived
 * by a caller: `+1` is the `heading + offset` beam, the direction
 * `(-sin heading, cos heading)`.
 *
 * ORDER MATCHES `turretMountBearings` INDEX FOR INDEX, and that is the whole
 * point of returning an ordered array: turret `i` fires from muzzle `i` inside
 * arc `i`, so the pairing lives HERE (one function, both sides) instead of in
 * two call sites that could zip them differently. The along-hull offset
 * carries a `-side` factor so the same ascending straddle reads UNCROSSED on
 * both beams — the bow-most muzzle pairs with the bow-most mount (see
 * turretMountBearings for why the side factors cancel).
 *
 * Pure over a pose + a hull id + a count + a side. It reads CONFIG only for
 * `turretSpanFactor`, which no boon scales (BROADSIDE TURRETS moves the COUNT,
 * which is an argument); the boon-scalable turret count arrives from the
 * caller's `effectiveStats().broadside.turrets`, never from CONFIG.
 */
export function turretMuzzles(pose: AimPose, hullId: HullId, count: number, side: 1 | -1): Vec2[] {
  const { length, beam } = hullEnvelope(hullId).hull;
  const n = Math.max(0, Math.floor(count));
  const span = length * CONFIG.broadside.turretSpanFactor;
  const step = n > 1 ? span / (n - 1) : 0;
  const fx = Math.cos(pose.heading);
  const fy = Math.sin(pose.heading);
  // The firing beam's unit normal, already scaled to the half-beam.
  const bx = -fy * side * (beam / 2);
  const by = fx * side * (beam / 2);
  return straddleOffsets(n, step).map((d) => ({
    x: pose.x + fx * -side * d + bx,
    y: pose.y + fy * -side * d + by,
  }));
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

/**
 * Is a placement/drop point ILLEGAL water (Story 1.10 'blocked')? True when the
 * point lands on any island's LAND (inside its coastline polygon) or outside
 * the water disk. The mine AND radar-buoy rows refuse a blocked point WITHOUT
 * consuming anything, so the client's mine-placement preview reads the SAME
 * predicate to draw its blocked tell — promoted here (from equipment/mines.ts
 * dropBlocked) so the two can never disagree about which water is legal.
 * Islands go through the island.ts seam (bounding-circle broadphase, then the
 * exact polygon test); the WATER DISK stays a circle — the map edge is not a
 * polygon and never becomes one.
 */
export function blockedWater(p: Vec2, islands: readonly Island[], mapRadius: number): boolean {
  if (!pointInCircle(p, MAP_ORIGIN, mapRadius)) return true; // off the water disk
  for (const isle of islands) {
    if (pointInIsland(p, isle)) return true; // on the rock
  }
  return false;
}

/**
 * A LIVE lit zone the FIRING player OWNS, reduced to the only three numbers the
 * gun-reach gate reads: centre + lit radius. Deliberately NOT `LitZoneView` /
 * the server's `LitZone` — the predicate must not be able to see an owner id,
 * an expiry, or a doctrine flag, because BOTH halves of "own" and "live" are
 * the CALLER's to enforce when it builds this list (the World filters its zone
 * store on the activating ship's id + `now`; the client's
 * render/litZones.ts `ownActiveZones` filters `by === ownId && until >
 * serverNow`). An enemy's flare can therefore never reach this function at all,
 * which is what makes "own flares only" structural rather than a check someone
 * could forget.
 */
export interface LitCircle {
  x: number;
  y: number;
  r: number;
}

/**
 * Pure: does `p` lie inside ANY of the supplied lit zones? INCLUSIVE
 * (`d² ≤ r²`, via the shared `pointInCircle` primitive rather than a
 * hand-rolled distance test) because this is half of a server-authoritative
 * legality gate: if the two sides disagreed on the rim case the client's aim
 * preview would lie about a shot the player is about to take.
 *
 * The same centre-distance test the World's `markZoneEffects` uses, so the
 * water a flare licenses you to shoot into is exactly the water it burns and
 * blinds in.
 */
export function pointInLitZone(p: Vec2, zones: readonly LitCircle[]): boolean {
  for (const z of zones) {
    if (pointInCircle(p, z, z.r)) return true;
  }
  return false;
}

/**
 * THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15) — ONE derivation, both
 * sides. A gun click normally clamps to the ship's effective `gun.rangeU`; a
 * click whose BURST POINT lies inside a LIVE lit zone the CLICKING player owns
 * is legal past it, and the shell flies the whole way. You can shell what your
 * own flare is lighting.
 *
 * PROMOTED into `shared/` (Story 7-5 wave 2 cleanup) because it had been
 * implemented twice — the server's legality gate and the client's aim preview —
 * agreeing only because an agent mirrored one into the other. That is exactly
 * the desync class `effectiveStats()` and `sim/spread.ts` exist to prevent, and
 * the same promotion `blockedWater` (above) already made: the server owns the
 * ANSWER, but there is now only one function that can produce it, so the
 * previewed reach IS the reach the shot gets.
 *
 * Every clause here is load-bearing and none of them may be "improved" in
 * passing:
 *  - GUN ONLY. Callers gate on the equipment id before calling; no other row
 *    reaches for this. The broadside's 5/8 rung is a weapon identity, not a
 *    horizon; a torpedo runs to the map edge; the star shell keeps its own
 *    range.
 *  - OWN FLARES ONLY — enforced by construction in `ownLitZones` (see
 *    LitCircle). An enemy's flare over your target lights the water for THEM.
 *  - `!(aimDist > baseRangeU)` rather than `aimDist <= baseRangeU`: deliberately
 *    NaN-SAFE, so a NaN-ish click takes the unchanged-range branch. Keep the
 *    branch shape.
 *  - The point tested is the MAP-CLAMPED burst point, never the raw cursor.
 *    They differ at the rim, and testing the cursor would license a burst
 *    outside the map on exactly the clicks a player makes when pinned against
 *    the boundary.
 *  - The clamp only ever LIFTS to the click's own distance, never past it.
 *
 * An in-range click early-outs before any zone is visited or any geometry is
 * computed, so the ordinary shot is byte-identical to the pre-R2.15 path.
 * `baseRangeU` arrives from the caller's `effectiveStats().gun.rangeU` — this
 * module never reads CONFIG for a boon-scalable value.
 */
export function gunReachU(
  center: Vec2,
  aim: number,
  aimDist: number,
  baseRangeU: number,
  mapRadius: number,
  ownLitZones: readonly LitCircle[],
): number {
  if (!(aimDist > baseRangeU)) return baseRangeU; // in range (or a NaN-ish click)
  const far = burstPointAlong(center, aimDist, mapRadius, aimDist, aim);
  return pointInLitZone(far, ownLitZones) ? aimDist : baseRangeU;
}

/** Where a TORPEDO leaves the tube: the bow-clear offset along its launch
 *  bearing (the makeBallistic spawn rule for a projectile with no explicit
 *  `origin` — hullClearOffset with hitRadius + spawnClearance). */
export function torpedoSpawn(pose: AimPose, hullLength: number, dir: number): Vec2 {
  const off = hullClearOffset(hullLength, CONFIG.torpedo.hitRadius + CONFIG.torpedo.spawnClearance);
  return { x: pose.x + Math.cos(dir) * off, y: pose.y + Math.sin(dir) * off };
}
