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

import { type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';

/**
 * Hull-clearing spawn offset: half the FIRER'S hull length (per hull envelope)
 * plus `extra` so the spawned entity starts OUTSIDE the firer's own silhouette
 * polygon. length/2 is EXACT at the bow tip (origin-centered, bow along +x),
 * but it is NOT the maximal hull reach on every bearing: the silhouette's stern
 * corners exceed length/2 (the battleship reaches ≈62.29u at ~5.5° off dead
 * astern vs its 62u half-length). That is safe for the CURRENT equipment —
 * guns cap their arcs off the bow (never near the stern corners) and mines are
 * owner-immune so a stern-drop that starts a hair inside the transom can never
 * self-trigger. Stories 1.6–1.8 must NOT lean on length/2 as an all-bearings
 * clearance for stern-facing equipment; use polygonMaxRadius(hullSilhouette)
 * there instead. `extra` is normally the projectile/trigger radius; callers
 * that want genuine margin fold it into `extra` (see fireTorpedo's
 * spawnClearance). Owner immunity is permanent, so no grace is involved.
 */
export function hullClearOffset(ship: ShipRecord, extra: number): number {
  return ship.cls.hull.length / 2 + extra;
}

/** Params that distinguish a gun shell from a torpedo. */
export interface BallisticParams {
  speed: number; // u/s
  range: number; // u — distLeft (Infinity for run-until-impact torpedoes)
  damage: number; // hp per hull hit
  hitRadius: number; // u — collision radius added to the hull capsule
  kind: 'shell' | 'torp';
  // u — extra spawn-offset margin beyond hitRadius, on top of the firer's own
  // collision boundary. Only fireTorpedo sets this (CONFIG.torpedo.spawnClearance);
  // guns and mines omit it and keep their existing zero-margin + grace-backstop
  // behavior unchanged.
  spawnClearance?: number;
}

/**
 * Build a ShellState launched from `ship` along bearing `dir`, spawned clear of
 * the firer's hull (plus `spawnClearance` when the caller sets it). Sets every
 * ShellState field explicitly (does not lean on stepShell's optional-field
 * defaults).
 */
export function makeBallistic(
  id: string,
  ship: ShipRecord,
  dir: number,
  now: number,
  p: BallisticParams,
): ShellState {
  const off = hullClearOffset(ship, p.hitRadius + (p.spawnClearance ?? 0));
  return {
    id,
    ownerId: ship.id,
    x: ship.state.x + Math.cos(dir) * off,
    y: ship.state.y + Math.sin(dir) * off,
    vx: Math.cos(dir) * p.speed,
    vy: Math.sin(dir) * p.speed,
    distLeft: p.range,
    bornAt: now,
    kind: p.kind,
    damage: p.damage,
    hitRadius: p.hitRadius,
  };
}
