// THE FOG TOLL'S PERCEPTION COST (Story 9.10 spec, Performance — Eric: "make
// it performant"): sixteen captains and ninety-six drones (the 16-captain
// lobby's full fleet load, Story 9.8's 16/8/4 waves) on a 5,000 u square of
// open water, twenty armed mines, the zone started and the FIELD cut at ~8 %
// coverage (the top of the band) — and the question is whether `observe()`
// for all sixteen captains, every sight site now paying the fog toll through
// the quick-reject raster and the shared midpoint march, fits the 50 ms tick
// with room to spare. The drones' `shipSees` (the same `withinSight`) is
// timed alongside for the whole fleet against every captain, and the
// raster's own costs — one WHOLE rebuild and one SLICED tick — are pinned
// beside it.
//
// THE PATTERN is machineGunFlashCost.test.ts's perf pin: a fresh fixture per
// run built OUTSIDE the clock, `performance.now()` around the work, best-of-
// 5, the numbers printed under `HC_PERF_LOG=1`, and the ASSERTION is the tick
// budget. The cut goes in through the World's test-only seam at the quantile
// for 8 % over the arena lattice (production's one writer is the controller).
//
// RECORDED 2026-10-15 on the dev machine (Darwin 25.4, Node 22), seed 910,
// run alone: see the HC_PERF_LOG line — it re-measures on the machine that
// runs it.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_HORN_ID, SHIP_CLASS_IDS, droneHullOf, fogCutForTarget, fogLattice, type DroneSizeId } from '@salvo/shared';
import { observe } from '../game/perception.js';
import { shipSees, type SightField } from '../game/signals.js';
import { World, type ShipRecord } from '../game/world.js';

const CAPTAINS = 16;
const DRONES = 96;
const MINES = 20;
const HALF_U = 2500; // a 5,000 u square
const COVERAGE = 0.08;
const TICK_BUDGET_MS = 50;
/** The WHOLE rebuild is a test-seam cost production never pays (it slices);
 *  it is pinned to the tick so the number that justifies slicing stays
 *  visible — ~10 ms on a quiet dev box, ~25 ms best-of-5 with vitest's
 *  parallel workers saturating the machine. */
const WHOLE_REBUILD_BUDGET_MS = TICK_BUDGET_MS;
const SLICE_BUDGET_MS = 2;

const SIZES: readonly DroneSizeId[] = ['small', 'medium', 'large'];

/** A deterministic lattice: 112 hulls on a 350 u grid (every hull has
 *  neighbours inside sight and the halo; nobody sees the whole field),
 *  twenty mines on a diagonal, the zone started, the field cut at ~8 %
 *  coverage over the arena. Built outside the clock. */
function field(seed: number): { w: World; captains: ShipRecord[]; drones: ShipRecord[] } {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0; // open water: the cost under test is the fog's, not the coastline's
  w.startZone(0);
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
  for (let m = 0; m < MINES; m++) {
    const t = -HALF_U + ((HALF_U * 2) / MINES) * (m + 0.5);
    w.mines.set(`mine${m}`, { id: `mine${m}`, ownerId: captains[m % CAPTAINS].id, x: t, y: -t, armedAt: 0, kind: 'naval', hp: 10 });
  }
  const ring = w.zoneLiveRing;
  const lattice = fogLattice(ring.cx, ring.cy, ring.r, CONFIG.fog.quantileLattice);
  w.setFogCutForTest(fogCutForTarget(w.fogFieldForTest(), w.now, lattice, COVERAGE));
  return { w, captains, drones };
}

interface Run {
  observeMs: number;
  dronesMs: number;
  wholeMs: number;
  sliceMs: number;
  contacts: number;
  dronePairs: number;
}

interface RasterSeams {
  stepFog(): void;
  fogRasterBack: unknown;
}

function measure(seed: number): Run {
  const { w, captains, drones } = field(seed);
  expect(w.mines.size).toBe(MINES);
  expect(Math.abs(w.fogCoverageEstimate - COVERAGE)).toBeLessThanOrEqual(0.01);
  let contacts = 0;
  const t0 = performance.now();
  for (const c of captains) contacts += observe(w, c.id).contacts.length;
  const observeMs = performance.now() - t0;
  // The fleet's eye: every drone against every captain through the ONE
  // per-tick field (drones.ts builds it once per tick exactly like this).
  const t1 = performance.now();
  const sight: SightField = { islands: w.map.islands, fogToll: (ax, ay, bx, by) => w.fogTollAlong(ax, ay, bx, by) };
  let dronePairs = 0;
  for (const d of drones) for (const c of captains) if (shipSees(d, c, sight)) dronePairs += 1;
  const dronesMs = performance.now() - t1;
  // The raster: one whole rebuild (the test seam) and one sliced production tick.
  const t2 = performance.now();
  w.setFogCutForTest(w.fogCut);
  const wholeMs = performance.now() - t2;
  const seams = w as unknown as RasterSeams;
  w.now += CONFIG.fog.refreshMs; // the next stepFog refreshes: a build begins and its first slice runs
  const t3 = performance.now();
  seams.stepFog();
  const sliceMs = performance.now() - t3;
  expect(seams.fogRasterBack).not.toBeNull(); // the build is in flight — the tick really was a slice
  return { observeMs, dronesMs, wholeMs, sliceMs, contacts, dronePairs };
}

describe('the fog toll in perception — 16 captains + 96 drones, the field at 8 % coverage, 20 mines (Story 9.10 perf pin)', () => {
  it('observe() for all 16 captains (and shipSees for the whole fleet) best-of-5 stays under the 50 ms tick; a sliced raster tick under 2 ms; a whole rebuild inside a tick', () => {
    const runs: Run[] = [];
    for (let run = 0; run < 5; run += 1) runs.push(measure(910));
    const best = runs.reduce((a, b) => (b.observeMs < a.observeMs ? b : a));
    const bestDrones = Math.min(...runs.map((r) => r.dronesMs));
    const bestWhole = Math.min(...runs.map((r) => r.wholeMs));
    const bestSlice = Math.min(...runs.map((r) => r.sliceMs));
    // Same seed, same water: every run saw the identical field.
    for (const r of runs) {
      expect(r.contacts).toBe(runs[0].contacts);
      expect(r.dronePairs).toBe(runs[0].dronePairs);
    }
    // The fixture really exercises the toll: the sight sites had neighbours to toll.
    expect(best.contacts).toBeGreaterThan(0);
    if (process.env.HC_PERF_LOG) {
      console.log(
        `fog perf: observe() × ${CAPTAINS} best-of-5 ${best.observeMs.toFixed(3)} ms (contacts ${best.contacts}) | ` +
          `shipSees × ${DRONES * CAPTAINS} best-of-5 ${bestDrones.toFixed(3)} ms (seen ${best.dronePairs}) | ` +
          `raster whole ${bestWhole.toFixed(3)} ms, slice ${bestSlice.toFixed(3)} ms | all runs observe: ${runs.map((r) => r.observeMs.toFixed(2)).join(', ')}`,
      );
    }
    expect(best.observeMs + bestDrones).toBeLessThan(TICK_BUDGET_MS);
    expect(bestWhole).toBeLessThan(WHOLE_REBUILD_BUDGET_MS);
    expect(bestSlice).toBeLessThan(SLICE_BUDGET_MS);
  });
});
