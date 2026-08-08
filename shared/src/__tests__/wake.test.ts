// Story 4.12 — the one wake model (sim/wake.ts) + the ribbon's lattice
// projection (rasterizeSegmentCoverage, sim/radarRaster.ts). These are the
// PURE rows of the spec's I/O matrix: ring-buffer wraparound at the DERIVED
// capacity, distance-cadence sampling, age bucketing at exact boundaries,
// non-finite sample rejection with ribbon closure (amendment 193's lesson —
// degrade, never throw, never blank the layer), zero/single-sample ribbons,
// torpedo half-life expiry, segment geometry, and segment-mask contiguity
// across lattice phases and headings.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  WAKE_AGE_BUCKETS,
  appendWakeSample,
  coverageHas,
  createShipWake,
  createTorpWake,
  createWakeRibbon,
  eachWakeSegment,
  pruneWake,
  rasterizeSegmentCoverage,
  shipWakeWidthU,
  torpWakeLifeMs,
  torpWakeWidthU,
  wakeAgeBucket,
  wakeCapacity,
  type HullCoverage,
  type WakeSegment,
} from '../index.js';

const LIFE = CONFIG.vision.wakeLifeMs; // 12000
const STEP = CONFIG.vision.wakeSampleU; // 12
const CELL = CONFIG.vision.radarCellU; // 9

/** Collect segments as plain copies (the callback scratch is reused). */
function segmentsOf(r: ReturnType<typeof createWakeRibbon>, now: number): WakeSegment[] {
  const out: WakeSegment[] = [];
  eachWakeSegment(r, now, (s) => out.push({ ...s }));
  return out;
}

/** All lit cells of a coverage mask as absolute [col, row] world cell pairs. */
function litCells(c: HullCoverage): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let row = 0; row < c.h; row++) {
    for (let col = 0; col < c.w; col++) {
      if (coverageHas(c, col, row)) out.push([c.gx + col, c.gy + row]);
    }
  }
  return out;
}

/** Number of 4-connected components among the lit cells (1 = contiguous,
 *  no diagonal-only connections — a diagonal-only pair counts as 2). */
function components4(cells: Array<[number, number]>): number {
  const key = (c: number, r: number): string => `${c},${r}`;
  const unvisited = new Set(cells.map(([c, r]) => key(c, r)));
  let components = 0;
  for (const [c0, r0] of cells) {
    if (!unvisited.has(key(c0, r0))) continue;
    components += 1;
    const stack: Array<[number, number]> = [[c0, r0]];
    unvisited.delete(key(c0, r0));
    while (stack.length > 0) {
      const [c, r] = stack.pop() as [number, number];
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (unvisited.has(key(c + dc, r + dr))) {
          unvisited.delete(key(c + dc, r + dr));
          stack.push([c + dc, r + dr]);
        }
      }
    }
  }
  return components;
}

describe('wakeCapacity — the DERIVED ring capacity (never a literal)', () => {
  it('is ceil(life[s] × maxSpeed ÷ wakeSampleU) + 2 for every hull envelope', () => {
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const speed = CONFIG.shipClasses[cls].kinematics.maxSpeed;
      expect(wakeCapacity(speed, LIFE)).toBe(Math.ceil(((LIFE / 1000) * speed) / STEP) + 2);
    }
    // The concrete values at the shipped envelope, as a character note:
    expect(wakeCapacity(45, LIFE)).toBe(47); // torpedo boat
    expect(wakeCapacity(35, LIFE)).toBe(37); // battleship
    expect(wakeCapacity(40, LIFE)).toBe(42); // mine layer
    expect(wakeCapacity(CONFIG.torpedo.speed, torpWakeLifeMs())).toBe(32); // torpedo
  });

  it('degenerate speed/life inputs yield the 2-sample floor, never NaN or zero allocation', () => {
    expect(wakeCapacity(NaN, LIFE)).toBe(2);
    expect(wakeCapacity(45, NaN)).toBe(2);
    expect(wakeCapacity(-5, LIFE)).toBe(2);
    expect(wakeCapacity(45, 0)).toBe(2);
    expect(wakeCapacity(Infinity, Infinity)).toBe(2);
  });

  it('a source at max speed for exactly one life never overwrites an unexpired sample (the margin is real)', () => {
    const speed = CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed;
    const r = createShipWake('torpedoBoat', speed);
    // 40s at 50ms ticks, straight line at full ahead, pruning as the server would.
    for (let tick = 0; tick <= 800; tick++) {
      const t = tick * 50;
      appendWakeSample(r, (speed * t) / 1000, 0, t);
      pruneWake(r, t);
      // Every stored sample is unexpired — nothing live was ever overwritten.
      for (let n = 0; n < r.count; n++) {
        expect(t - r.ts[(r.head + n) % r.cap]).toBeLessThanOrEqual(LIFE);
      }
    }
    // Steady state holds a full life of track. At 50ms ticks the cadence
    // quantizes to whole ticks (ceil(12u / 2.25u-per-tick) = 6 ticks between
    // stored samples), so the expected census derives from tick time, not
    // from the ideal 12u spacing.
    const ticksPerSample = Math.ceil(STEP / (speed * 0.05));
    expect(r.count).toBeGreaterThanOrEqual(Math.floor(LIFE / (ticksPerSample * 50)) - 1);
    expect(r.count).toBeLessThanOrEqual(r.cap);
  });
});

