// Gun fire control — the guns WeaponSystem (step 12 moved this out of combat.ts,
// which now re-exports from here). Firing is DERIVED, not commanded (plan):
// while a ship holds `fire` with guns selected, each broadside mount puts a
// shell out iff its reload has elapsed AND the requested aim bearing falls in
// that mount's arc AND the ship is alive. No fire-rate or arc cheat is possible
// by construction. Pure over a ShipRecord's input + kinematics + per-mount
// cooldowns; the World owns shell storage + event emission.

import {
  CONFIG,
  WEAPON,
  angleDiff,
  inArc,
  wrapAngle,
  type ShellState,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { FireContext, WeaponSystem } from './index.js';

const MOUNTS = CONFIG.gun.mounts;

/** Number of gun mounts (broadside batteries). */
export const GUN_MOUNTS = MOUNTS.length;

/** Fresh per-mount cooldown state (all ready). */
export function freshGunCooldowns(): number[] {
  return MOUNTS.map(() => 0);
}

/** Tick every mount's cooldown down by `dtMs` (floored at 0). Mutates in place. */
export function tickGunCooldowns(cooldowns: number[], dtMs: number): void {
  for (let i = 0; i < cooldowns.length; i++) {
    cooldowns[i] = Math.max(0, cooldowns[i] - dtMs);
  }
}

/**
 * Clamp `angle` into the arc `[center - halfArc, center + halfArc]`. Returns the
 * nearest in-arc bearing (equal to `angle`, wrapped, when already inside).
 */
export function clampToArc(angle: number, center: number, halfArc: number): number {
  const d = angleDiff(center, angle); // shortest signed offset from center
  if (d > halfArc) return wrapAngle(center + halfArc);
  if (d < -halfArc) return wrapAngle(center - halfArc);
  return wrapAngle(angle);
}

/** Soonest-ready gun cooldown (ms) — the value surfaced in OwnShip.cooldowns[0]. */
export function soonestGunCooldown(cooldowns: number[]): number {
  return cooldowns.length === 0 ? 0 : Math.min(...cooldowns);
}

// Muzzle offset: spawn the shell forward of the hull along its bearing so it
// starts clear of the firer's own capsule (hull half-length + shell radius). The
// 100ms self-hit grace is far too short (~13u at 130 u/s) to clear a 40u hull on
// its own, so the offset is what actually prevents a broadside self-detonation;
// grace remains a backstop against re-collision on the exit tick.
const MUZZLE_OFFSET = CONFIG.ship.length / 2 + CONFIG.gun.shellRadius;

function makeShell(id: string, ship: ShipRecord, dir: number, now: number): ShellState {
  return {
    id,
    ownerId: ship.id,
    x: ship.state.x + Math.cos(dir) * MUZZLE_OFFSET,
    y: ship.state.y + Math.sin(dir) * MUZZLE_OFFSET,
    vx: Math.cos(dir) * CONFIG.gun.shellSpeed,
    vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
    distLeft: CONFIG.gun.shellRange,
    bornAt: now,
    // kind/damage/hitRadius/graceMs default to gun values in stepShell.
  };
}

/**
 * Run gun fire control for one ship this tick. Returns the shells fired (0..N,
 * one per bearing mount) and resets each firing mount's cooldown. `mkId` mints a
 * unique shell id. No-op (empty) if dead, not firing, or guns not selected.
 */
export function fireGuns(ship: ShipRecord, now: number, mkId: () => string): ShellState[] {
  if (!ship.alive || !ship.input.fire || ship.input.weapon !== WEAPON.gun) return [];
  const aim = ship.input.aim;
  const shells: ShellState[] = [];
  for (let i = 0; i < MOUNTS.length; i++) {
    if (ship.gunCooldowns[i] > 0) continue;
    const center = wrapAngle(ship.state.heading + MOUNTS[i].offset);
    if (!inArc(aim, center, MOUNTS[i].halfArc)) continue;
    const dir = clampToArc(aim, center, MOUNTS[i].halfArc);
    shells.push(makeShell(mkId(), ship, dir, now));
    ship.gunCooldowns[i] = CONFIG.gun.reload;
  }
  return shells;
}

/** The guns weapon system (WeaponId 0). */
export const gunSystem: WeaponSystem = {
  id: WEAPON.gun,
  tick(ship: ShipRecord, dtMs: number): void {
    tickGunCooldowns(ship.gunCooldowns, dtMs);
  },
  soonest(ship: ShipRecord): number {
    return soonestGunCooldown(ship.gunCooldowns);
  },
  fire(ctx: FireContext): void {
    for (const shell of fireGuns(ctx.ship, ctx.now, ctx.mkId)) ctx.spawnBallistic(shell);
  },
};
