// Gun fire control — the gun Equipment row (step 12 moved this out of combat.ts,
// which now re-exports from here). Firing is DERIVED, not commanded (plan):
// when a click reaches a ship with guns selected (the World's fireControl
// consumes one click per fireSeq increment), ONE shell leaves the single mount
// whose arc bears on the aim, drawing one round from the slot's shared ammo
// pool — iff the pool has a round AND a mount bears AND the ship is alive. The
// two mounts are now arc/muzzle definitions only (which side the shell exits);
// they share one pool + one reload (see equipment/ammo.ts). No fire-rate or arc
// cheat is possible by construction. Guns fire AT the aim point: the shell's
// range is the clicked distance (input.aimDist, muzzle-relative), clamped to
// max gun range — a click at/inside the own hull degenerates to a harmless
// splash at the muzzle ('expired' never routes to hitShip). Pure over a
// ShipRecord's input + kinematics + slot pool; the World owns shell storage +
// event emission.

import {
  CONFIG,
  SLOT_GUN,
  WEAPON,
  angleDiff,
  inArc,
  wrapAngle,
  type EquipmentState,
  type ShellState,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
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
 * clamped to the ship's EFFECTIVE max gun range (stats.gun.rangeU — the
 * gunRange upgrade; base = CONFIG.gun.shellRange).
 */
export function shellRangeFor(ship: ShipRecord, aimDist: number): number {
  const muzzleOffset = hullClearOffset(ship, CONFIG.gun.shellRadius);
  return Math.min(Math.max(aimDist - muzzleOffset, 0), ship.stats.gun.rangeU);
}

/**
 * Gun fire control against one slot pool: 0 or 1 shell — the single mount whose
 * DISJOINT arc bears on the aim fires and draws one round from the shared pool.
 * Checks in TODAY'S order: arc first (arc-miss does NOT drain the pool, like
 * torpedoes), then the pool (empty denies). The denial reason reports whichever
 * check failed first; `null` means a shell launched.
 */
function gunSalvo(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mkId: () => string,
): { shells: ShellState[]; denial: ActivationDenial | null } {
  const aim = ship.input.aim;
  const mount = MOUNTS.find((m) => inArc(aim, wrapAngle(ship.state.heading + m.offset), m.halfArc));
  if (!mount) return { shells: [], denial: 'out-of-arc' }; // no broadside bears — no launch, no ammo spent
  if (!consume(pool, ship.stats.gun.reloadMs)) return { shells: [], denial: 'no-ammo' }; // pool empty
  const dir = clampToArc(aim, wrapAngle(ship.state.heading + mount.offset), mount.halfArc);
  return {
    shells: [
      makeBallistic(mkId(), ship, dir, now, {
        speed: CONFIG.gun.shellSpeed,
        range: shellRangeFor(ship, ship.input.aimDist),
        damage: CONFIG.gun.damage,
        hitRadius: CONFIG.gun.shellRadius,
        kind: 'shell',
      }),
    ],
    denial: null,
  };
}

/**
 * Run gun fire control for one ship this tick (the World routes at most one
 * click here per fireSeq increment) against its gun slot's pool. Returns 0 or
 * 1 shell. No-op (empty) if dead or guns not selected — kept for direct test
 * callers; the click gate itself lives in World.fireControl.
 */
export function fireGuns(ship: ShipRecord, now: number, mkId: () => string): ShellState[] {
  if (!ship.alive || ship.input.weapon !== WEAPON.gun) return [];
  // Loadout invariant: the gun slot is always fitted today, so state is set.
  return gunSalvo(ship, ship.loadout[SLOT_GUN].state!, now, mkId).shells;
}

/** The gun Equipment row. Mounts are arc/muzzle definitions only; the two
 *  broadsides share the slot's ONE ammo pool + ONE reload (equipment/ammo.ts).
 *  Pool size + reload come from the ship's cached effective stats (Stage D).
 *  Slot state is non-null by the loadout invariant (see index.ts). */
export const gunEquipment: Equipment = {
  id: 'gun',
  isWeapon: true,
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.gun.maxAmmo, ship.stats.gun.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    const { shells, denial } = gunSalvo(ctx.ship, slot.state!, ctx.now, ctx.mkId);
    for (const shell of shells) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
