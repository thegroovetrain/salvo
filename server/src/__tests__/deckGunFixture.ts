// TEST FIXTURE (Story 10.4): mount one of the retired DECK GUN rows on a
// hull's slot 0, and put a hull on the NEUTRAL index.
//
// Since Story 10.4 no captain picks a deck gun — slot 0 is the MAIN BATTERY on
// every captain hull and the `gun` row is the PvE drones' — but the cannon /
// machine gun / flak Equipment rows still exist in the registry (drones fire
// the cannon; the other two stay for reference), and their row mechanics
// (magazine, stream, flak air-burst, mine damage on landing, attenuation) are
// still guarded by directed tests. Those tests seat the row here, straight
// onto the loadout, loaded, exactly as `loadoutFor` used to.
//
// THE NEUTRAL INDEX: none of the four battleships sits at index 100 across
// the board (R1), so a test that reads "the CONFIG number with no index in
// the way" re-folds its hulls on the default hull's envelope with every
// index at `CONFIG.index.base` — the shared tests' NEUTRAL_HULL, server side.

import {
  CONFIG,
  INDEX_IDS,
  effectiveStats,
  equipmentMaxAmmo,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  type HullEnvelope,
  type HullId,
} from '@salvo/shared';
import type { ShipRecord } from '../game/world.js';
import { freshAmmo } from '../game/equipment/index.js';

/** The three deck-gun rows a test may mount on slot 0. */
export type DeckGunRow = 'gun' | 'machineGun' | 'flak';

/** Replace slot 0 with `row`, at a full pool off the hull's own folded stats. */
export function mountDeckGun<T extends ShipRecord>(rec: T, row: DeckGunRow): T {
  rec.loadout[0] = { equipmentId: row, state: freshAmmo(equipmentMaxAmmo(rec.stats, row)) };
  return rec;
}

/** Re-fold `rec` on its own envelope with EVERY index at the base (zero
 *  cards), and fill its hp to the new max. Call BEFORE mounting a deck gun or
 *  fitting cards (the fold is replaced, the loadout is not). */
export function neutralize<T extends ShipRecord>(rec: T): T {
  const index = Object.fromEntries(INDEX_IDS.map((k) => [k, CONFIG.index.base])) as HullEnvelope['index'];
  rec.cls = { ...rec.cls, index };
  rec.stats = effectiveStats(rec.cls);
  rec.hp = rec.stats.maxHp;
  return rec;
}

/** u — how far `hullId`'s NEAREST outline point toward a point dead astern
 *  sits short of its centre, measured off the shared silhouette (Story 10.4:
 *  the traced hulls have blunt ends, so a fixture reads it, never copies a
 *  half-length). A hull centred `sternReachU(id) + d` from a point, stern on,
 *  has its outline exactly `d` from that point. */
export function sternReachU(hullId: HullId): number {
  const y0 = 1000;
  return y0 - pointPolygonDistance({ x: 0, y: 0 }, transformPolygon(hullSilhouette(hullId), 0, y0, Math.PI / 2));
}
