// RADAR BUOY — DELIBERATE PLACEHOLDER ROW (Story 7-5 wave 2, R2.7–R2.11).
//
// The DECOY BUOY it replaces is DELETED end to end from this server (its
// equipment row, the World's `decoys` store, the `decoy` signal row and its
// counter-intel blip lie, and the frame channel that carried it): nothing in
// the game fakes a ship contact any more, and `DecoyView` left the wire with
// the deception. What replaces it — a placed second RADAR OBSERVER whose
// returns merge into its owner's frame (R2.8), painting on its own profile
// with no owner identity (R2.9), 50 hp and destructible, with the GUN and
// JAMMING doctrines on top (R2.10/R2.11) — is a WHOLE SUBSYSTEM and is owned by
// a later agent in this story. NONE of it is implemented here.
//
// This row exists for exactly one reason: `EQUIPMENT` is a
// `Record<EquipmentId, Equipment>`, so the registry cannot type-check without
// an entry for every fitted id, and `radarBuoy` is fitted in the Mine Layer's
// slot 2. It ticks its reload honestly (so the pool/HUD state a client already
// derives from `stats.radarBuoy` is not a lie) and REFUSES every activation
// with 'blocked' — the one denial that is documented to consume NOTHING (no
// charge, no reload), so a press against an unimplemented system spends
// nothing and is never silent (FR12). It is a stub, not a behaviour: the agent
// who builds the buoy replaces this whole file.

import { EQUIPMENT_IS_WEAPON } from '@salvo/shared';
import type { Equipment } from './index.js';
import { tickReload } from './ammo.js';

/** The radar-buoy placeholder row — reload bookkeeping only; every activation
 *  is refused 'blocked' (nothing consumed) until the buoy is built. */
export const radarBuoyEquipment: Equipment = {
  id: 'radarBuoy',
  isWeapon: EQUIPMENT_IS_WEAPON.radarBuoy, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.radarBuoy.maxAmmo, ship.stats.radarBuoy.reloadMs, dtMs);
  },
  activate() {
    return { ok: false, reason: 'blocked' };
  },
};
