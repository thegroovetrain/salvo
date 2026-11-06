// THE MINE RACKS — stern racks, one reload clock each, dropping in turn
// (Story 10.6, Eric 2026-11-05, R7 / R14 / R17 / R18, epic-10 amendment 12).
//
// WHAT A SHIP HOLDS. A ship holding ANY mine (naval, fouling, captive — one
// kind per slot) has `stats.mineRacks` racks (1, or 2 with SECOND MINE RACK),
// each holding up to that mine row's PER-RACK capacity (`rackCapacity` — the
// row's base, +1 with EXPANDED MINE RACKS). Both racks are at the stern: a
// rack has no geometry, the drop point is the mine's own rear-sector law.
//
// ONE CLOCK PER RACK (R7: "Each rack has ONE cooldown" that starts "as soon as
// one is missing a mine"). It is the per-round pool machine the server ran per
// SLOT before this story (server equipment/ammo.ts `consume` / `tickReload`),
// now per RACK and shared so both sides run it:
//   - a drop takes one mine and starts the clock ONLY IF IT IS IDLE — a second
//     drop mid-cycle never restarts it;
//   - each time the clock crosses zero the rack gains ONE mine and, if still
//     short, restarts WITH OVERSHOOT CARRY (a k-deep deficit refills in
//     exactly k × reloadMs);
//   - a full rack's clock is pinned at 0.
// Two racks' clocks run at once, independently.
//
// THE TURN (R17 "They alternate per drop"; R18 "Next rack in line with an
// available mine would drop"). `RackBank.next` is the rack whose turn it is.
// A drop comes from the first rack AT OR AFTER the turn (wrapping) that holds
// a mine, and the turn then passes to the rack after THE ONE THAT DROPPED. So
// two stocked racks drop A, B, A, B; with A empty on its turn B drops and the
// turn is A's again. No rack holds a mine → the drop is refused (`null` — the
// caller's `cooling` denial) and nothing changes.
//
// THE STATE is a `RackBank`: the `racks` array is also the `OwnShip.racks`
// wire shape (`RackState` = the `{ n, reloadMsLeft }` pair of `WeaponAmmo`);
// the turn cursor stays beside it and never travels (the server alone decides
// which rack drops). MUTATED IN PLACE on the tick path.
//
// Capacity and reload ARRIVE from the caller's folded stats (`rackCapacity`,
// `equipmentReloadMs`) — nothing here reads CONFIG. Pure, zero I/O.

import type { MineEquipmentId } from './arcs.js';
import type { EffectiveStats } from './stats.js';

/** The folded fields the rack model reads — `EffectiveStats` satisfies it. */
export type RackStats = Pick<EffectiveStats, 'equipment' | 'mineRacks'>;

/** One rack: mines held and its ONE clock (ms until the next mine is restored; 0 = idle). */
export interface RackState {
  n: number;
  reloadMsLeft: number;
}

/** A ship's racks and whose turn it is to drop. */
export interface RackBank {
  racks: RackState[];
  /** Index of the rack whose turn it is (R17). */
  next: number;
}

/**
 * THE PER-RACK CAPACITY of mine row `id` on these folded stats — THE one
 * helper. The fold already made the row's `maxAmmo` the hull's total, racks ×
 * (base + `rackBonus`) (sim/mountStats.ts `applyMountCapacity`); this divides
 * the racks back out, so nothing is re-derived from CONFIG or the cards.
 */
export function rackCapacity(stats: RackStats, id: MineEquipmentId): number {
  return Math.floor(stats.equipment[id].maxAmmo / rackCount(stats));
}

/** How many racks these stats mount (at least one). */
export function rackCount(stats: Pick<EffectiveStats, 'mineRacks'>): number {
  return Number.isFinite(stats.mineRacks) ? Math.max(1, Math.floor(stats.mineRacks)) : 1;
}

// --- Lifecycle ----------------------------------------------------------------

/** The racks a ship gets when its mine slot fills: every rack FULL, clocks idle, the first rack's turn (I3). */
export function initialRacks(stats: RackStats, id: MineEquipmentId): RackBank {
  const capacity = rackCapacity(stats, id);
  return resizeRacks({ racks: [], next: 0 }, rackCount(stats), capacity, capacity);
}

/**
 * Bring a bank to `count` racks of `capacity` IN PLACE — call after any card,
 * with the capacity BEFORE the card as `prevCapacity`. A NEW rack arrives
 * FULL with an idle clock; an EXPANDED seat arrives holding its mine (each
 * existing rack gains `capacity − prevCapacity`, never past `capacity`);
 * every running clock is untouched, and so is the turn (I3). A rack the seat
 * fills to the brim keeps a stale clock for one tick at most — `tickRacks`
 * pins a full rack's clock to 0. A smaller count (a reset) truncates.
 * Returns `bank`.
 */
