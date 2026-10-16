// THE FOG TOLL'S PERCEPTION COST (Story 9.10 spec, Performance — Eric: "make
// it performant"): sixteen captains and ninety-six drones (the 16-captain
// lobby's full fleet load, Story 9.8's 16/8/4 waves) on a 5,000 u square of
// open water, twenty armed mines, the zone started and the FIELD cut at ~8 %
// coverage (the top of the band) — and the question is whether `observe()`
// for all sixteen captains, every sight site now paying the fog toll through
// the memoized density-lattice walk, fits the 50 ms tick with room to spare.
// The drones' `shipSees` (the same `withinSight`) is timed alongside for the
// whole fleet against every captain, and the memo's FIRST-TOUCH cost — the
// tick right after an epoch bump, when every cell a ray crosses is evaluated
// for the first time — is pinned beside it (with the number of cells it
// evaluated).
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
const COVERAGE = 0.25; // the top of the band (Eric 2026-10-16: 20–25 %)
const TICK_BUDGET_MS = 50;
/** One tick's worth of first-touch memo evaluations after an epoch bump. */
const FIRST_TOUCH_BUDGET_MS = 10;

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
  firstTouchMs: number;
  firstTouchEvals: number;
  observeMs: number;
  dronesMs: number;
  contacts: number;
  dronePairs: number;
}

/** One tick of perception: observe() × 16 then the fleet's shipSees over every (drone, captain) pair. */
function perceptionTick(w: World, captains: ShipRecord[], drones: ShipRecord[]): { ms: number; dronesMs: number; contacts: number; dronePairs: number } {
  let contacts = 0;
  const t0 = performance.now();
  for (const c of captains) contacts += observe(w, c.id).contacts.length;
  const ms = performance.now() - t0;
  // The fleet's eye: every drone against every captain through the ONE
  // per-tick field (drones.ts builds it once per tick exactly like this).
  const t1 = performance.now();
  const sight: SightField = { islands: w.map.islands, fogToll: (ax, ay, bx, by) => w.fogTollAlong(ax, ay, bx, by) };
  let dronePairs = 0;
  for (const d of drones) for (const c of captains) if (shipSees(d, c, sight)) dronePairs += 1;
  return { ms, dronesMs: performance.now() - t1, contacts, dronePairs };
}

function measure(seed: number): Run {
  const { w, captains, drones } = field(seed);
  expect(w.mines.size).toBe(MINES);
  expect(Math.abs(w.fogCoverageEstimate - COVERAGE)).toBeLessThanOrEqual(0.01);
  // FIRST TOUCH: the pin just started an epoch — every cell this tick's rays
  // cross is evaluated for the first time (the production cost of the tick
  // right after a refresh).
  const evals0 = w.fogCellEvals;
  const cold = perceptionTick(w, captains, drones);
  const firstTouchMs = cold.ms + cold.dronesMs;
  const firstTouchEvals = w.fogCellEvals - evals0;
  // WARM: the same tick again inside the epoch — every cell memoized.
  const warm = perceptionTick(w, captains, drones);
  expect(w.fogCellEvals - evals0).toBe(firstTouchEvals); // the warm tick evaluated nothing new
  expect(warm.contacts).toBe(cold.contacts);
  return { firstTouchMs, firstTouchEvals, observeMs: warm.ms, dronesMs: warm.dronesMs, contacts: warm.contacts, dronePairs: warm.dronePairs };
}

describe('the fog toll in perception — 16 captains + 96 drones, the field at 8 % coverage, 20 mines (Story 9.10 perf pin)', () => {
  it('observe() for all 16 captains (and shipSees for the whole fleet) best-of-5 stays under the 50 ms tick; the first-touch tick after an epoch bump under 10 ms', () => {
    const runs: Run[] = [];
    for (let run = 0; run < 5; run += 1) runs.push(measure(910));
    const best = runs.reduce((a, b) => (b.observeMs < a.observeMs ? b : a));
    const bestDrones = Math.min(...runs.map((r) => r.dronesMs));
    const bestFirstTouch = Math.min(...runs.map((r) => r.firstTouchMs));
    // Same seed, same water: every run saw the identical field and touched the same cells.
    for (const r of runs) {
      expect(r.contacts).toBe(runs[0].contacts);
      expect(r.dronePairs).toBe(runs[0].dronePairs);
      expect(r.firstTouchEvals).toBe(runs[0].firstTouchEvals);
    }
    // The fixture really exercises the toll: the sight sites had neighbours to toll and cells to evaluate.
    expect(best.contacts).toBeGreaterThan(0);
    expect(best.firstTouchEvals).toBeGreaterThan(0);
    if (process.env.HC_PERF_LOG) {
      console.log(
        `fog perf: observe() × ${CAPTAINS} best-of-5 ${best.observeMs.toFixed(3)} ms (contacts ${best.contacts}) | ` +
          `shipSees × ${DRONES * CAPTAINS} best-of-5 ${bestDrones.toFixed(3)} ms (seen ${best.dronePairs}) | ` +
          `first-touch tick ${bestFirstTouch.toFixed(3)} ms evaluating ${best.firstTouchEvals} memo cells | all runs observe: ${runs.map((r) => r.observeMs.toFixed(2)).join(', ')}`,
      );
    }
    expect(best.observeMs + bestDrones).toBeLessThan(TICK_BUDGET_MS);
    expect(bestFirstTouch).toBeLessThan(FIRST_TOUCH_BUDGET_MS);
  });
});