describe('ring-buffer wraparound at the derived capacity', () => {
  it('overflow overwrites the OLDEST sample and the chain stays intact', () => {
    const r = createWakeRibbon(1, LIFE, 9); // tiny derived cap: ceil(12/12)+2 = 3
    expect(r.cap).toBe(3);
    for (let i = 0; i < 5; i++) expect(appendWakeSample(r, i * STEP, 0, i)).toBe(true);
    expect(r.count).toBe(3);
    const segs = segmentsOf(r, 10);
    expect(segs).toHaveLength(2);
    // Oldest two samples (x=0, x=12) were overwritten; survivors are 24, 36, 48.
    expect(segs[0].ax).toBe(2 * STEP);
    expect(segs[0].bx).toBe(3 * STEP);
    expect(segs[1].ax).toBe(3 * STEP);
    expect(segs[1].bx).toBe(4 * STEP);
  });
});

describe('distance-cadence sampling', () => {
  it('records nothing until the source has travelled wakeSampleU since the last sample', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    expect(appendWakeSample(r, 0, 0, 0)).toBe(true);
    expect(appendWakeSample(r, STEP / 2, 0, 50)).toBe(false);
    expect(appendWakeSample(r, STEP - 0.001, 0, 100)).toBe(false);
    expect(r.count).toBe(1);
    expect(appendWakeSample(r, STEP, 0, 150)).toBe(true); // exactly the cadence: stored
    expect(r.count).toBe(2);
  });

  it('a stopped hull lays no new samples; its existing track still ages out (I/O matrix rows 2 + 3)', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    appendWakeSample(r, 0, 0, 0);
    appendWakeSample(r, STEP, 0, 500);
    for (let t = 550; t < 3000; t += 50) expect(appendWakeSample(r, STEP, 0, t)).toBe(false);
    expect(segmentsOf(r, 3000)).toHaveLength(1); // track persists while the hull sits still
    expect(segmentsOf(r, LIFE + 1)).toHaveLength(0); // and ages out on its own clock
    expect(pruneWake(r, LIFE + 501)).toBe(0); // fully spent — the source can be released
  });
});

describe('water-age bucketing at exact boundaries (WAKE_AGE_BUCKETS quarters of the source life)', () => {
  it('the bucket count is 4 — the wire carries no finer resolution than the presentation consumes (amendment 124)', () => {
    expect(WAKE_AGE_BUCKETS).toBe(4);
  });

  it('quantizes [b, b+1) × life/N with boundary ages landing in the OLDER bucket', () => {
    expect(wakeAgeBucket(0, LIFE)).toBe(0);
    expect(wakeAgeBucket(LIFE / 4 - 1, LIFE)).toBe(0);
    expect(wakeAgeBucket(LIFE / 4, LIFE)).toBe(1);
    expect(wakeAgeBucket(LIFE / 2 - 1, LIFE)).toBe(1);
    expect(wakeAgeBucket(LIFE / 2, LIFE)).toBe(2);
    expect(wakeAgeBucket((3 * LIFE) / 4, LIFE)).toBe(3);
    expect(wakeAgeBucket(LIFE - 1, LIFE)).toBe(3);
    expect(wakeAgeBucket(LIFE, LIFE)).toBe(3); // float dust at exactly life clamps, never overflows
  });

  it('degenerate inputs clamp instead of throwing: negative age → freshest, non-finite → oldest', () => {
    expect(wakeAgeBucket(-5, LIFE)).toBe(0);
    expect(wakeAgeBucket(NaN, LIFE)).toBe(WAKE_AGE_BUCKETS - 1);
    expect(wakeAgeBucket(100, NaN)).toBe(WAKE_AGE_BUCKETS - 1);
    expect(wakeAgeBucket(100, 0)).toBe(WAKE_AGE_BUCKETS - 1);
    expect(wakeAgeBucket(Infinity, LIFE)).toBe(WAKE_AGE_BUCKETS - 1);
  });
});

