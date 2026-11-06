// THE MINE RACKS (Story 10.6, Eric 2026-11-05, R7 / R14 / R17 / R18) —
// sim/racks.ts as laws:
//
//   (1) capacity is the folded row's, per rack — one helper, no re-derivation;
//   (2) ONE clock per rack: starts the moment the rack is short, restores ONE
//       mine per cycle, carries overshoot, stops when full; two racks' clocks
//       run independently;
//   (3) drops alternate strictly A, B, A, B (R17); the turn rack empty → the
//       next rack holding a mine drops and the turn passes on from it (R18);
//       no rack holds one → refused;
//   (4) lifecycle: create full, resize arrives full with running clocks
//       untouched, rescale by new ÷ old, INSTANT RELOAD one mine per rack
//       (R14), the slot summary.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  MINE_EQUIPMENT_IDS,
  dropMine,
  effectiveStats,
  equipmentMaxAmmo,
  hullEnvelope,
  initialRacks,
  instantReloadRacks,
  rackCapacity,
  rackSummary,
  rescaleRackReloads,
  resizeRacks,
  tickRacks,
  type RackBank,
} from '../index.js';

const DT = CONFIG.tick.simDtMs;
const RELOAD = 20 * DT; // an arbitrary whole number of ticks
const CLS = hullEnvelope('warspite');

const bank = (ns: number[], next = 0, clocks: number[] = ns.map(() => 0)): RackBank => ({
  racks: ns.map((n, i) => ({ n, reloadMsLeft: clocks[i] })),
  next,
});
const counts = (b: RackBank): number[] => b.racks.map((r) => r.n);
const clocks = (b: RackBank): number[] => b.racks.map((r) => r.reloadMsLeft);
const tick = (b: RackBank, cap: number, ticks: number): void => {
  for (let i = 0; i < ticks; i += 1) tickRacks(b, cap, RELOAD, DT);
};

describe('rack capacity', () => {
  it.each(MINE_EQUIPMENT_IDS)('%s: racks × per-rack capacity IS the folded pool, at every card mix', (id) => {
    const base = rackCapacity(effectiveStats(CLS, [id]), id);
    for (const cards of [[id], [id, 'secondMineRack'], [id, 'expandedMineRacks'], [id, 'expandedMineRacks', 'secondMineRack']]) {
      const stats = effectiveStats(CLS, cards);
      const cap = rackCapacity(stats, id);
      expect(Number.isInteger(cap)).toBe(true);
      expect(cap * stats.mineRacks).toBe(equipmentMaxAmmo(stats, id));
      expect(cap).toBe(base + stats.rackBonus); // EXPANDED: +1 on EACH rack
      const b = initialRacks(stats, id);
      expect(counts(b)).toEqual(Array.from({ length: stats.mineRacks }, () => cap)); // arrives FULL
      expect(clocks(b).every((c) => c === 0)).toBe(true);
      expect(b.next).toBe(0);
    }
  });
});

describe('one clock per rack', () => {
  it('starts the moment the rack is short, restores one mine per cycle, stops when full', () => {
    const b = bank([3]);
    tick(b, 3, 50);
    expect(clocks(b)).toEqual([0]); // a full rack runs no clock
    expect(dropMine(b, RELOAD)).toBe(0);
    expect(b.racks[0]).toEqual({ n: 2, reloadMsLeft: RELOAD }); // started at once
    expect(dropMine(b, RELOAD)).toBe(0);
    tick(b, 3, 5);
    expect(b.racks[0]).toEqual({ n: 1, reloadMsLeft: RELOAD - 5 * DT }); // a second drop never restarts the cycle
    tick(b, 3, 15);
    expect(b.racks[0]).toEqual({ n: 2, reloadMsLeft: RELOAD }); // one mine, next cycle running
    tick(b, 3, 20);
    expect(b.racks[0]).toEqual({ n: 3, reloadMsLeft: 0 }); // full: stopped
    tick(b, 3, 100);
    expect(b.racks[0]).toEqual({ n: 3, reloadMsLeft: 0 });
  });

  it('carries overshoot: a k-deep deficit refills in exactly k cycles', () => {
    const odd = 7 * DT + DT / 2; // a reload that is not a whole number of ticks
    const b = bank([3]);
    for (let k = 0; k < 3; k += 1) dropMine(b, odd);
    let ticks = 0;
    while (b.racks[0].n < 3) {
      tickRacks(b, 3, odd, DT);
      ticks += 1;
    }
    expect(ticks).toBe(Math.ceil((3 * odd) / DT));
  });

  it("two racks' clocks run at once and independently", () => {
    const b = bank([3, 3]);
    dropMine(b, RELOAD); // A
    tick(b, 3, 4);
    dropMine(b, RELOAD); // B
    expect(clocks(b)).toEqual([RELOAD - 4 * DT, RELOAD]);
    tick(b, 3, 16);
    expect(counts(b)).toEqual([3, 2]);
    expect(clocks(b)).toEqual([0, RELOAD - 16 * DT]);
  });
});

