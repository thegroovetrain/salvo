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
  hullSilhouette,
  polygonMaxRadius,
  segPolygonHit,
  transformPolygon,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';

/**
 * Hull-clearing spawn offset: half the FIRER'S hull length (per hull envelope)
 * plus `extra` so the spawned entity starts OUTSIDE the firer's own silhouette
 * polygon. length/2 is EXACT at the bow tip (origin-centered, bow along +x),
 * but it is NOT the maximal hull reach on every bearing: the silhouette's stern
 * corners exceed length/2 (the battleship reaches ≈62.29u at ~5.5° off dead
 * astern vs its 62u half-length). That is safe for the CURRENT users —
 * torpedoes launch off the bow (never near the stern corners) and mines are
 * owner-immune so a stern-drop that starts a hair inside the transom can never
 * self-trigger; the 360° gun uses muzzleSpawn below instead. Stories 1.6–1.8
 * must NOT lean on length/2 as an all-bearings
 * clearance for stern-facing equipment; use polygonMaxRadius(hullSilhouette)
 * there instead. `extra` is normally the projectile/trigger radius; callers
 * that want genuine margin fold it into `extra` (see fireTorpedo's
 * spawnClearance). Owner immunity is permanent, so no grace is involved.
 */
export function hullClearOffset(ship: ShipRecord, extra: number): number {
  return ship.cls.hull.length / 2 + extra;
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
export function muzzleSpawn(ship: ShipRecord, dir: number, clearance: number): Vec2 {
  const local = hullSilhouette(ship.hullId);
  const poly = transformPolygon(local, ship.state.x, ship.state.y, ship.state.heading);
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  const far = polygonMaxRadius(local) + clearance + 1;
  const outer: Vec2 = { x: ship.state.x + ux * far, y: ship.state.y + uy * far };
  // The inbound segment ends at the ship center (inside the silhouette), so a
  // hit always exists; `?? 0` is an unreachable fail-safe (spawn at `outer`)
  // rather than a crash in the middle of a tick.
  const s = segPolygonHit(outer, ship.state, poly, clearance) ?? 0;
  return {
    x: outer.x + (ship.state.x - outer.x) * s + ux * clearance,
    y: outer.y + (ship.state.y - outer.y) * s + uy * clearance,
  };
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
  /** Server-internal star-shell tag (Story 1.7): a burst also spawns a lit
   *  zone (see ShellState.lit). Only fireStarShell sets it; never on the wire. */
  lit?: { radius: number; durationMs: number };
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
  };
  // The star-shell tag is set only when the caller carries one (never an
  // explicit `lit: undefined` key — the shape stays clean for non-flares).
  if (p.lit) shell.lit = p.lit;
  return shell;
}