describe('non-finite samples — dropped, ribbon closes across (the cycle-68 lesson, amendment 193)', () => {
  it('a non-finite append is rejected and the next good sample chains to the previous good one', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    expect(appendWakeSample(r, 0, 0, 0)).toBe(true);
    expect(appendWakeSample(r, NaN, 0, 100)).toBe(false);
    expect(appendWakeSample(r, 0, Infinity, 100)).toBe(false);
    expect(appendWakeSample(r, 20, 0, NaN)).toBe(false);
    expect(r.count).toBe(1);
    expect(appendWakeSample(r, 2 * STEP, 0, 200)).toBe(true);
    const segs = segmentsOf(r, 300);
    expect(segs).toHaveLength(1);
    expect(segs[0].ax).toBe(0);
    expect(segs[0].bx).toBe(2 * STEP);
  });

  it('a non-finite sample INSIDE the ring buffer is skipped by the scan — closed across, never thrown on', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    appendWakeSample(r, 0, 0, 0);
    appendWakeSample(r, STEP, 0, 100);
    appendWakeSample(r, 2 * STEP, 0, 200);
    r.xs[1] = NaN; // corrupt the middle sample in place
    const segs = segmentsOf(r, 300);
    expect(segs).toHaveLength(1);
    expect(segs[0].ax).toBe(0);
    expect(segs[0].bx).toBe(2 * STEP);
    expect(() => pruneWake(r, 300)).not.toThrow();
  });

  it('a non-finite now walks nothing and prunes nothing, without throwing', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    appendWakeSample(r, 0, 0, 0);
    appendWakeSample(r, STEP, 0, 100);
    expect(segmentsOf(r, NaN)).toHaveLength(0);
    expect(pruneWake(r, NaN)).toBe(2);
  });
});

describe('zero-sample and single-sample ribbons', () => {
  it('an empty ribbon yields no segments and prunes to 0', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    expect(segmentsOf(r, 1000)).toHaveLength(0);
    expect(pruneWake(r, 1000)).toBe(0);
  });

  it('a single sample yields no segments (a segment needs a pair)', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    appendWakeSample(r, 0, 0, 0);
    expect(segmentsOf(r, 1000)).toHaveLength(0);
    expect(pruneWake(r, 1000)).toBe(1);
  });
});

describe('segment geometry and the older-endpoint age rule', () => {
  it('each segment exposes endpoints older→newer, the midpoint, and the age of its OLDER water', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    appendWakeSample(r, 0, 0, 0);
    appendWakeSample(r, STEP, 0, 1000);
    appendWakeSample(r, 2 * STEP, 0, 2000);
    const segs = segmentsOf(r, 2500);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ ax: 0, ay: 0, bx: STEP, by: 0, mx: STEP / 2, my: 0, ageMs: 2500, bucket: 0 });
    expect(segs[1]).toMatchObject({ ax: STEP, bx: 2 * STEP, mx: (3 * STEP) / 2, ageMs: 1500, bucket: 0 });
  });

  it('a segment expires when its OLDER endpoint is strictly older than life — the tail shortens sample by sample', () => {
    const r = createWakeRibbon(45, LIFE, 9);
    appendWakeSample(r, 0, 0, 0);
    appendWakeSample(r, STEP, 0, 6000);
    appendWakeSample(r, 2 * STEP, 0, 8000);
    expect(segmentsOf(r, LIFE)).toHaveLength(2); // age exactly life: still there
    expect(segmentsOf(r, LIFE + 1)).toHaveLength(1); // tail segment gone, head segment lives
    expect(segmentsOf(r, LIFE + 6001)).toHaveLength(0);
  });
});

describe('torpedo wake — half life, one-cell core, fixed fish speed (amendment 196)', () => {
  it('torpWakeLifeMs is the ONE wakeLifeMs × wakeTorpLifeFactor derivation (6s at the shipped constants)', () => {
    expect(torpWakeLifeMs()).toBe(CONFIG.vision.wakeLifeMs * CONFIG.vision.wakeTorpLifeFactor);
    expect(torpWakeLifeMs()).toBe(6000);
  });

  it('a torpedo ribbon expires at half a ship life', () => {
    const r = createTorpWake();
    expect(r.lifeMs).toBe(torpWakeLifeMs());
    expect(r.widthU).toBe(torpWakeWidthU());
    appendWakeSample(r, 0, 0, 0);
    appendWakeSample(r, STEP, 0, 200);
    expect(segmentsOf(r, torpWakeLifeMs())).toHaveLength(1);
    expect(segmentsOf(r, torpWakeLifeMs() + 1)).toHaveLength(0);
  });

  it('ribbon widths are DERIVED from the source: a hull core is its own beam, a torpedo core is one radar cell', () => {
    expect(shipWakeWidthU('torpedoBoat')).toBe(CONFIG.shipClasses.torpedoBoat.hull.beam);
    expect(shipWakeWidthU('battleship')).toBe(CONFIG.shipClasses.battleship.hull.beam);
    expect(shipWakeWidthU('mineLayer')).toBe(CONFIG.shipClasses.mineLayer.hull.beam);
    expect(shipWakeWidthU('droneSmall')).toBe(CONFIG.drones.small.hull.beam);
    expect(torpWakeWidthU()).toBe(CONFIG.vision.radarCellU);
  });
});

