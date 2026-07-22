// Star-shell fire control — the starShells Equipment row (Story 1.7, the
// Battleship's slot-2 special). A gun-pattern skillshot whose burst deals
// minor damage once across the FULL lit circle (burstRadius = litRadius,
// owner excluded) AND spawns a server-side LIT ZONE at the burst point: the
// shell carries the server-internal `lit` tag, so World.resolveBurst spawns a
// {litRadius, litDurationMs} zone there — firer-only truesight parity inside
// it lives in signals.ts/perception.ts, never here. Same fire flow as the gun
// (360°, clamp at the system's effective range, muzzle-or-target spawn,
// makeBallistic with D1 fireT); range = the gun's BASE range
// (stats.starShells.rangeU, radar-derived, un-stacked). An early interceptor
// OUTSIDE the would-be lit circle takes contactDamage (= the flare's minor
// damage, the torpedo precedent) and stops the shell — no burst, NO zone; the
// huge 110u blast-membership exception makes that a rare distant bodyblock.
// Pure over a ShipRecord's input + pose + slot pool; the World owns shell
// storage, zone spawn, and event emission.

import { CONFIG, EQUIPMENT_IS_WEAPON, type EquipmentState, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';
import { burstPoint, muzzleOrTarget } from './guns.js';

/** u — the flare's collision radius. Eric's ruled CONFIG.starShells block
 *  defines no bespoke radius, so the flare deliberately rides the standard
 *  shell's collision radius (CONFIG.gun.shellRadius) rather than inventing a
 *  new tunable. */
const FLARE_RADIUS = CONFIG.gun.shellRadius;

/**
 * Star-shell fire control against one slot pool: 0 or 1 flare. The ONLY
 * denial is an empty pool ('no-ammo' — the 20s cooldown); there is no arc.
 * The flare's hit rule IS the lit circle: burstRadius = litRadius, so every
 * enemy hull inside the lit area takes the minor damage once at burst — and
 * the `lit` tag makes the World spawn the zone at the same point.
 */
function fireStarShell(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  if (!consume(pool, ship.stats.starShells.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const dir = ship.input.aim;
  const target = burstPoint(ship, mapRadius, ship.stats.starShells.rangeU);
  const origin = muzzleOrTarget(ship, dir, target, FLARE_RADIUS);
  const shell = makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.starShells.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + FLARE_RADIUS,
    damage: CONFIG.starShells.damage,
    hitRadius: FLARE_RADIUS,
    kind: 'shell', // rides the existing shell wire kind (first-sight reveal, constant-free shape)
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: CONFIG.starShells.litRadius, // the burst IS the lit circle
    contactDamage: CONFIG.starShells.damage, // torpedo precedent: contact = the flare's minor damage
    lit: { radius: CONFIG.starShells.litRadius, durationMs: CONFIG.starShells.litDurationMs },
  });
  return { shell, denial: null };
}

/** The starShells Equipment row. Pool size + reload come from the ship's
 *  cached effective stats (pure CONFIG.starShells pass-throughs — maxAmmo
 *  pinned to 1, the single-shot cooldown). Slot state is non-null by the
 *  loadout invariant (see index.ts). */
export const starShellsEquipment: Equipment = {
  id: 'starShells',
  isWeapon: EQUIPMENT_IS_WEAPON.starShells, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.starShells.maxAmmo, ship.stats.starShells.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated flare is then
    // pre-stepped by the World to where it belongs this tick.
    const { shell, denial } = fireStarShell(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
