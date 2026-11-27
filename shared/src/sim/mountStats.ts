// THE LAUNCHERS AND RACKS A SHIP HOLDS (Story 10.6, Eric 2026-11-05, R4 / R6 /
// R7 / R10) — the per-ship counts the one-off WEAPON cards buy, and the one
// place they become a weapon row's capacity.
//
// CAPACITY LEFT THE TIERS (R4: "Additional torpedo tubes and mine rack slots
// and special shell extra shots and such will no longer appear in tiered
// upgrades at all"). It lives in four FAMILY-WIDE per-ship counts:
//   - `torpedoLaunchers` 1 | 2 — the FORE launcher every torpedo brings, plus
//     the AFT one (AFT TORPEDO LAUNCHER, a card stepping it `add: 1`);
//   - `tubesPerLauncher` — the HELD TORPEDO KIND'S own tube count on EVERY
//     launcher (Eric 2026-11-25: `CONFIG.<kind>.tubesPerLauncher`; 1 with no
//     torpedo held). DERIVED, never card-written: the SECOND LAUNCHER TUBE
//     card that stepped it 1 → 2 is DELETED. `deriveTubesPerLauncher` writes
//     it in effectiveStats, before the clamps;
//   - `mineRacks` 1 | 2 — SECOND MINE RACK: a whole second rack;
//   - `rackBonus` 0 | 1 — EXPANDED MINE RACKS: +1 capacity on EACH rack.
// They apply to whichever torpedo or mine the ship holds (R10), in either
// card order.
//
// THE ROW'S `maxAmmo` IS THE HULL'S TOTAL — launchers × tubes (× the row's
// own Tier I per-tube count, 1) for a torpedo, racks × (per-rack base + bonus)
// for a mine — so every pool reader (the hotbar summary, a bot's "how many do
// I hold") reads the right total. THE PER-UNIT TRUTH lives in the two models
// that read these counts (Wave 2): sim/launchers.ts (one clock per tube) and
// sim/racks.ts (one clock per rack; `rackCapacity` divides the racks back out
// of the total).
//
// A ONE-SHOT MULTIPLY that consumes the value it overwrites, so it runs in
// sim/stats.ts clampStats ONLY (the RANGE multiply's precedent), after the
// integer floor. Pure, zero I/O.

import { CONFIG } from '../constants.js';
import type { EffectiveStats } from './stats.js';
import { cardCounts, lineForEquipment, type Catalog } from './catalog.js';
import { MAX_TUBES_PER_LAUNCHER } from './launchers.js';
import { familyMembers, type EquipmentId } from './loadout.js';

/** The four mount counts at zero cards: one fore launcher with one tube (no
 *  torpedo held), one rack with no bonus (R6 / R7). */
export const BASE_MOUNTS = Object.freeze({ torpedoLaunchers: 1, tubesPerLauncher: 1, mineRacks: 1, rackBonus: 0 });

/** A whole number in [lo, hi] (non-finite → lo) — the malformed-data guard. */
const wholeIn = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo);

/**
 * Floor and bound the four counts (clampStats): each one-off is a cap-1 card,
 * so a count sits between its base and base + 1, and the tube count between 1
 * and `MAX_TUBES_PER_LAUNCHER` — a malformed fold (an injected catalog, a
 * hostile tune of a kind's tube count) can never mount a third launcher, a
 * fourth tube or a negative bonus.
 */
export function clampMounts(stats: EffectiveStats): void {
  stats.torpedoLaunchers = wholeIn(stats.torpedoLaunchers, BASE_MOUNTS.torpedoLaunchers, BASE_MOUNTS.torpedoLaunchers + 1);
  stats.tubesPerLauncher = wholeIn(stats.tubesPerLauncher, BASE_MOUNTS.tubesPerLauncher, MAX_TUBES_PER_LAUNCHER);
  stats.mineRacks = wholeIn(stats.mineRacks, BASE_MOUNTS.mineRacks, BASE_MOUNTS.mineRacks + 1);
  stats.rackBonus = wholeIn(stats.rackBonus, BASE_MOUNTS.rackBonus, BASE_MOUNTS.rackBonus + 1);
}

/** The torpedo and mine family rows, in `EQUIPMENT_IDS` order. */
const TORPEDO_ROWS = familyMembers('torpedo');
const MINE_ROWS = familyMembers('mine');

/** Each torpedo kind's CONFIG block — the heavy's is `CONFIG.torpedo` (the
 *  legacy rename, sim/stats.ts baseEquipment). Read at call time so a tune
 *  reaches it. */
function kindConfig(id: EquipmentId): { tubesPerLauncher: number } | undefined {
  if (id === 'lightTorpedo') return CONFIG.lightTorpedo;
  if (id === 'heavyTorpedo') return CONFIG.torpedo;
  if (id === 'supercavTorpedo') return CONFIG.supercavTorpedo;
  return undefined;
}

/**
 * THE TUBES ON EVERY LAUNCHER (Eric 2026-11-25): the HELD torpedo kind's
 * `CONFIG.<kind>.tubesPerLauncher`, or the base 1 when the cards hold no
 * torpedo. Written in effectiveStats after the card fold, before clampStats
 * (which bounds it). A legal hand holds one torpedo kind (one per slot); a
 * malformed hand holding two reads the first in `EQUIPMENT_IDS` order, so the
 * answer never depends on card order.
 */
export function deriveTubesPerLauncher(stats: EffectiveStats, cards: readonly string[], catalog: Catalog): void {
  stats.tubesPerLauncher = BASE_MOUNTS.tubesPerLauncher;
  if (cards.length === 0) return;
  const counts = cardCounts(cards, catalog);
  for (const id of TORPEDO_ROWS) {
    const line = lineForEquipment(id, catalog);
    const cfg = kindConfig(id);
    if (line === undefined || cfg === undefined || (counts.get(line.id) ?? 0) <= 0) continue;
    stats.tubesPerLauncher = cfg.tubesPerLauncher;
    return;
  }
}

/**
 * THE ONE-SHOT CAPACITY MULTIPLY (clampStats only, after the integer floor):
 * every torpedo row holds row × launchers × tubes (the held kind's), every
 * mine row holds
 * racks × (row + bonus). At the base counts it is the exact identity.
 */
export function applyMountCapacity(stats: EffectiveStats): void {
  const eq = stats.equipment;
  for (const id of TORPEDO_ROWS) eq[id].maxAmmo = eq[id].maxAmmo * stats.torpedoLaunchers * stats.tubesPerLauncher;
  for (const id of MINE_ROWS) eq[id].maxAmmo = stats.mineRacks * (eq[id].maxAmmo + stats.rackBonus);
}
