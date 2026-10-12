// THE COUNTERMEASURE CLOUD PERFORMANCE PIN (Story 9.3 acceptance criterion;
// 8.18's smokePerf seat): every live cloud is an outline pre-test and then a
// per-living-pixel segment test inside EVERY sight-tier predicate for EVERY
// observer — contacts, mines, decoys, ballistics, the halos, in-bubble water
// — plus the radar rule on every candidate paint, so the cost that matters is
// the whole perception pass over a crowded, clouded room: 20 observers × 20
// hulls × 5 live clouds straddling the observer→target lines, the spec's own
// numbers. The question is whether `observe()` for all twenty fits inside
// the 50 ms server tick with room to spare.
//
// THE PATTERN is hitTargets.test.ts's perf pin / smokePerf.test.ts: a fresh
// fixture per run, built OUTSIDE the clock, `performance.now()` around the
// work, best-of-5, the numbers printed under `HC_PERF_LOG=1`, and the
// ASSERTION is the tick budget. Deterministic per seed (mulberry32), no
// islands (the cost under test is the pixels', not the coastline's), a flat
// raster (the radar half runs its march).

import { describe, it, expect } from 'vitest';
import { CONFIG, cloudBase, livingPixelCount, mulberry32 } from '@salvo/shared';
import { World } from '../game/world.js';
import { observe } from '../game/perception.js';
import { flatRaster } from './islandFixture.js';

const OBSERVERS = 20;
const CLOUDS = 5;
const RING_U = 330; // every hull within 660 u of every other: six of every hull's nineteen partners inside the 330 u sight bubble
const CLOUD_RING_U = 150; // four clouds on a small inner ring plus one at the centre: every chord through the middle crosses outlines

/** Twenty captains on a ring, five FRESH clouds (300 living pixels each)
 *  seated in the middle of the ring so the hull-to-hull chords cross their
 *  200 u outlines — the outline pre-test PASSES for most pairs and the
 *  per-pixel loop actually runs, which is the cost this pin prices. A fresh
 *  cloud is the worst case: nothing has died yet. Built outside the clock;
 *  deterministic per seed. */
function cloudedField(seed: number): { w: World; ids: string[] } {
  const rng = mulberry32(seed);
  const w = new World(seed, OBSERVERS + 4, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  const ids: string[] = [];
  for (let i = 0; i < OBSERVERS; i += 1) {
    const id = `s${i}`;
    const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);
    const a = (i / OBSERVERS) * Math.PI * 2;
    rec.state.x = Math.cos(a) * RING_U;
    rec.state.y = Math.sin(a) * RING_U;
    rec.state.heading = a + Math.PI;
    rec.state.speed = 0;
    rec.sweepAngle = rng.float(0, Math.PI * 2);
    rec.prevSweepAngle = rec.sweepAngle - 0.08;
    ids.push(id);
  }
  for (let p = 0; p < CLOUDS; p += 1) {
    const ang = rng.float(0, Math.PI * 2);
    const r = p === 0 ? 0 : CLOUD_RING_U;
    const id = `cl${seed}_${p}`;
    const base = cloudBase(id);
    expect(livingPixelCount(base, 0)).toBe(CONFIG.countermeasure.pixels); // fresh: every pixel alive
    w.clouds.set(id, { id, ownerId: ids[p % OBSERVERS], x: Math.cos(ang) * r, y: Math.sin(ang) * r, bornAt: w.now, until: w.now + CONFIG.countermeasure.lifeMs, base });
  }
  return { w, ids };
}

describe('the five-live-cloud perception pin (Story 9.3)', () => {
  it('observe() for all 20 observers over 5 fresh clouds and 20 hulls stays inside the 50 ms tick (best of 5)', () => {
    let best = Infinity;
    let contactsClouded = 0;
    let contactsClear = 0;
    let cloudsSeen = 0;
    for (let run = 0; run < 5; run += 1) {
      const { w, ids } = cloudedField(818 + run); // built OUTSIDE the clock — a fresh field every run
      expect(w.clouds.size).toBe(CLOUDS);
      const t0 = performance.now();
      let contacts = 0;
      let clouds = 0;
      for (const id of ids) {
        const v = observe(w, id);
        contacts += v.contacts.length;
        clouds += v.clouds.length;
      }
      best = Math.min(best, performance.now() - t0);
      // Non-vacuity (outside the clock): the field really occludes — the same
      // twenty observers see MORE hulls once the water is cleared.
      if (run === 0) {
        contactsClouded = contacts;
        cloudsSeen = clouds;
        w.clouds.clear();
        for (const id of ids) contactsClear += observe(w, id).contacts.length;
      }
    }
    expect(cloudsSeen).toBe(OBSERVERS * CLOUDS); // every cloud's centre is within every hull's radar range
    expect(contactsClouded).toBeLessThan(contactsClear);
    expect(contactsClouded).toBeGreaterThan(0); // the clouds sit in the middle: neighbours along the ring stay visible
    if (process.env.HC_PERF_LOG) {
      console.log(
        `cloud perf best-of-5: observe() × ${OBSERVERS} over ${CLOUDS} clouds / ${OBSERVERS} hulls = ${best.toFixed(3)} ms | ` +
          `contacts clouded ${contactsClouded} vs clear ${contactsClear} | clouds delivered ${cloudsSeen} | node ${process.version}`,
      );
    }
    expect(best).toBeLessThan(50);
  });
});
