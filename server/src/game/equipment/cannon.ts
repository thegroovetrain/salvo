// Long-range cannon fire control — the cannon Equipment row (Story 1.7, the
// Battleship's slot-1 special). A gun-pattern burst skillshot with bigger
// numbers: the exact guns.ts fire flow (360°, no arc — a click is denied only
// by an empty pool; the shell flies to the CLICKED point, clamped to the
// system's effective range, and BURSTS there in CONFIG.cannon.burstRadius;
// an early interceptor takes the smaller contactDamage and stops the shell
// unless already inside the would-be blast — see sim/shell.ts) with its own
// CONFIG block. Range = the gun's BASE range (stats.cannon.rangeU, derived
// from CONFIG.vision.radar) — NOT extended, and NO upgrade stacks on it (the
// gunRange upgrade moves the standard gun only). Pure over a ShipRecord's
// input + pose + slot pool; the World owns shell storage + event emission.

import { CONFIG, EQUIPMENT_IS_WEAPON, PIERCE_FALLOFF, type EquipmentState, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic, muzzleSpawn } from './ballistics.js';
import { burstPoint, muzzleOrTarget } from './guns.js';

/**
 * The AP direction shot (ARMOR-PIERCING SHELLS doctrine, Story 2.8): no burst
 * target at all — a full-range shot along the clicked DIRECTION (aimDist is
 * deliberately ignored; distLeft = the cannon's effective range from the
 * muzzle), piercing up to PIERCE_FALLOFF.length hulls at 100/50/25% of the
 * effective damage in hit order (sim/shell.ts stepPierce; the World applies
 * pierceDamage per hit); islands stop it dead.
 */
function fireApShell(ship: ShipRecord, now: number, mkId: () => string): ShellState {
  const dir = ship.input.aim;
  const origin = muzzleSpawn(ship, dir, CONFIG.cannon.shellRadius);
  return makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.cannon.shellSpeed,
    range: ship.stats.cannon.rangeU,
    damage: ship.stats.cannon.damage,
    hitRadius: CONFIG.cannon.shellRadius,
    kind: 'shell',
    origin,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    // Unused in flight — the pierce sweep owns every hull resolution — but the
    // field is required (nothing silently borrows gun values).
    contactDamage: ship.stats.cannon.damage,
    pierce: { remaining: PIERCE_FALLOFF.length, hitIds: [] },
  });
}

/**
 * Cannon fire control against one slot pool: 0 or 1 shell, MODED by the
 * owner's doctrine (Story 2.8, stats.cannon.mode): 'standard' is the gun-
 * pattern burst at the clicked point; 'arcing' (PLUNGING FIRE) is the same
 * burst shot tagged to overfly islands AND hulls (un-interceptable, always
 * bursts exactly at the click); 'ap' is the pierce direction shot above. The
 * ONLY denial is an empty pool ('no-ammo' — the 15s cooldown); there is no
 * arc. Damage/blast numbers come from the OWNER's effective stats (the HEAVY
 * CHARGE / FRAGMENTATION CASING ladders), never raw CONFIG. distLeft slack
 * mirrors fireGunShells (guards float drift, never extends reach).
 */
function fireCannonShell(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  if (!consume(pool, ship.stats.cannon.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const cannon = ship.stats.cannon;
  if (cannon.mode === 'ap') return { shell: fireApShell(ship, now, mkId), denial: null };
  const dir = ship.input.aim;
  const target = burstPoint(ship, mapRadius, cannon.rangeU);
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.cannon.shellRadius);
  const shell = makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.cannon.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.cannon.shellRadius,
    damage: cannon.damage,
    hitRadius: CONFIG.cannon.shellRadius,
    kind: 'shell', // rides the existing shell wire kind (first-sight reveal, constant-free shape)
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: cannon.burstRadius,
    contactDamage: cannon.contactDamage,
    // PLUNGING FIRE: overflies everything, bursts exactly at the click.
    ...(cannon.mode === 'arcing' ? { arcing: true as const } : {}),
  });
  return { shell, denial: null };
}

/** The cannon Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (pure CONFIG.cannon pass-throughs — maxAmmo pinned to 1,
 *  the single-shot cooldown). Slot state is non-null by the loadout invariant
 *  (see index.ts). */
export const cannonEquipment: Equipment = {
  id: 'cannon',
  isWeapon: EQUIPMENT_IS_WEAPON.cannon, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.cannon.maxAmmo, ship.stats.cannon.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated shell is then
    // pre-stepped by the World to where it belongs this tick.
    const { shell, denial } = fireCannonShell(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
