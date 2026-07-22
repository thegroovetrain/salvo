// Decoy-buoy activation — the Mine Layer's slot-2 ability row (Story 1.8, Eric
// ruling 2026-07-22). An ACTIVATED ABILITY (boost pattern, isWeapon false):
// one press consumes the single charge and drops a STATIONARY buoy astern —
// the same stern rack the mines drop from (dropPoint, hull-clear) — then the
// buoy never moves again. The row itself emits nothing spatial: the World owns
// the decoy store (one live per owner, replacement eviction, 30s natural
// expiry) and perception/signals own the deception (the buoy radar-paints to
// fogged non-owners as the OWNER's ship via the blip row's counterIntel; the
// truth rides the contact-like `decoys` channel). Like every ability this row
// IGNORES ctx.fireT — activation is not latency-compensated (nothing is
// aimed); the buoy drops at server apply time. Pure adapter over the slot pool
// + the ship's cached effective stats (stats.decoyBuoy — a CONFIG pass-through
// no upgrade touches).

import { EQUIPMENT_IS_WEAPON, type LoadoutSlot } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { dropPoint } from './mines.js';

/** The decoy-buoy Equipment row. Pool size (1 charge) + reload come from the
 *  ship's cached effective stats. Denial = no-ammo only (plus the gate's
 *  dead/empty-slot answers — no arc, nothing aimed). Slot state is non-null by
 *  the loadout invariant (see index.ts). */
export const decoyEquipment: Equipment = {
  id: 'decoyBuoy',
  // Read the shared weapon/ability split — the single source (sim/loadout.ts),
  // never a hardcoded literal. false = an instant-activation ability.
  isWeapon: EQUIPMENT_IS_WEAPON.decoyBuoy,
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    tickReload(slot.state!, ship.stats.decoyBuoy.maxAmmo, ship.stats.decoyBuoy.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    if (!consume(slot.state!, ctx.ship.stats.decoyBuoy.reloadMs)) return { ok: false, reason: 'no-ammo' };
    // Drop astern off the SAME stern rack as the mines (dropPoint: heading + π,
    // hull-clear with the mine trigger-radius margin) — one stern-drop rule for
    // both Mine Layer specials, so a hull retune can never split them. The buoy
    // is stationary forever after (the World stores a fixed point).
    const p = dropPoint(ctx.ship);
    ctx.dropDecoy(p.x, p.y);
    return { ok: true };
  },
};
