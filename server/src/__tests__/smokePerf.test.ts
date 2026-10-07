// THE SMOKE SCREEN PERFORMANCE PIN (Story 8.18 acceptance criterion): every
// live puff is one segment–circle test inside EVERY sight-tier predicate for
// EVERY observer — contacts, mines, decoys, ballistics, the halos, in-bubble
// water — so the cost that matters is the whole perception pass over a
// crowded, smoke-filled room: 20 observers × 200 live puffs × 20 hulls, the
// spec's own numbers. The question is whether `observe()` for all twenty
// fits inside the 50 ms server tick with room to spare.
//
// THE PATTERN is hitTargets.test.ts's perf pin / machineGunFlashCost.test.ts:
// a fresh fixture per run, built OUTSIDE the clock, `performance.now()` around
// the work, best-of-5, the numbers printed under `HC_PERF_LOG=1`, and the
// ASSERTION is the tick budget. Deterministic per seed (mulberry32), no
// islands (the cost under test is the puffs', not the coastline's), a flat
// raster (the radar half runs its march, smoke-blind).

import { describe, it, expect } from 'vitest';
import { CONFIG, mulberry32 } from '@salvo/shared';
import { World } from '../game/world.js';
import { observe } from '../game/perception.js';
import { flatRaster } from './islandFixture.js';

const OBSERVERS = 20;
const PUFFS = 200;
// THE GEOMETRY SCALED ×1.5 WITH THE DISCS (cycle 162, Eric 2026-10-01: puffs
// 82.5 → 165 u became 123.75 → 247.5 u): ring 220 → 330, band 40 → 60, far
// annulus 400–520 → 600–780, so every ratio the layout note below relies on
// is unchanged. The sight bubble (330 u) did NOT scale, so each hull now has
// six in-sight neighbours (within 54°) instead of ten — the pin is
// correspondingly less loaded on the sight-tier scans, and still a pin.
const RING_U = 330; // every hull within 660 u of every other: six of every hull's nineteen partners inside the 330 u sight bubble
const RING_PUFFS = 20; // puffs ON the ring — the occluding minority (non-vacuity)
const RING_PUFF_SECTOR = Math.PI / 6; // ...confined to one 30° slice of the ring (see smokedField)
const RING_PUFF_BAND_U = 60; // ...and to the outer 60 u band inside it
const FAR_MIN_U = 600; // the other 180 sit in an annulus every hull-to-hull segment misses ...
const FAR_MAX_U = 780; // ... yet inside sight + radius of the ring, so the smoke CHANNEL delivers them too

/** Twenty captains on a ring, two hundred live puffs of random age. THE WORST
 *  CASE, deliberately: `puffCrossed` short-circuits on the FIRST blocking
 *  puff, so a field where every segment is smoked is the CHEAP case. Here 180
 *  of the 200 puffs lie where no hull-to-hull segment can reach them (a
 *  segment between two ring points stays within RING_U of the centre; a puff
 *  at ≥ 600 u with r ≤ 247.5 — the full-grown 3/8 of intel range — keeps its
 *  near edge ≥ 352.5 u out, a 22.5 u margin past the 330 u ring), so every
 *  predicate scans the whole store for most pairs — the few ring hulls that
 *  stand inside a ring puff take the cheap in-smoke branch and skip the scan;
 *  the rest pay full price — while 20 ring puffs keep the occlusion real.
 *  The ring puffs sit in ONE 30° slice, in the outer 60 u band just inside
 *  the ring: with r up to 247.5 u (3/8 of intel range) a puff anywhere near
 *  the centre would cross every in-sight chord (each lies ≥ 286 u from the
 *  centre) and smoke the whole room — the cheap case — so they occlude that
 *  side's pairs only and the far side stays clear.
 *  Built outside the clock; deterministic per seed. */
function smokedField(seed: number): { w: World; ids: string[] } {
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
  for (let p = 0; p < PUFFS; p += 1) {
    // The far puffs go into the store FIRST: `puffCrossed` walks insertion
    // order and stops at the first hit, so a ring puff at the front would let
    // every smoked segment skip the 180 misses this pin exists to price.
    const ring = p >= PUFFS - RING_PUFFS;
    const ang = rng.float(0, ring ? RING_PUFF_SECTOR : Math.PI * 2);
    const r = ring ? rng.float(RING_U - RING_PUFF_BAND_U, RING_U) : rng.float(FAR_MIN_U, FAR_MAX_U);
    const bornAt = w.now - rng.float(0, CONFIG.smokeScreen.lifeMs - 1);
    const id = `sk${p}`;
    w.smoke.set(id, { id, ownerId: ids[p % OBSERVERS], x: Math.cos(ang) * r, y: Math.sin(ang) * r, bornAt, until: bornAt + CONFIG.smokeScreen.lifeMs });
  }
  return { w, ids };
}

describe('the 200-live-puff perception pin (Story 8.18)', () => {
  it('observe() for all 20 observers over 200 live puffs and 20 hulls stays inside the 50 ms tick (best of 5)', () => {
    let best = Infinity;
    let contactsSmoked = 0;
    let contactsClear = 0;
    let puffsSeen = 0;
    for (let run = 0; run < 5; run += 1) {
      // 818 -> 821 (Story 9.1, 2026-10-07): seed 820 is a map-generation throw at this cap on the 5500 u / 10 % ocean.
      const { w, ids } = smokedField(821 + run); // built OUTSIDE the clock — a fresh field every run
      expect(w.smoke.size).toBe(PUFFS);
      const t0 = performance.now();
      let contacts = 0;
      let smoke = 0;
      for (const id of ids) {
        const v = observe(w, id);
        contacts += v.contacts.length;
        smoke += v.smoke.length;
      }
      best = Math.min(best, performance.now() - t0);
      // Non-vacuity (outside the clock): the field really occludes — the same
      // twenty observers see MORE hulls once the water is cleared.
      if (run === 0) {
        contactsSmoked = contacts;
        puffsSeen = smoke;
        w.smoke.clear();
        for (const id of ids) contactsClear += observe(w, id).contacts.length;
      }
    }
    expect(puffsSeen).toBeGreaterThan(0);
    expect(contactsSmoked).toBeLessThan(contactsClear);
    expect(contactsSmoked).toBeGreaterThan(0); // the worst case: most pairs scan every puff and stay visible
    if (process.env.HC_PERF_LOG) {
      console.log(
        `smoke perf best-of-5: observe() × ${OBSERVERS} over ${PUFFS} puffs / ${OBSERVERS} hulls = ${best.toFixed(3)} ms | ` +
          `contacts smoked ${contactsSmoked} vs clear ${contactsClear} | puffs delivered ${puffsSeen} | node ${process.version}`,
      );
    }
    expect(best).toBeLessThan(50);
  });
});
