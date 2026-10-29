// THE FOUR BUOYS (Story 10.9, Eric 2026-10-27/28, epic-10 amendments 2 and 4)
// — RADAR BUOY, HEALING BUOY, SHIELD BUOY and SPEED BUOY, four click-placed
// consumable lines sharing ONE drop body: the retired DECOY BUOY's (Story
// 8.16, catalog-v3 R36/R41, epic-8 amendments 119–124). The digit PRIMES the
// slot and a CLICK at ANY bearing (ruling 9: a 360° `'full'` arc — the decoy's
// rear sector is gone for buoys; the mines keep theirs) out to the unchanged
// `CONFIG.mine.placeRange` drops one buoy of the line's KIND at the clicked
// point (`minePlacePoint` — the clicked point, no sector term).
//
// Denials (nothing is spent on any — the ONE SPEND LAW, row.ts, takes the copy
// only when this effect answers `ok`): past placeRange → 'out-of-arc' (the
// refusal word the client already knows for a too-far drop); the point ashore
// or off the water disk → 'blocked'.
//
// ONE effect factory, four rows: the kind is the only difference at the drop.
// What each kind DOES lives in the World (`applyBuoyEffects`, the radar
// buoy's sweep in `advanceSweeps` + perception), never here.

import { CONFIG, blockedWater, buoyKindOf, type BuoyLineId, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { minePlacePoint } from '../mines.js';
import { consumableRow, type ConsumableEffect, type ConsumableRow } from './row.js';

/** The shared drop body for a buoy line: range clamp, water legality, drop. */
export function dropBuoy(id: BuoyLineId): ConsumableEffect {
  const kind = buoyKindOf(id);
  return (ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult => {
    const ship = ctx.ship;
    if (ship.input.aimDist > CONFIG.mine.placeRange) return { ok: false, reason: 'out-of-arc' };
    const p = minePlacePoint(ship); // the clicked point, the mine's rule verbatim
    if (blockedWater(p, ctx.islands, ctx.mapRadius)) return { ok: false, reason: 'blocked' };
    ctx.dropDecoy(p.x, p.y, kind);
    return { ok: true };
  };
}

export const radarBuoyRow: ConsumableRow = consumableRow('radarBuoy', dropBuoy('radarBuoy'));
export const healingBuoyRow: ConsumableRow = consumableRow('healingBuoy', dropBuoy('healingBuoy'));
export const shieldBuoyRow: ConsumableRow = consumableRow('shieldBuoy', dropBuoy('shieldBuoy'));
export const speedBuoyRow: ConsumableRow = consumableRow('speedBuoy', dropBuoy('speedBuoy'));
