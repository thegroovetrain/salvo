// Gun fire control — the guns WeaponSystem (step 12 moved this out of combat.ts,
// which now re-exports from here). Firing is DERIVED, not commanded (plan):
// when a click reaches a ship with guns selected (the World's fireControl
// consumes one click per fireSeq increment), ONE shell leaves the single mount
// whose arc bears on the aim, drawing one round from the shared ammo pool — iff
// the pool has a round AND a mount bears AND the ship is alive. The two mounts
// are now arc/muzzle definitions only (which side the shell exits); they share
// one pool + one reload (see weapons/ammo.ts). No fire-rate or arc cheat is
// possible by construction. Guns fire AT the aim point: the shell's range is the
// clicked distance (input.aimDist, muzzle-relative), clamped to max gun range —
// a click at/inside the own hull degenerates to a harmless splash at the muzzle
// ('expired' never routes to hitShip). Pure over a ShipRecord's input +
// kinematics + ammo pool; the World owns shell storage + event emission.

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
import { consume, tickReload } from './ammo.js';
import { hullClearOffset, makeBallistic } from './ballistics.js';

const MOUNTS = CONFIG.gun.mounts;

/** Number of gun mounts (broadside batteries). */
export const GUN_MOUNTS = MOUNTS.length;

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

/**
 * Muzzle-relative shell range for a click at `aimDist` from the ship center:
 * the shell spawns hullClearOffset out, so the click distance shrinks by that
 * offset, floored at 0 (click inside the hull = splash at the muzzle) and
 * clamped to max gun range (click beyond it = splash at max range).
 */
export function shellRangeFor(ship: ShipRecord, aimDist: number): number {
  const muzzleOffset = hullClearOffset(ship, CONFIG.gun.shellRadius);
  return Math.min(Math.max(aimDist - muzzleOffset, 0), CONFIG.gun.shellRange);
}

/**
 * Run gun fire control for one ship this tick (the World routes at most one
 * click here per fireSeq increment). Returns 0 or 1 shell: the single mount
 * whose DISJOINT arc bears on the aim fires and draws one round from the shared
 * pool. Arc-miss does NOT drain the pool (like torpedoes); an empty pool denies.
 * `mkId` mints a unique shell id. No-op (empty) if dead or guns not selected —
 * kept for direct test callers; the click gate itself lives in World.fireControl.
 */
export function fireGuns(ship: ShipRecord, now: number, mkId: () => string): ShellState[] {
  if (!ship.alive || ship.input.weapon !== WEAPON.gun) return [];
  const aim = ship.input.aim;
  const mount = MOUNTS.find((m) => inArc(aim, wrapAngle(ship.state.heading + m.offset), m.halfArc));
  if (!mount) return []; // no broadside bears — no launch, no ammo spent
  if (!consume(ship.ammo[WEAPON.gun], CONFIG.gun.reloadMs)) return []; // pool empty
  const dir = clampToArc(aim, wrapAngle(ship.state.heading + mount.offset), mount.halfArc);
  return [
    makeBallistic(mkId(), ship, dir, now, {
      speed: CONFIG.gun.shellSpeed,
      range: shellRangeFor(ship, ship.input.aimDist),
      damage: CONFIG.gun.damage,
      hitRadius: CONFIG.gun.shellRadius,
      graceMs: CONFIG.gun.selfHitGrace,
      kind: 'shell',
    }),
  ];
}

/** The guns weapon system (WeaponId 0). Mounts are arc/muzzle definitions only;
 *  the two broadsides share ONE ammo pool + ONE reload (weapons/ammo.ts). */
export const gunSystem: WeaponSystem = {
  id: WEAPON.gun,
  maxAmmo: CONFIG.gun.maxAmmo,
  reloadMs: CONFIG.gun.reloadMs,
  tick(ship: ShipRecord, dtMs: number): void {
    tickReload(ship.ammo[WEAPON.gun], CONFIG.gun.maxAmmo, CONFIG.gun.reloadMs, dtMs);
  },
  fire(ctx: FireContext): void {
    for (const shell of fireGuns(ctx.ship, ctx.now, ctx.mkId)) ctx.spawnBallistic(shell);
  },
};
