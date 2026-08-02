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
  hullClearOffset as sharedHullClearOffset,
  muzzleSpawn as sharedMuzzleSpawn,
  type ShellState,
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
  /** Server-internal star-shell tag (Story 1.7): a burst also spawns a lit
   *  zone (see ShellState.lit). Only fireStarShell sets it; never on the wire. */
  lit?: { radius: number; durationMs: number };
  /** PLUNGING FIRE doctrine (Story 2.8): the shell overflies islands AND hulls
   *  and always bursts at its target (ShellState.arcing). Never on the wire. */
  arcing?: true;
  /** ARMOR-PIERCING doctrine (Story 2.8): the multi-hull pierce bookkeeping
   *  (ShellState.pierce — remaining count + hit ids). Never on the wire. */
  pierce?: { remaining: number; hitIds: string[] };
  /** ACOUSTIC HOMING doctrine (Story 2.8): the per-tick steering params
   *  (ShellState.homing — turn rate + acquire range). Never on the wire. */
  homing?: { turnRate: number; acquireRange: number };
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
  // The optional doctrine tags are set only when the caller carries one (never
  // an explicit `undefined` key — the shape stays clean for plain projectiles).
  if (p.lit) shell.lit = p.lit;
  if (p.arcing) shell.arcing = p.arcing;
  if (p.pierce) shell.pierce = p.pierce;
  if (p.homing) shell.homing = p.homing;
  return shell;
}
