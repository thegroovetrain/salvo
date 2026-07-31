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

import { CONFIG, EQUIPMENT_IS_WEAPON, sternDropArcFor, wrapAngle, type LoadoutSlot, type Vec2 } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationResult, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { hullClearOffset } from './ballistics.js';
import { dropBlocked } from './mines.js';

// The stern rack's ratified arc shape (Story 1.10): the shared arcFor family
// is the single arc-shape source, so the drop bearing can never drift from
// what the client classifies. As of Story 2.8 the DECOY alone keeps the stern
// drop (the mine left it for the aimed rear sector — amendment 45); its
// descriptor still reads CONFIG.mine.offset (sim/arcs.ts). Resolved at module
// load — a non-stern-drop decoy arc is a CONFIG/arcs authoring error, failed
// loudly at boot (sternDropArcFor throws), never mid-tick.
const STERN_RACK = sternDropArcFor('decoyBuoy');

/** Where a ship's next stern-rack drop lands (astern, clear of the hull):
 *  half the FIRER's hull length back plus the mine-trigger-radius margin —
 *  byte-identical to the pre-2.8 shared mine/decoy drop point. Exported for
 *  tests. */
export function dropPoint(ship: ShipRecord): Vec2 {
  const dir = wrapAngle(ship.state.heading + STERN_RACK.offset); // astern (heading + π)
  const dropOffset = hullClearOffset(ship, CONFIG.mine.triggerRadius);
  return {
    x: ship.state.x + Math.cos(dir) * dropOffset,
    y: ship.state.y + Math.sin(dir) * dropOffset,
  };
}

/** The decoy-buoy Equipment row. Pool size (1 charge) + reload come from the
 *  ship's cached effective stats. Denial = a BLOCKED drop point (island/
 *  boundary — checked FIRST so nothing is consumed; Story 1.10, shared with
 *  the mine rack) or no-ammo (plus the gate's dead/empty-slot answers — no
 *  arc, nothing aimed). Slot state is non-null by the loadout invariant
 *  (see index.ts). */
export const decoyEquipment: Equipment = {
  id: 'decoyBuoy',
  // Read the shared weapon/ability split — the single source (sim/loadout.ts),
  // never a hardcoded literal. false = an instant-activation ability.
  isWeapon: EQUIPMENT_IS_WEAPON.decoyBuoy,
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void {
    tickReload(slot.state!, ship.stats.decoyBuoy.maxAmmo, ship.stats.decoyBuoy.reloadMs, dtMs);
  },
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
    // Drop astern off the stern rack (dropPoint: heading + π, hull-clear with
    // the mine trigger-radius margin — the pre-2.8 shared rule, now the
    // decoy's alone). The buoy is stationary forever after (the World stores a
    // fixed point). A drop point inside a rock / off the water is refused
    // BEFORE the pool (Story 1.10 'blocked') — charge + reload untouched,
    // never a silent waste.
    const p = dropPoint(ctx.ship);
    if (dropBlocked(p, ctx.islands, ctx.mapRadius)) return { ok: false, reason: 'blocked' };
    if (!consume(slot.state!, ctx.ship.stats.decoyBuoy.reloadMs)) return { ok: false, reason: 'no-ammo' };
    ctx.dropDecoy(p.x, p.y);
    return { ok: true };
  },
};