describe('alternation (R17, R18)', () => {
  it('two racks drop A, B, A, B', () => {
    const b = bank([3, 3]);
    expect([dropMine(b, RELOAD), dropMine(b, RELOAD), dropMine(b, RELOAD), dropMine(b, RELOAD)]).toEqual([0, 1, 0, 1]);
    expect(counts(b)).toEqual([1, 1]);
    expect(clocks(b).every((c) => c > 0)).toBe(true); // both clocks running
  });

  it('the turn rack empty: the next rack holding a mine drops, and the turn passes on from it', () => {
    const b = bank([0, 2], 0, [RELOAD, RELOAD]);
    expect(dropMine(b, RELOAD)).toBe(1); // A's turn, A empty → B drops
    expect(b.next).toBe(0); // the turn passes on from B: A's again
    expect(dropMine(b, RELOAD)).toBe(1); // A still empty → B again
    expect(counts(b)).toEqual([0, 0]);
  });

  it('no rack holds a mine: refused, nothing changes', () => {
    const b = bank([0, 0], 1, [300, 700]);
    const before = JSON.stringify(b);
    expect(dropMine(b, RELOAD)).toBeNull();
    expect(JSON.stringify(b)).toBe(before);
  });

  it('one rack is its own alternation', () => {
    const b = bank([2]);
    expect([dropMine(b, RELOAD), dropMine(b, RELOAD), dropMine(b, RELOAD)]).toEqual([0, 0, null]);
  });

  it('the general law: the rack that drops is the first holding a mine from the turn onward', () => {
    for (const ns of [[1, 1], [2, 0], [0, 3], [1, 0], [3, 1]]) {
      for (const next of [0, 1]) {
        const b = bank(ns, next, ns.map(() => RELOAD));
        const want = b.racks[next].n > 0 ? next : b.racks[1 - next].n > 0 ? 1 - next : null;
        const got = dropMine(b, RELOAD);
        expect(got).toBe(want);
        if (got !== null) expect(b.next).toBe((got + 1) % 2);
      }
    }
  });
});

describe('lifecycle', () => {
  it('resize: a second rack arrives FULL; the first keeps its mines and its clock', () => {
    const b = bank([1], 0, [333]);
    resizeRacks(b, 2, 3, 3); // SECOND MINE RACK
    expect(b.racks).toEqual([
      { n: 1, reloadMsLeft: 333 },
      { n: 3, reloadMsLeft: 0 },
    ]);
  });

  it('resize: an expanded seat arrives holding its mine on EACH rack; running clocks untouched', () => {
    const b = bank([1, 3], 1, [333, 0]);
    resizeRacks(b, 2, 4, 3); // EXPANDED MINE RACKS
    expect(b.racks).toEqual([
      { n: 2, reloadMsLeft: 333 },
      { n: 4, reloadMsLeft: 0 },
    ]);
    expect(b.next).toBe(1); // the turn is untouched
  });

  it('resize is idempotent and never over-fills', () => {
    const b = bank([2, 3], 0, [100, 0]);
    resizeRacks(b, 2, 3, 3);
    expect(b.racks).toEqual([
      { n: 2, reloadMsLeft: 100 },
      { n: 3, reloadMsLeft: 0 },
    ]);
  });

  it('rescale keeps the progress fraction per rack', () => {
    const b = bank([1, 3], 0, [8000, 0]);
    rescaleRackReloads(b, 0.75);
    expect(clocks(b)).toEqual([6000, 0]);
  });

  it('INSTANT RELOAD gives exactly ONE mine per rack (R14)', () => {
    const b = bank([0, 2, 3].slice(0, 2), 1, [400, 900]);
    instantReloadRacks(b, 3, RELOAD);
    // Rack A: 0 → 1, still short → a fresh full cycle. Rack B: 2 → 3, full → stopped.
    expect(b.racks).toEqual([
      { n: 1, reloadMsLeft: RELOAD },
      { n: 3, reloadMsLeft: 0 },
    ]);
    expect(b.next).toBe(1);
    const full = bank([3, 3]);
    instantReloadRacks(full, 3, RELOAD);
    expect(full).toEqual(bank([3, 3])); // a full rack gains nothing
  });

  it('INSTANT RELOAD never hands out a second free mine on the next tick', () => {
    const b = bank([0], 0, [DT]);
    instantReloadRacks(b, 3, RELOAD);
    tickRacks(b, 3, RELOAD, DT);
    expect(b.racks[0].n).toBe(1);
  });

  it('the slot summary: every mine held, and the soonest running clock', () => {
    expect(rackSummary(bank([3, 3]))).toEqual({ n: 6, reloadMsLeft: 0 });
    expect(rackSummary(bank([1, 2], 0, [900, 250]))).toEqual({ n: 3, reloadMsLeft: 250 });
    expect(rackSummary(bank([]))).toEqual({ n: 0, reloadMsLeft: 0 });
  });
});
