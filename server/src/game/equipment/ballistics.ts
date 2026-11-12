// Unified ballistic construction — one factory + one spawn-offset helper shared
// by every weapon that launches a ShellState (guns, torpedoes) and the mine
// drop. Guns and torpedoes differ only in speed/range/damage/collision-radius/
// grace; this collapses the old per-weapon makeShell/makeTorpedo and the three
// duplicated offset constants (MUZZLE_OFFSET/TUBE_OFFSET/DROP_OFFSET) into one
// place, per the codebase-cleanliness pass (Stage A4). Stage B re-parameterizes
// hullClearOffset on the firer's class hull length — a one-line change here.
// spawnClearance keeps a fresh projectile clear of degenerate overlap with the
// firer's own hull at spawn: `BallisticParams.spawnClearance` (torpedoes only)
// pads the offset with real margin on top of the collision radius. Owner
// immunity is now permanent (Eric ruling 2026-07-19) — own weapons never damage
// the owner — so clearance is only about clean spawn geometry, not self-hits.

import {
  clampInsideMap,
  dispersedLanding,
  dispersedPoint,
  hullClearOffset as sharedHullClearOffset,
  segCircleHit,
  muzzleSpawn as sharedMuzzleSpawn,
  type ShellFamily,
  type ShellState,
  type TargetKind,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';

/**
 * Hull-clearing spawn offset — the ShipRecord-shaped wrapper around the shared
 * `hullClearOffset` (sim/aim.ts, where the full rationale lives): half the
 * FIRER'S hull length plus `extra`, so the spawned entity starts OUTSIDE the
 * firer's own silhouette polygon. Promoted to shared so the CLIENT's ordnance
 * aim preview draws its travel lines from the exact spawn point this produces.
 */
export function hullClearOffset(ship: ShipRecord, extra: number): number {
  return sharedHullClearOffset(ship.cls.hull.length, extra);
}

/**
 * Hull-SILHOUETTE muzzle spawn (Eric ruling 2026-07-21 — no dead ring) — the
 * ShipRecord-shaped wrapper around the shared `muzzleSpawn` (sim/aim.ts, where
 * the full rationale lives). Promoted to shared for the client aim preview.
 */
export function muzzleSpawn(ship: ShipRecord, dir: number, clearance: number): Vec2 {
  return sharedMuzzleSpawn(ship.state, ship.hullId, dir, clearance);
}

/** Params that distinguish one projectile from another — flight AND hit rule
 *  (per-projectile hit rules are the Story 1.4 seam: every field lands on
 *  ShellState and stepShell resolves from the projectile, never from CONFIG). */
export interface BallisticParams {
  speed: number; // u/s
  range: number; // u — distLeft (Infinity for run-until-impact torpedoes)
  damage: number; // hp per burst victim (or per contact hit for contact-only projectiles)
  hitRadius: number; // u — collision radius added to the hull capsule
  kind: 'shell' | 'torp';
  // u — extra spawn-offset margin beyond hitRadius, on top of the firer's own
  // collision boundary. Only fireTorpedo sets this (CONFIG.torpedo.spawnClearance);
  // mines omit it and keep their existing zero-margin behavior unchanged.
  spawnClearance?: number;
  /** Explicit spawn point (the gun's silhouette-edge muzzle, see muzzleSpawn).
   *  Omitted = the legacy hullClearOffset spawn along `dir` (torpedoes). */
  origin?: Vec2;
  // The projectile's OWN hit rule, required so nothing silently borrows gun
  // values: a burst point + radius for the gun; null/0 for contact-only
  // projectiles (torpedoes pass contactDamage = damage).
  targetX: number | null; // u — burst point it flies to and stops at (null = point-less)
  targetY: number | null; // u
  burstRadius: number; // u — blast radius around the target point (0 = contact-only)
  contactDamage: number; // hp to an early interceptor outside the blast
  /** The ordnance TARGET MASK (Story 8.4, AR44), always the firing row's own
   *  `CONFIG.<ordnance>.hits`. REQUIRED like every other hit-rule field, so a
   *  new weapon cannot silently borrow the gun's answer or default to hulls. */
  hits: readonly TargetKind[];
  /** THE GUN FAMILY (Story 8.15, amendment 89(i)) — `cannon` / `mg` / `flak`
   *  for a gun-pattern shell, `null` for a torpedo. REQUIRED like `hits`, so
   *  no constructor can silently borrow the cannon's family: the ballistic
   *  signal materializes it as the shell reveal's `w`. */
  family: ShellFamily | null;
  /** DIRECT-HIT, NO BURST (Story 8.15 — the machine gun): the shell expires
   *  at its aim point with a splash instead of bursting, and a hull it strikes
   *  takes a plain contact hit (see ShellState.direct). */
  direct?: true;
  /** Server-internal MAIN-BATTERY marker (see ShellState.batteryShell). Only
   *  the main battery's salvo sets it; never on the wire. */
  batteryShell?: true;
  // `attenRangeU` (the deck-gun range-attenuation reference, Story 9.12) —
  // RETIRED 2026-11-12, Story 11.1: damage is flat with range.
  /** Server-internal star-shell tag (Story 1.7): a burst also spawns a lit
   *  zone (see ShellState.lit). Only fireStarShell sets it; never on the wire. */
  lit?: { radius: number; durationMs: number };
  /** Server-internal PHOSPHOR tag (Story 8.17): a burst — or an interception
   *  stop — also spawns a BURNING ZONE (see ShellState.burn). Only
   *  firePhosphorShell sets it; never on the wire. */
  burn?: { radius: number; durationMs: number; dps: number };
  /** Server-internal FOUL tag (Story 9.4 — the FLASH SHELLS `flash` tag's
   *  seat): a burst — or an interception stop — spawns a FOUL ZONE there (see
   *  ShellState.foul). Only the FOULING SHELL row sets it; never on the wire. */
  foul?: { radius: number; durationMs: number };
  /** Server-internal FLASH tag (Story 8.17, restored by Story 10.9 beside
   *  `foul`): a burst — or an interception stop — dazzles every non-owner
   *  hull whose centre is inside (see ShellState.flash). Only the FLASH
   *  SHELLS row sets it; never on the wire. */
  flash?: { radius: number; durationMs: number };
  /** ACOUSTIC HOMING doctrine (Story 2.8): the per-tick steering params
   *  (ShellState.homing — turn rate + acquire range). Never on the wire. */
  homing?: { turnRate: number; acquireRange: number };
}

/** One dispersed shell's flight: where it lands, the bearing it flies and how far. */
export interface DispersedFlight {
  /** The shell's own landing point (dispersed, inside the water disk). */
  landing: Vec2;
  /** rad — the bearing from its muzzle straight at its landing. */
  dir: number;
  /** u — muzzle → landing. */
  distU: number;
}

/**
 * REAL DISPERSION (Story 11.1, R5 / R8): one shell's landing — the shared
 * `dispersedLanding` from its own muzzle `origin` around its aim point
 * `aim`, from `seed` (`ActivationContext.mintShell`), kept inside the water
 * disk — and the STRAIGHT flight to it: the bearing and travel are
 * recomputed from the muzzle to the landing, so `stepShell` flies the shell
 * there with no sideways snap on arrival. A shell spawned on its landing
 * (the point-blank rule) keeps `fallbackDir`.
 */
export function dispersedFlight(origin: Vec2, aim: Vec2, seed: number, mapRadius: number, fallbackDir: number): DispersedFlight {
  const landing = dispersedLanding(origin.x, origin.y, aim.x, aim.y, seed, mapRadius);
  const dx = landing.x - origin.x;
  const dy = landing.y - origin.y;
  const distU = Math.hypot(dx, dy);
  return { landing, dir: distU > 0 ? Math.atan2(dy, dx) : fallbackDir, distU };
}

/** One main-battery shell's flight: where it spawns, where it lands, how far it flies. */
export interface SalvoShellFlight {
  /** Its spawn point — on the muzzle line, abreast of its salvo-mates (or its landing, point blank). */
  spawn: Vec2;
  /** Its own dispersed landing, inside the water disk. */
  landing: Vec2;
  /** u — spawn → landing, along the salvo bearing. */
  distU: number;
}

/** Hair inside the rim a rim-entry spawn is nudged, so it never sits ON the edge. */
const RIM_NUDGE_U = 0.01;

/**
 * A spawn on the muzzle line can fall just OUTSIDE the water disk when the firer
 * hugs the rim (`stepShell` would expire it at once). Slide it FORWARD along its
 * own track (spawn → landing, the salvo bearing) to where the track enters the
 * disk, a hair inside. `null` = the track never enters the disk.
 */
function enterMapAlongTrack(spawn: Vec2, landing: Vec2, mapRadius: number): Vec2 | null {
  if (Math.hypot(spawn.x, spawn.y) <= mapRadius) return spawn;
  const t = segCircleHit(spawn, landing, { x: 0, y: 0 }, mapRadius);
  if (t === null) return null;
  const len = Math.hypot(landing.x - spawn.x, landing.y - spawn.y);
  const k = Math.min(1, t + RIM_NUDGE_U / len);
  return { x: spawn.x + (landing.x - spawn.x) * k, y: spawn.y + (landing.y - spawn.y) * k };
}

/**
 * ONE SHELL OF A MAIN-BATTERY SALVO (Story 11.1 R13, review fix — no
 * converging tracks on the wire). The dispersion is rolled ONCE per shell
 * around the salvo `center` inside the ellipse for the STATION → CENTER range
 * (the client preview oval's range), its long axis on the salvo bearing
 * (station → center). The shell then flies PARALLEL to the salvo bearing
 * (`bearing`): its spawn is its landing projected straight back along the
 * bearing onto the MUZZLE LINE (through `muzzle` — the salvo's un-dispersed
 * origin, `turretSalvo` `shells[k].origin` — perpendicular to the bearing).
 * Every shell of a salvo therefore leaves abreast, flies on one velocity
 * direction and arrives exactly on its own landing (no sideways snap); only
 * its travel differs, by its along-shot offset. A landing on or behind the
 * muzzle line — or any shell of a POINT-BLANK salvo (`turretSalvo` puts its
 * origin on the center) — is spawned ON the landing (the `muzzleOrTarget`
 * rule). The map clamp pulls the landing back ALONG THE BEARING, so the track
 * stays parallel.
 */
export function salvoShellFlight(
  station: Vec2,
  center: Vec2,
  muzzle: Vec2,
  bearing: number,
  seed: number,
  mapRadius: number,
): SalvoShellFlight {
  const ux = Math.cos(bearing);
  const uy = Math.sin(bearing);
  const p = dispersedPoint(station.x, station.y, center.x, center.y, seed);
  const along = (p.x - muzzle.x) * ux + (p.y - muzzle.y) * uy;
  // `turretSalvo` reports a point-blank salvo by putting its origin ON the center.
  const pointBlank = muzzle.x === center.x && muzzle.y === center.y;
  if (pointBlank || !(along > 0)) {
    const landing = clampInsideMap(station, p, mapRadius);
    return { spawn: landing, landing, distU: 0 };
  }
  const spawn = enterMapAlongTrack({ x: p.x - ux * along, y: p.y - uy * along }, p, mapRadius);
  if (spawn === null) {
    // The track never enters the disk: spawn on the (clamped) landing, as point blank does.
    const landing = clampInsideMap(station, p, mapRadius);
    return { spawn: landing, landing, distU: 0 };
  }
  const landing = clampInsideMap(spawn, p, mapRadius);
  return { spawn, landing, distU: Math.hypot(landing.x - spawn.x, landing.y - spawn.y) };
}

/**
 * Build a ShellState launched from `ship` along bearing `dir`, spawned at
 * `origin` when given (gun muzzle) or hull-clear along the bearing (plus
 * `spawnClearance` when the caller sets it). Sets every ShellState field
 * explicitly (does not lean on stepShell's optional-field defaults).
 */
export function makeBallistic(
  id: string,
  ship: ShipRecord,
  dir: number,
  now: number,
  p: BallisticParams,
): ShellState {
  const off = hullClearOffset(ship, p.hitRadius + (p.spawnClearance ?? 0));
  const shell: ShellState = {
    id,
    ownerId: ship.id,
    x: p.origin ? p.origin.x : ship.state.x + Math.cos(dir) * off,
    y: p.origin ? p.origin.y : ship.state.y + Math.sin(dir) * off,
    vx: Math.cos(dir) * p.speed,
    vy: Math.sin(dir) * p.speed,
    distLeft: p.range,
    bornAt: now,
    kind: p.kind,
    damage: p.damage,
    hitRadius: p.hitRadius,
    targetX: p.targetX,
    targetY: p.targetY,
    burstRadius: p.burstRadius,
    contactDamage: p.contactDamage,
    hits: p.hits,
    family: p.family,
  };
  copyOptionalTags(shell, p);
  return shell;
}

/** The optional tags are set only when the caller carries one (never an
 *  explicit `undefined` key — the shape stays clean for plain projectiles). */
function copyOptionalTags(shell: ShellState, p: BallisticParams): void {
  if (p.direct === true) shell.direct = true;
  if (p.batteryShell === true) shell.batteryShell = true;
  if (p.lit) shell.lit = p.lit;
  if (p.burn) shell.burn = p.burn;
  if (p.foul) shell.foul = p.foul;
  if (p.flash) shell.flash = p.flash;
  if (p.homing) shell.homing = p.homing;
}
