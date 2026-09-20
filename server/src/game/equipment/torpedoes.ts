// THE TWO TORPEDO EQUIPMENT LINES (Story 8.13) — HEAVY and LIGHT, one factory.
//
// Both are a slot pool over `torpedoCore.launchTorpedo`: a click launches one
// fish along the click bearing, consumes a round and starts the reload if the
// pool was full. They differ in exactly three things, all of them DATA:
//
//   line          arc                              CONFIG block        row
//   heavyTorpedo  bow sector +/-30 deg             CONFIG.torpedo      equipment.heavyTorpedo
//   lightTorpedo  TWIN beam sectors +/-45 deg      CONFIG.lightTorpedo equipment.lightTorpedo
//
// EACH ROW READS ITS OWN STATS. Until 8.13 this module hard-read
// `stats.equipment.heavyTorpedo` for tubes, reload, speed and damage; with two
// lines in the water that would have given a Torpedo Boat's light tubes the
// heavy's numbers. The id is now the parameter and the row lookup follows it.
//
// HOMING IS A TIER STAT (amendment 80) and lives entirely in the core: the
// old `.homing` doctrine read is gone from this module, and a tier-I fish of
// either line is a straight-runner by construction.
//
// Torpedoes are NEVER radar-painted — structurally, because perception's paint
// loop iterates ships only. Their per-observer reveal rides the SAME first-sight
// ballistic machinery as shells (sight + LOS), so a torpedo materializes at your
// fog boundary, never at its launch point (see perception.ts / BallisticEvent).

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  isAfloat,
  type EquipmentState,
  type ShellState,
  type TargetKind,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { launchTorpedo, type TorpedoLaunchContext } from './torpedoCore.js';

/** The two lines this module fits. */
export type TorpedoLineId = 'heavyTorpedo' | 'lightTorpedo';

/** One line's AR44 target mask, from ITS OWN CONFIG block — never another
 *  row's answer (the BallisticParams law). */
function hitsFor(id: TorpedoLineId): readonly TargetKind[] {
  return id === 'lightTorpedo' ? CONFIG.lightTorpedo.hits : CONFIG.torpedo.hits;
}

/**
 * Launch one fish of `id` against `pool`. Checks in the shipped order — arc
 * first (an arc miss does NOT spend a round), then the pool — with both
 * answers coming out of the shared core. The row's OWN effective numbers are
 * what fly: speed, damage and `homingTurnRate` (0 = a straight-runner).
 */
function fireLine(
  ship: ShipRecord,
  id: TorpedoLineId,
  pool: EquipmentState,
  ctx: TorpedoLaunchContext,
): { torp: ShellState | null; denial: ActivationDenial | null } {
  const row = ship.stats.equipment[id];
  return launchTorpedo(ctx, ship, {
    id,
    row: { speed: row.speed, damage: row.damage, homingTurnRate: row.homingTurnRate },
    hits: hitsFor(id),
    spend: () => consume(pool, row.reloadMs),
  });
}

/**
 * Launch one torpedo of `id` from the slot fitting it, or null if the pool is
 * empty or the aim is out of that line's arc. The alive + selected-slot guards
 * are kept for direct test callers; the click gate itself lives in
 * World.fireControl. Exported for tests (pool reload, arc gating).
 */
export function fireTorpedo(
  ship: ShipRecord,
  now: number,
  mkId: () => string,
  id: TorpedoLineId = 'heavyTorpedo',
): ShellState | null {
  const slotIndex = ship.loadout.findIndex((s) => s.equipmentId === id);
  if (!isAfloat(ship.lifecycle) || slotIndex < 0 || ship.input.slot !== slotIndex) return null;
  // Loadout invariant: a fitted slot always has state.
  return fireLine(ship, id, ship.loadout[slotIndex].state!, { fireT: now, mkId }).torp;
}

/** Build one torpedo line's Equipment row. Pool size + reload come from the
 *  ship's cached effective stats for THAT line. Slot state is non-null by the
 *  loadout invariant (see index.ts). */
function torpedoLine(id: TorpedoLineId): Equipment {
  return {
    id,
    isWeapon: EQUIPMENT_IS_WEAPON[id], // shared weapon/ability split — single source
    tick(ship, slot, dtMs): void {
      const row = ship.stats.equipment[id];
      tickReload(slot.state!, row.maxAmmo, row.reloadMs, dtMs);
    },
    activate(ctx, slot) {
      // bornAt = the VALIDATED fire time (D1): a back-dated fish is then
      // pre-stepped by the World to where it belongs this tick.
      const { torp, denial } = fireLine(ctx.ship, id, slot.state!, { fireT: ctx.fireT, mkId: ctx.mkId });
      if (torp) ctx.spawnBallistic(torp);
      return denial === null ? { ok: true } : { ok: false, reason: denial };
    },
  };
}

/** The HEAVY torpedo — the family's reference fish (bow sector, CONFIG.torpedo). */
export const torpedoEquipment: Equipment = torpedoLine('heavyTorpedo');

/** The LIGHT torpedo (Story 8.13, catalog-v3 R18) — the Torpedo Boat's fast,
 *  cheap fish on TWIN beam sectors. */
export const lightTorpedoEquipment: Equipment = torpedoLine('lightTorpedo');
