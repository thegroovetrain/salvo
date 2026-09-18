// THE SHIFT BOOST — the universal ability every captain hull carries in slot 1
// (Story 8.9, epic-8 amendments 54-55; the first non-weapon Equipment row was
// Story 1.6). An ACTIVATED ABILITY that fires nothing and emits nothing spatial.
// It reuses the SAME reload machinery the weapons use (a 1-charge pool @
// CONFIG.boost.reloadMs via the shared tickReload/consume), but instead of
// spawning ordnance its activation opens a timed window by stamping
// ctx.ship.boostUntil — the ONLY writer of that field. The window then raises
// the forward maxSpeed cap per-tick through the shared sim/boost.ts helper in
// World.stepShips (never here), by CONFIG.boost.factor (+25 %) of the POST-FOLD
// max speed, so the SPEED ladder is inside the bonus (amendment 55). Pure
// adapter over the slot pool + the ship's cached effective stats; the World owns
// storage and event emission.

import { EQUIPMENT_IS_WEAPON, type LoadoutSlot } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

/** The boost Equipment row. Pool size (1 charge) + reload come from the ship's
 *  cached effective stats (stats.equipment.boost — a CONFIG.boost pass-through
 *  whose reloadMs takes the one cooldownScale multiply like every other row; no
 *  card addresses the speed factor). Slot state is non-null by the loadout
 *  invariant (see index.ts). */
export const boostEquipment: Equipment = {
  id: 'boost',
  // Read the shared weapon/ability split — the single source (sim/loadout.ts),
  // never a hardcoded literal. false = an instant-activation ability.
  isWeapon: EQUIPMENT_IS_WEAPON.boost,
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    tickReload(slot.state!, ship.stats.equipment.boost.maxAmmo, ship.stats.equipment.boost.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    // Consume a charge (empty pool => no-ammo denial, no state change — the same
    // machine the weapons deny on). On success, open the boost window:
    // boostUntil = now + duration. This row IGNORES ctx.fireT: ability activation
    // is NOT latency-compensated — D1's back-dating rationale is for AIMED shots
    // (materialize the projectile where the honest click placed it in time), and
    // nothing here is aimed, so the window starts at server apply time (`now`),
    // not a back-dated claim.
    if (!consume(slot.state!, ctx.ship.stats.equipment.boost.reloadMs)) return { ok: false, reason: 'no-ammo' };
    ctx.ship.boostUntil = ctx.now + ctx.ship.stats.equipment.boost.durationMs;
    return { ok: true };
  },
};
