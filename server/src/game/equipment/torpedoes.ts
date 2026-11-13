// THE THREE TORPEDO EQUIPMENT LINES (Story 8.13; launchers since Story 10.6,
// Eric 2026-11-05, R6 / R16, epic-10 amendment 12) — HEAVY, LIGHT and
// SUPERCAVITATING, one factory.
//
// Every line fires through `torpedoCore.launchTorpedo`: a click fires ONE
// tube from the ship's deck LAUNCHERS (`ship.launchers`) — the shared
// `pickTube` chooses it — and that tube starts its own reload. The lines
// differ only in DATA: their own effective row (speed, damage, homing, reload)
// and their own target mask. The fixed launch sectors are gone.
//
// THE SLOT POOL IS A SUMMARY. The torpedo slot's `{n, reloadMsLeft}` is
// re-derived from the launchers (`launcherSummary`, equipment/mounts.ts) every
// tick and after every launch — tubes loaded, and the soonest reload. The
// tube clocks themselves are stepped by the World's `stepLaunchers` row.
//
// Torpedoes are NEVER radar-painted — structurally, because perception's paint
// loop iterates ships only. Their per-observer reveal rides the SAME first-sight
// ballistic machinery as shells (sight + LOS), so a torpedo materializes at your
// fog boundary, never at its launch point (see perception.ts / BallisticEvent).

import { CONFIG, EQUIPMENT_IS_WEAPON, isAfloat, type ShellState, type TargetKind } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { syncTorpedoSlot } from './mounts.js';
import { launchTorpedo, type TorpedoLaunchContext } from './torpedoCore.js';

/** The three lines this module fits. The SUPERCAVITATING torpedo joined the
 *  slot weapons in Story 10.5 (Eric 2026-11-05, epic-10 amendment 11): a pool
 *  on the standard reload, its numbers off its own effective row — the row's
 *  `homingTurnRate` is 0 at every tier, so it stays a straight-runner. */
export type TorpedoLineId = 'heavyTorpedo' | 'lightTorpedo' | 'supercavTorpedo';

/** One line's AR44 target mask, from ITS OWN CONFIG block — never another
 *  row's answer (the BallisticParams law). */
function hitsFor(id: TorpedoLineId): readonly TargetKind[] {
  if (id === 'lightTorpedo') return CONFIG.lightTorpedo.hits;
  return id === 'supercavTorpedo' ? CONFIG.supercavTorpedo.hits : CONFIG.torpedo.hits;
}

/**
 * Launch one torpedo of `id` from the ship's launchers (see the header). The
 * row's OWN effective numbers are what fly — speed, damage, `homingTurnRate`
 * (0 = a straight-runner) — and its folded `reloadMs` is what the fired tube
 * starts.
 */
function fireLine(
  ship: ShipRecord,
  id: TorpedoLineId,
  ctx: TorpedoLaunchContext,
): { torp: ShellState | null; denial: ActivationDenial | null } {
  const row = ship.stats.equipment[id];
  const out = launchTorpedo(ctx, ship, {
    row: { speed: row.speed, damage: row.damage, homingTurnRate: row.homingTurnRate, reloadMs: row.reloadMs, runU: row.runU },
    hits: hitsFor(id),
  });
  syncTorpedoSlot(ship);
  return out;
}

/**
 * Launch one torpedo of `id` from the slot fitting it, or null when no tube
 * fires (out of every launcher's arc, or no tube loaded). The alive +
 * selected-slot guards are kept for direct test callers; the click gate itself
 * lives in World.fireControl. Exported for tests.
 */
export function fireTorpedo(
  ship: ShipRecord,
  now: number,
  mkId: () => string,
  id: TorpedoLineId = 'heavyTorpedo',
): ShellState | null {
  const slotIndex = ship.loadout.findIndex((s) => s.equipmentId === id);
  if (!isAfloat(ship.lifecycle) || slotIndex < 0 || ship.input.slot !== slotIndex) return null;
  return fireLine(ship, id, { fireT: now, mkId }).torp;
}

/** Build one torpedo line's Equipment row. The tubes are the truth; the
 *  slot pool is their summary (see the header). */
function torpedoLine(id: TorpedoLineId): Equipment {
  return {
    id,
    isWeapon: EQUIPMENT_IS_WEAPON[id], // shared weapon/ability split — single source
    tick(ship): void {
      // The tubes were stepped by the `stepLaunchers` row; re-derive the pair.
      syncTorpedoSlot(ship);
    },
    activate(ctx) {
      // bornAt = the VALIDATED fire time (D1): a back-dated torpedo is then
      // pre-stepped by the World to where it belongs this tick.
      const { torp, denial } = fireLine(ctx.ship, id, { fireT: ctx.fireT, mkId: ctx.mkId });
      if (torp) ctx.spawnBallistic(torp);
      return denial === null ? { ok: true } : { ok: false, reason: denial };
    },
  };
}

/** The HEAVY torpedo — the family's reference torpedo (CONFIG.torpedo). */
export const torpedoEquipment: Equipment = torpedoLine('heavyTorpedo');

/** The LIGHT torpedo (Story 8.13, catalog-v3 R18). */
export const lightTorpedoEquipment: Equipment = torpedoLine('lightTorpedo');

/** The SUPERCAVITATING torpedo (Story 10.5 — a slot weapon again: R4's
 *  reload, amendment 8(e)'s damage tiers). */
export const supercavTorpedoEquipment: Equipment = torpedoLine('supercavTorpedo');
