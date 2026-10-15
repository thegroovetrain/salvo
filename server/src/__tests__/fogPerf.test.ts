// THE FOG TOLL'S PERCEPTION COST (Story 9.10 spec, Perf): sixteen captains
// and ninety-six drones (the 16-captain lobby's full fleet load, Story 9.8's
// 16/8/4 waves) on a 5,000 u square of open water, twelve MATURE banks
// seeded across the arena at the maximum radius, twenty armed mines — and
// the question is whether `observe()` for all sixteen captains, every sight
// site now paying `fogCostAlong` over twelve banks, fits the 50 ms tick with
// room to spare. The drones' `shipSees` (the same `withinSight`) is timed
// alongside for the whole fleet against every captain.
//
// THE PATTERN is machineGunFlashCost.test.ts's perf pin: a fresh fixture per
// run built OUTSIDE the clock, `performance.now()` around the work, best-of-
// 5, the numbers printed under `HC_PERF_LOG=1`, and the ASSERTION is the tick
// budget. The banks go in through the World's test-only seam (production's
// one writer is the coverage controller, which needs a live zone).
//
// RECORDED 2026-10-15 on the dev machine (Darwin 25.4, Node 22), seed 910,
// run alone: observe() × 16 best-of-5 1.44 ms (33 contacts, 27 fog rows
// across the sixteen frames; the five runs 10.1 / 4.2 / 2.4 / 2.2 / 1.4 ms —
// the first is JIT warm-up), shipSees × 1,536 drone→captain pairs best-of-5
// 0.16 ms (19 seen). Against the 50 ms tick that is ~3 % of the budget for
// the whole lobby's perception. The HC_PERF_LOG line re-measures on the
// machine that runs it.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_HORN_ID, SHIP_CLASS_IDS, droneHullOf, type DroneSizeId } from '@salvo/shared';
import { observe } from '../game/perception.js';
import { shipSees, type SightField } from '../game/signals.js';
import { World, type ShipRecord } from '../game/world.js';

const CAPTAINS = 16;
const DRONES = 96;
const BANKS = 12;
const MINES = 20;
const HALF_U = 2500; // a 5,000 u square
const TICK_BUDGET_MS = 50;

const SIZES: readonly DroneSizeId[] = ['small', 'medium', 'large'];

/** A deterministic lattice: 112 hulls on a 350 u grid (every hull has
 *  neighbours inside sight and the halo; nobody sees the whole field),
 *  twelve R 400 banks on a 4 × 3 grid across the square, twenty mines on a
 *  diagonal. Built outside the clock. */
function field(seed: number): { w: World; captains: ShipRecord[]; drones: ShipRecord[] } {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0; // open water: the cost under test is the fog's, not the coastline's
  const captains: ShipRecord[] = [];
  const drones: ShipRecord[] = [];
  for (let i = 0; i < CAPTAINS + DRONES; i++) {
    const x = -1925 + (i % 12) * 350;
    const y = -1600 + Math.floor(i / 12) * 350;
    if (i < CAPTAINS) {
      const rec = w.addShip(`c${i}`, `C${i}`, 'captain', SHIP_CLASS_IDS[i % SHIP_CLASS_IDS.length], DEFAULT_HORN_ID, { x, y });
      rec.sweepAngle = (i / CAPTAINS) * Math.PI * 2;
      rec.prevSweepAngle = rec.sweepAngle - 0.2;
      captains.push(rec);
    } else {
      const size = SIZES[i % SIZES.length];
      const rec = w.addShip(`d${i}`, 'DRONE', 'fleet', droneHullOf(size), DEFAULT_HORN_ID, { x, y });
      w.drones.add(`d${i}`, size, 1 + Math.floor((i - CAPTAINS) / 6), { x: 0, y: 0 });
      drones.push(rec);
    }
  }
  const bornAt = w.now - CONFIG.fog.growMs - 1000;
  for (let b = 0; b < BANKS; b++) {
    const bx = -HALF_U + (HALF_U * 2 * ((b % 4) + 0.5)) / 4;
    const by = -HALF_U + (HALF_U * 2 * (Math.floor(b / 4) + 0.5)) / 3;
    w.seedFogBank({ id: `fog${b}`, x: bx, y: by, R: CONFIG.fog.radiusMaxU, bornAt, until: bornAt + CONFIG.fog.lifeMs });
  }
  for (let m = 0; m < MINES; m++) {
    const t = -HALF_U + ((HALF_U * 2) / MINES) * (m + 0.5);
    w.mines.set(`mine${m}`, { id: `mine${m}`, ownerId: captains[m % CAPTAINS].id, x: t, y: -t, armedAt: 0, kind: 'naval', hp: 10 });
  }
  return { w, captains, drones };
}

interface Run {
  observeMs: number;
  dronesMs: number;
  contacts: number;
  fogRows: number;
  dronePairs: number;
}

function measure(seed: number): Run {
  const { w, captains, drones } = field(seed);
  expect(w.fogBankCount).toBe(BANKS);
  expect(w.mines.size).toBe(MINES);
  let contacts = 0;
  let fogRows = 0;
  const t0 = performance.now();
  for (const c of captains) {
    const v = observe(w, c.id);
    contacts += v.contacts.length;
    fogRows += v.fog.length;
  }
  const observeMs = performance.now() - t0;
  // The fleet's eye: every drone against every captain through the ONE
  // per-tick field (drones.ts builds it once per tick exactly like this).
  const t1 = performance.now();
  const sight: SightField = { islands: w.map.islands, fogBanks: w.fogBankRecords, now: w.now };
  let dronePairs = 0;
  for (const d of drones) for (const c of captains) if (shipSees(d, c, sight)) dronePairs += 1;
  const dronesMs = performance.now() - t1;
  return { observeMs, dronesMs, contacts, fogRows, dronePairs };
}

describe('the fog toll in perception — 16 captains + 96 drones, 12 mature banks, 20 mines (Story 9.10 perf pin)', () => {
  it('observe() for all 16 captains (and shipSees for the whole fleet) best-of-5 stays under the 50 ms tick', () => {
    const runs: Run[] = [];
    for (let run = 0; run < 5; run += 1) runs.push(measure(910));
    const best = runs.reduce((a, b) => (b.observeMs < a.observeMs ? b : a));
    const bestDrones = Math.min(...runs.map((r) => r.dronesMs));
    // Same seed, same water: every run saw the identical field.
    for (const r of runs) {
      expect(r.contacts).toBe(runs[0].contacts);
      expect(r.fogRows).toBe(runs[0].fogRows);
      expect(r.dronePairs).toBe(runs[0].dronePairs);
    }
    // The fixture really exercises the toll: banks reached the captains'
    // frames and the sight sites had neighbours to toll.
    expect(best.fogRows).toBeGreaterThan(0);
    expect(best.contacts).toBeGreaterThan(0);
    if (process.env.HC_PERF_LOG) {
      console.log(
        `fog perf: observe() × ${CAPTAINS} best-of-5 ${best.observeMs.toFixed(3)} ms (contacts ${best.contacts}, fog rows ${best.fogRows}) | ` +
          `shipSees × ${DRONES * CAPTAINS} best-of-5 ${bestDrones.toFixed(3)} ms (seen ${best.dronePairs}) | all runs observe: ${runs.map((r) => r.observeMs.toFixed(2)).join(', ')}`,
      );
    }
    expect(best.observeMs + bestDrones).toBeLessThan(TICK_BUDGET_MS);
  });
});