export function resizeRacks(bank: RackBank, count: number, capacity: number, prevCapacity: number): RackBank {
  const seats = Math.max(0, capacity - prevCapacity);
  const kept = Math.min(bank.racks.length, count);
  bank.racks.length = kept;
  for (let i = 0; i < kept; i += 1) {
    const r = bank.racks[i];
    r.n = Math.min(capacity, r.n + seats);
  }
  while (bank.racks.length < count) bank.racks.push({ n: capacity, reloadMsLeft: 0 });
  if (bank.next >= bank.racks.length) bank.next = 0;
  return bank;
}

/** `resizeRacks` straight from the stats before and after a card. */
export function resizeRacksFor(
  bank: RackBank,
  prevStats: RackStats,
  stats: RackStats,
  id: MineEquipmentId,
): RackBank {
  return resizeRacks(bank, rackCount(stats), rackCapacity(stats, id), rackCapacity(prevStats, id));
}

/** Overwrite `into` with the wire's racks (resizing it) — the client's correction; the turn cursor is not on the wire. */
export function copyRacks(into: RackState[], from: readonly RackState[]): RackState[] {
  into.length = from.length;
  for (let i = 0; i < from.length; i += 1) {
    const dst = into[i] ?? (into[i] = { n: 0, reloadMsLeft: 0 });
    dst.n = from[i].n;
    dst.reloadMsLeft = from[i].reloadMsLeft;
  }
  return into;
}

/**
 * ONE STEP of every rack's clock, IN PLACE (see the header): a full rack's
 * clock is pinned to 0; a short rack's counts down, and on crossing zero the
 * rack gains ONE mine and — if still short — restarts carrying the overshoot.
 */
export function tickRacks(bank: RackBank, capacity: number, reloadMs: number, dtMs: number): void {
  for (const r of bank.racks) {
    if (r.n >= capacity) {
      r.reloadMsLeft = 0;
      continue;
    }
    r.reloadMsLeft -= dtMs;
    if (r.reloadMsLeft <= 0) {
      r.n += 1;
      r.reloadMsLeft = r.n < capacity ? r.reloadMsLeft + reloadMs : 0;
    }
  }
}

/** The rack a drop would come from right now (R17 / R18), or −1 when no rack holds a mine. Pure. */
export function nextDropRack(bank: RackBank): number {
  const count = bank.racks.length;
  for (let k = 0; k < count; k += 1) {
    const i = (bank.next + k) % count;
    if (bank.racks[i].n > 0) return i;
  }
  return -1;
}

/**
 * DROP ONE MINE (R17 / R18): the first rack at or after the turn that holds a
 * mine gives it up, its clock starts if it was idle (`reloadMs` = the held
 * mine's FOLDED reload), and the turn passes to the rack after it. Returns the
 * rack that dropped, or `null` — nothing changed — when no rack holds a mine.
 */
export function dropMine(bank: RackBank, reloadMs: number): number | null {
  const i = nextDropRack(bank);
  if (i < 0) return null;
  const r = bank.racks[i];
  r.n -= 1;
  if (r.reloadMsLeft <= 0) r.reloadMsLeft = reloadMs;
  bank.next = (i + 1) % bank.racks.length;
  return i;
}

/**
 * MID-RELOAD RESCALE (the 2026-08-04 progress-fraction rule): when the folded
 * mine `reloadMs` changes, call with `ratio = newMs / oldMs`; every RUNNING
 * rack clock is scaled. A ratio that is not a positive finite number is a
 * no-op.
 */
export function rescaleRackReloads(bank: RackBank, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  for (const r of bank.racks) {
    if (r.reloadMsLeft > 0) r.reloadMsLeft *= ratio;
  }
}

/**
 * INSTANT RELOAD (R14, "One mine per rack"): every rack that is short gains
 * exactly ONE mine now. THE CLOCK, stated honestly: a rack that is then full
 * stops (0); a rack still short starts a FRESH FULL cycle (`reloadMs`) — the
 * cycle that was running is the one that was just finished, exactly what
 * `tickRacks` does after a natural restore (a zero clock on a short rack would
 * hand out a second free mine on the next tick). A full rack is untouched;
 * the turn is untouched.
 */
export function instantReloadRacks(bank: RackBank, capacity: number, reloadMs: number): void {
  for (const r of bank.racks) {
    if (r.n >= capacity) continue;
    r.n += 1;
    r.reloadMsLeft = r.n < capacity ? reloadMs : 0;
  }
}

/**
 * THE HOTBAR SUMMARY — the `{ n, reloadMsLeft }` pair the mine slot's
 * `EquipmentState` / `OwnShip.ammo[slot]` carries: `n` = mines held across
 * every rack, `reloadMsLeft` = the SOONEST running rack clock (0 when none
 * runs).
 */
export function rackSummary(bank: RackBank): { n: number; reloadMsLeft: number } {
  let n = 0;
  let soonest = Infinity;
  for (const r of bank.racks) {
    n += r.n;
    if (r.reloadMsLeft > 0 && r.reloadMsLeft < soonest) soonest = r.reloadMsLeft;
  }
  return { n, reloadMsLeft: Number.isFinite(soonest) ? soonest : 0 };
}
