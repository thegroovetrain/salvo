// HUNKER (was DAMAGE CUT until Story 9.9) — the BATTLESHIP's class Shift (Story 8.15, Eric rulings
// 2026-09-28, epic-8 amendments 99–102). An ACTIVATED ABILITY on the boost's
// grammar exactly: a 1-charge pool on a 30 s cooldown through the shared
// consume/tickReload machine (the reload takes `cooldownScale` like every row),
// activated off the Shift edge (actSeq), aimed at nothing, emitting nothing
// spatial. One press opens a `durationMs` window (ShipRecord.hunkerUntil,
// via the World's `setHunker` capability — its ONLY writer) during which the
// damage gate adds the row's `armorBonus` to this hull's Armor inside its
// curve on effective armor E = victim Armor (+ HUNKER's armorBonus while open)
// − attacker Armor Piercing, BEFORE the shield absorbs (Story 9.7, epic-9
// amendments 86–88 — no flat factor: at Tier 0 that is Armor 5 → ×0.5, which
// Story 9.9 rescaled to bonus +100 at K 100 → still ×0.5 (amendment 144), less
// the attacker's ARMOR PIERCING (amendment 146); a hit
// floored, a burn or grind tick exact; storm bites land in full — epic-8
// amendments 100–102). The window rides `you` only
// (OwnShip.hunkerUntil, self-private) so the HUD can show the ACTIVE
// grammar; an enemy reads a cut hull only through its persistence under fire.

import { EQUIPMENT_IS_WEAPON, type LoadoutSlot } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

/** The hunker Equipment row. Pool size (1 charge), reload and window come
 *  from the ship's cached effective stats. Slot state is non-null by the
 *  loadout invariant (see index.ts). */
export const hunkerEquipment: Equipment = {
  id: 'hunker',
  isWeapon: EQUIPMENT_IS_WEAPON.hunker, // false = an instant-activation ability
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    const row = ship.stats.equipment.hunker;
    tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    const row = ctx.ship.stats.equipment.hunker;
    // Consume the charge (empty pool => no-ammo), then open the window from
    // server apply time (`now`, never a back-dated claim — the boost's rule).
    if (!consume(slot.state!, row.reloadMs)) return { ok: false, reason: 'no-ammo' };
    ctx.setHunker(ctx.now + row.durationMs);
    return { ok: true };
  },
};
