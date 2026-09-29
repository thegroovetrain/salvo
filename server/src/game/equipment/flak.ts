// THE FLAK GUN (Story 8.15, Eric rulings 2026-09-28, epic-8 amendments 96(f),
// 105 and 106) — a pickable deck gun mounted in slot 0 from the seat's `gun`.
// A CANNON-PATTERN burst gun: one shell per click to the clicked point (along
// the aim bearing, clamped to the gun's effective range and the water disk),
// AIR-BURSTING there in a FIXED `burstRadius` blast for `damage` to every hull
// inside it; a hull crossing the shell's path takes the smaller
// `contactDamage` and stops it (the cannon's bodyblock rule). One round, the
// ordinary consume/tickReload pool, the normal D1 fire-time back-date, the
// deduped `mz`, `sp`/`hc` exactly as the cannon's — every rule the cannon has,
// with Eric's numbers off the ship's EFFECTIVE `flak` row (the ladder moves
// damage and reload; the blast never grows). 360°, no arc (amendment 106).
//
// THE MASK is AR44's `hull | mine | decoy | ordnance` (CONFIG.flak.hits): a
// burst covering an armed mine sets it off like any burst (amendments 16/18/20),
// and one covering an ENEMY torpedo in flight removes it — a SIDE EFFECT that
// might go away (amendment 105); nothing here leans on it, and the World owns
// the outcome (resolveBurst: no boom, no damage, no `hc`, own fish immune).
// THE LIT-ZONE REACH (R2.15, amendment 114): like every deck gun, a click past
// `rangeU` into one of the shooter's OWN live lit zones is honoured at the
// clicked distance (guns.ts `gunReachU`, off this row's own `rangeU`).

import { CONFIG, EQUIPMENT_IS_WEAPON, type LoadoutSlot, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { burstPointAlong, gunReachU, muzzleOrTarget } from './guns.js';
import { makeBallistic } from './ballistics.js';

/** Build the one flak shell for this click, born at `now` (the validated
 *  fire time), clamped to `reachU` (the row's `rangeU`, lit-zone lifted).
 *  Pure over the ship's input + pose + stats. */
function flakShell(ship: ShipRecord, now: number, reachU: number, mapRadius: number, mkId: () => string): ShellState {
  const flak = ship.stats.equipment.flak;
  const dir = ship.input.aim;
  const target = burstPointAlong(ship, mapRadius, reachU, dir);
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.flak.shellRadius);
  return makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.flak.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.flak.shellRadius,
    damage: flak.damage,
    hitRadius: CONFIG.flak.shellRadius,
    kind: 'shell',
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: flak.burstRadius,
    contactDamage: flak.contactDamage,
    hits: CONFIG.flak.hits, // AR44 target mask
    family: 'flak',
  });
}

/** The flak Equipment row. Pool size + reload come from the ship's cached
 *  effective stats. Slot state is non-null by the loadout invariant. */
export const flakEquipment: Equipment = {
  id: 'flak',
  isWeapon: EQUIPMENT_IS_WEAPON.flak, // shared weapon/ability split — single source
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    tickReload(slot.state!, ship.stats.equipment.flak.maxAmmo, ship.stats.equipment.flak.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    // The ONLY denial is an empty pool (the reload) — there is no arc.
    if (!consume(slot.state!, ctx.ship.stats.equipment.flak.reloadMs)) return { ok: false, reason: 'no-ammo' };
    // bornAt = the VALIDATED fire time (D1), the cannon's rule: a back-dated
    // shell is pre-stepped by the World to where it belongs this tick.
    const reachU = gunReachU(ctx, ctx.ship.stats.equipment.flak.rangeU); // R2.15, amendment 114
    ctx.spawnBallistic(flakShell(ctx.ship, ctx.fireT, reachU, ctx.mapRadius, ctx.mkId));
    return { ok: true };
  },
};
