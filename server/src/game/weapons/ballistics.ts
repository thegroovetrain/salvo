// Unified ballistic construction — one factory + one spawn-offset helper shared
// by every weapon that launches a ShellState (guns, torpedoes) and the mine
// drop. Guns and torpedoes differ only in speed/range/damage/collision-radius/
// grace; this collapses the old per-weapon makeShell/makeTorpedo and the three
// duplicated offset constants (MUZZLE_OFFSET/TUBE_OFFSET/DROP_OFFSET) into one
// place, per the codebase-cleanliness pass (Stage A4). Stage B re-parameterizes
// hullClearOffset on the firer's class hull length — a one-line change here.
// Root-cause fix (2026-07-14): the spawn offset used to be EXACTLY the firer's
// collision boundary (hull reach + projectile radius), zero margin, so a
// full-speed torpedo firer could re-close that margin before its short grace
// expired. `BallisticParams.spawnClearance` (torpedoes only) pads the offset
// with real margin on top of the collision radius; grace remains a backstop.

import { type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';

/**
 * Hull-clearing spawn offset: half the FIRER'S hull length (per class) plus
 * `extra` so the spawned entity starts OUTSIDE the firer's own capsule.
 * `extra` is normally just the projectile/trigger radius — that alone lands
 * the spawn point EXACTLY on the firer's own collision boundary, zero margin,
 * relying on the self-hit grace as the only backstop. Grace is far too short
 * (~13u at 130 u/s) to clear a battleship's 46u hull on its own, and a
 * fast-moving firer can re-close a zero-margin gap before grace expires (the
 * torpedo self-hit bug) — so callers that need real spawn margin fold it into
 * `extra` themselves (see fireTorpedo's spawnClearance). Grace still backstops
 * re-collision on the exit tick.
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
  graceMs: number; // ms — owner self-hit grace
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
    graceMs: p.graceMs,
  };
}
