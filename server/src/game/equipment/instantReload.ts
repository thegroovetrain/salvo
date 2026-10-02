// INSTANT RELOAD — the MINE LAYER's class Shift (Story 8.15, Eric rulings
// 2026-09-28, epic-8 amendments 97–98). An ACTIVATED ABILITY on the boost's
// grammar exactly: a 1-charge pool on a 60 s cooldown (Eric 2026-10-02, epic-8
// amendment 232; was 45 s) through the shared
// consume/tickReload machine (the reload takes `cooldownScale` like every row),
// activated off the Shift edge (actSeq), aimed at nothing, emitting nothing
// spatial. Its whole effect is the World's `finishReloads` capability: for the
// mounted gun and every fitted Q/E/R weapon whose reload is RUNNING, that ONE
// reload completes now (one round tops up, timer to zero; the machine gun's
// magazine fills). It does not refill a pool, never touches the belt, and never
// touches itself (amendment 98).

import { EQUIPMENT_IS_WEAPON, type LoadoutSlot } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

/** The instantReload Equipment row. Pool size (1 charge) + reload come from the
 *  ship's cached effective stats. Slot state is non-null by the loadout
 *  invariant (see index.ts). */
export const instantReloadEquipment: Equipment = {
  id: 'instantReload',
  isWeapon: EQUIPMENT_IS_WEAPON.instantReload, // false = an instant-activation ability
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    const row = ship.stats.equipment.instantReload;
    tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    // Consume the charge (empty pool => no-ammo, which the ability channel puts
    // on the wire as `cooling`), then let the World finish the running reloads.
    // Not latency-compensated (the boost's rule): nothing here is aimed.
    if (!consume(slot.state!, ctx.ship.stats.equipment.instantReload.reloadMs)) return { ok: false, reason: 'no-ammo' };
    ctx.finishReloads();
    return { ok: true };
  },
};
