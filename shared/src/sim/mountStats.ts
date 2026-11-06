// THE LAUNCHERS AND RACKS A SHIP HOLDS (Story 10.6, Eric 2026-11-05, R4 / R6 /
// R7 / R10) — the per-ship counts the four one-off WEAPON cards buy, and the
// one place they become a weapon row's capacity.
//
// CAPACITY LEFT THE TIERS (R4: "Additional torpedo tubes and mine rack slots
// and special shell extra shots and such will no longer appear in tiered
// upgrades at all"). It lives in four FAMILY-WIDE per-ship counts, each a
// whitelisted top-level stat path a one-off card steps `add: 1`:
//   - `torpedoLaunchers` 1 | 2 — the FORE launcher every torpedo brings, plus
//     the AFT one (AFT TORPEDO LAUNCHER);
//   - `tubesPerLauncher` 1 | 2 — SECOND LAUNCHER TUBE: +1 tube on EVERY
//     launcher held (maximum four tubes);
//   - `mineRacks` 1 | 2 — SECOND MINE RACK: a whole second rack;
//   - `rackBonus` 0 | 1 — EXPANDED MINE RACKS: +1 capacity on EACH rack.
// They apply to whichever torpedo or mine the ship holds (R10), in either
// card order.
//
// THE SINGLE-POOL READING (Story 10.6, Wave 1): until the launcher and rack
// models land, a weapon row's `maxAmmo` is the TOTAL the hull carries —
// launchers × tubes (× the row's own Tier I tube count, 1) for a torpedo,
// racks × (per-rack base + bonus) for a mine — so every pool reader keeps
// working and the total is already right: at most 4 tubes, 8 naval / fouling
// mines, 4 captive. The per-unit truth (one clock per tube, one per rack)
// will read the four counts directly.
//
// A ONE-SHOT MULTIPLY that consumes the value it overwrites, so it runs in
// sim/stats.ts clampStats ONLY (the RANGE multiply's precedent), after the
// integer floor. Pure, zero I/O.

import type { EffectiveStats } from './stats.js';
import { familyMembers } from './loadout.js';

/** The four mount counts at zero cards: one fore launcher with its tube, one
 *  rack with no bonus (R6 / R7 — what the Tier I card brings). */
export const BASE_MOUNTS = Object.freeze({ torpedoLaunchers: 1, tubesPerLauncher: 1, mineRacks: 1, rackBonus: 0 });

/** A whole number in [lo, hi] (non-finite → lo) — the malformed-data guard. */
const wholeIn = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo);

/**
 * Floor and bound the four counts (clampStats): each one-off is a cap-1 card,
 * so a count sits between its base and base + 1 — a malformed fold (an
 * injected catalog) can never mount a third launcher or a negative bonus.
 */
export function clampMounts(stats: EffectiveStats): void {
  stats.torpedoLaunchers = wholeIn(stats.torpedoLaunchers, BASE_MOUNTS.torpedoLaunchers, BASE_MOUNTS.torpedoLaunchers + 1);
  stats.tubesPerLauncher = wholeIn(stats.tubesPerLauncher, BASE_MOUNTS.tubesPerLauncher, BASE_MOUNTS.tubesPerLauncher + 1);
  stats.mineRacks = wholeIn(stats.mineRacks, BASE_MOUNTS.mineRacks, BASE_MOUNTS.mineRacks + 1);
  stats.rackBonus = wholeIn(stats.rackBonus, BASE_MOUNTS.rackBonus, BASE_MOUNTS.rackBonus + 1);
}

/** The torpedo and mine family rows, in `EQUIPMENT_IDS` order. */
const TORPEDO_ROWS = familyMembers('torpedo');
const MINE_ROWS = familyMembers('mine');

/**
 * THE ONE-SHOT CAPACITY MULTIPLY (clampStats only, after the integer floor):
 * every torpedo row holds row × launchers × tubes, every mine row holds
 * racks × (row + bonus). At the base counts it is the exact identity.
 */
export function applyMountCapacity(stats: EffectiveStats): void {
  const eq = stats.equipment;
  for (const id of TORPEDO_ROWS) eq[id].maxAmmo = eq[id].maxAmmo * stats.torpedoLaunchers * stats.tubesPerLauncher;
  for (const id of MINE_ROWS) eq[id].maxAmmo = stats.mineRacks * (eq[id].maxAmmo + stats.rackBonus);
}
