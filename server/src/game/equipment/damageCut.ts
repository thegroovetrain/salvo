// DAMAGE CUT — the BATTLESHIP's class Shift (Story 8.15, Eric rulings
// 2026-09-28, epic-8 amendments 99–102). An ACTIVATED ABILITY on the boost's
// grammar exactly: a 1-charge pool on a 30 s cooldown through the shared
// consume/tickReload machine (the reload takes `cooldownScale` like every row),
// activated off the Shift edge (actSeq), aimed at nothing, emitting nothing
// spatial. One press opens a `durationMs` window (ShipRecord.damageCutUntil,
// via the World's `setDamageCut` capability — its ONLY writer) during which the
// damage gate multiplies every WEAPON blow to this hull by `factor` BEFORE the
// shield absorbs it (a hit floored, a burn tick halved exactly; storm bites
// land in full — amendments 100–102). The window rides `you` only
// (OwnShip.damageCutUntil, self-private) so the HUD can show the ACTIVE
// grammar; an enemy reads a cut hull only through its persistence under fire.

import { EQUIPMENT_IS_WEAPON, type LoadoutSlot } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

/** The damageCut Equipment row. Pool size (1 charge), reload and window come
 *  from the ship's cached effective stats. Slot state is non-null by the
 *  loadout invariant (see index.ts). */
export const damageCutEquipment: Equipment = {
  id: 'damageCut',
  isWeapon: EQUIPMENT_IS_WEAPON.damageCut, // false = an instant-activation ability
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    const row = ship.stats.equipment.damageCut;
    tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    const row = ctx.ship.stats.equipment.damageCut;
    // Consume the charge (empty pool => no-ammo), then open the window from
    // server apply time (`now`, never a back-dated claim — the boost's rule).
    if (!consume(slot.state!, row.reloadMs)) return { ok: false, reason: 'no-ammo' };
    ctx.setDamageCut(ctx.now + row.durationMs);
    return { ok: true };
  },
};