describe('rasterizeSegmentCoverage — the ribbon on the lattice', () => {
  it('is contiguous (4-connected, no diagonal-only links) across lattice phases and headings, at both hull and torpedo widths', () => {
    const dirs: Array<[number, number]> = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [3, -1],
      [-1, 1],
      [-2, -3],
    ];
    for (const width of [torpWakeWidthU(), shipWakeWidthU('battleship')]) {
      for (const phase of [0, 2.7, 4.5, 6.3]) {
        for (const [dx, dy] of dirs) {
          const len = Math.hypot(dx, dy);
          const ax = 100 + phase;
          const ay = 77 + phase;
          const bx = ax + (dx / len) * STEP;
          const by = ay + (dy / len) * STEP;
          const cover = rasterizeSegmentCoverage(ax, ay, bx, by, width, CELL);
          const cells = litCells(cover);
          expect(cells.length).toBeGreaterThan(0);
          expect(components4(cells)).toBe(1);
          // Both endpoint cells always light.
          expect(coverageHas(cover, Math.floor(ax / CELL) - cover.gx, Math.floor(ay / CELL) - cover.gy)).toBe(true);
          expect(coverageHas(cover, Math.floor(bx / CELL) - cover.gx, Math.floor(by / CELL) - cover.gy)).toBe(true);
        }
      }
    }
  });

  it('leaves no gap along a long segment — every cell the centre-line crosses is lit', () => {
    const cover = rasterizeSegmentCoverage(4.5, 4.5, 102, 4.5, 0, CELL);
    for (let col = 0; col <= Math.floor(102 / CELL); col++) {
      expect(coverageHas(cover, col - cover.gx, 0 - cover.gy)).toBe(true);
    }
  });

  it('covers the correct width in cells: one lit row at a one-cell core, three at a battleship beam (32u)', () => {
    const litRows = (width: number): number => {
      const cover = rasterizeSegmentCoverage(10, 13.5, 40, 13.5, width, CELL);
      const rows = new Set(litCells(cover).map(([, r]) => r));
      return rows.size;
    };
    expect(litRows(torpWakeWidthU())).toBe(1); // the torpedo ribbon is exactly one cell wide
    expect(litRows(shipWakeWidthU('battleship'))).toBe(3); // 32u core → 3 rows at the 9u lattice
  });

  it('degrades on non-finite endpoints: one bad endpoint collapses onto the good one; two yield the origin cell', () => {
    const one = rasterizeSegmentCoverage(50, 50, NaN, 50, 9, CELL);
    expect(coverageHas(one, Math.floor(50 / CELL) - one.gx, Math.floor(50 / CELL) - one.gy)).toBe(true);
    expect(components4(litCells(one))).toBe(1);
    const both = rasterizeSegmentCoverage(NaN, Infinity, NaN, NaN, 9, CELL);
    expect(both).toEqual({ gx: 0, gy: 0, w: 1, h: 1, bits: [1] });
  });

  it('degrades on a degenerate lattice to the finite endpoint\'s single cell (no divide-by-zero mask)', () => {
    for (const badCell of [0, -3, NaN, Infinity]) {
      const cover = rasterizeSegmentCoverage(50, 50, 62, 50, 9, badCell);
      expect(cover.w).toBe(1);
      expect(cover.h).toBe(1);
      expect(cover.bits).toEqual([1]);
    }
  });

  it('degrades on a non-finite or non-positive width to the bare centre-line, without throwing', () => {
    for (const badWidth of [NaN, -9, 0, Infinity]) {
      const cover = rasterizeSegmentCoverage(4.5, 4.5, 30, 4.5, badWidth, CELL);
      const cells = litCells(cover);
      expect(cells.length).toBeGreaterThan(0);
      expect(components4(cells)).toBe(1);
      expect(new Set(cells.map(([, r]) => r)).size).toBe(1); // spine-only: one row
    }
  });

  it('handles a zero-length segment as a point source: its own cell lights and the mask is contiguous', () => {
    const cover = rasterizeSegmentCoverage(50, 50, 50, 50, 20, CELL);
    const cells = litCells(cover);
    expect(coverageHas(cover, Math.floor(50 / CELL) - cover.gx, Math.floor(50 / CELL) - cover.gy)).toBe(true);
    expect(components4(cells)).toBe(1);
  });
});
