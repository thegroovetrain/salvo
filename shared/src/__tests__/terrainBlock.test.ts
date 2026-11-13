// MAIN-BATTERY / SECONDARIES HIGH GROUND (Eric 2026-11-13, epic-11
// amendment 8): the lowest land band is passed over, the chart's first inner
// contour and above stops the round. Contracts of sim/terrainBlock.ts.

import { describe, it, expect } from 'vitest';
import {
  BATTERY_BLOCK_HEIGHT,
  batteryTerrainStop,
  contourBandHeight,
  firstHighGround,
} from '../sim/terrainBlock.js';
import { buildHeightRaster, sampleHeight, TERRAIN_PARAMS, type HeightRaster } from '../sim/heightField.js';
import { mulberry32 } from '../math/rng.js';

const CELL = TERRAIN_PARAMS.cell;

/** A synthetic raster over [±reach]² whose quantizer is the identity on 0–255
 *  (sea level 0, peak 255), sampled from `h`. */
function raster(reach: number, h: (x: number, y: number) => number): HeightRaster {
  const k = Math.ceil(reach / CELL);
  const n = 2 * k + 1;
  const x0 = -k * CELL;
  const v = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = h(x0 + i * CELL, x0 + j * CELL);
  return buildHeightRaster({ n, cell: CELL, x0, y0: x0, v }, 0, 255);
}

/** A band |x − cx| ≤ hw across the whole raster at height q. */
const wall = (cx: number, hw: number, q: number) => (x: number): number => (Math.abs(x - cx) <= hw ? q : 0);

describe('BATTERY_BLOCK_HEIGHT is the chart\'s level-1 contour, in raster units', () => {
  it('is contourBandHeight(1) — the contour rule, not a new number', () => {
    expect(BATTERY_BLOCK_HEIGHT).toBe(contourBandHeight(1, TERRAIN_PARAMS.contourStep));
  });

  it('a field sample quantizes to at least the threshold iff it lies at or above the level-1 contour value sea + (peak − sea) × contourStep', () => {
    // The generator's own quantizer (buildHeightRaster) over an arbitrary sea
    // level and peak, sampled on both sides of the contour value.
    const sea = 0.37;
    const peak = 2.9;
    const lvl1 = sea + (peak - sea) * TERRAIN_PARAMS.contourStep;
    // (Not the contour value itself: at the exact boundary float rounding
    // decides, on the chart and in the raster alike.)
    const values = [lvl1 - 0.01, lvl1 - 1e-4, lvl1 + 1e-4, lvl1 + 0.01, sea, peak];
    const v = new Float32Array(values.length * values.length);
    values.forEach((x, i) => (v[i] = x));
    const r = buildHeightRaster({ n: values.length, cell: CELL, x0: 0, y0: 0, v: v }, sea, peak);
    values.forEach((x, i) => {
      // Float32 storage: compare against the stored value, not the double.
      expect(r.height[i] >= BATTERY_BLOCK_HEIGHT, `field ${x}`).toBe(v[i] >= Math.fround(lvl1));
    });
  });
});

describe('firstHighGround / batteryTerrainStop', () => {
  it('terrain one step below the threshold — the lowest band — is passed over', () => {
    const r = raster(700, wall(300, 40, BATTERY_BLOCK_HEIGHT - 1));
    expect(firstHighGround(r, { x: 0, y: 0 }, { x: 600, y: 0 }, BATTERY_BLOCK_HEIGHT)).toBeNull();
    expect(batteryTerrainStop(r, { x: 0, y: 0 }, { x: 600, y: 0 })).toBeNull();
  });

  it('terrain at the threshold stops the path where it first enters it — short of the landing', () => {
    const r = raster(700, wall(300, 40, BATTERY_BLOCK_HEIGHT));
    const stop = batteryTerrainStop(r, { x: 0, y: 0 }, { x: 600, y: 0 })!;
    expect(stop).not.toBeNull();
    expect(stop.y).toBe(0);
    expect(sampleHeight(r, stop.x + 1e-3, 0)).toBeGreaterThanOrEqual(BATTERY_BLOCK_HEIGHT);
    expect(sampleHeight(r, stop.x - CELL / 2, 0)).toBeLessThan(BATTERY_BLOCK_HEIGHT);
  });

  it('a path that ends before the high ground is not stopped; off the raster is sea', () => {
    const r = raster(700, wall(300, 40, 255));
    expect(batteryTerrainStop(r, { x: 0, y: 0 }, { x: 200, y: 0 })).toBeNull();
    expect(batteryTerrainStop(r, { x: 2000, y: 2000 }, { x: 3000, y: 2500 })).toBeNull();
  });

  it('PROPERTY: on random terrain the answer is the first sample point along the path at or above the threshold (a fine-step oracle)', () => {
    const rng = mulberry32(11);
    const rnd = (): number => rng.next();
    const peaks = Array.from({ length: 12 }, () => ({ x: (rnd() - 0.5) * 1000, y: (rnd() - 0.5) * 1000, r: 40 + rnd() * 120, q: rnd() * 255 }));
    const r = raster(600, (x, y) => {
      let h = 0;
      for (const p of peaks) h = Math.max(h, p.q * Math.max(0, 1 - Math.hypot(x - p.x, y - p.y) / p.r));
      return h;
    });
    const STEP = 0.25;
    let blocked = 0;
    for (let n = 0; n < 200; n++) {
      const a = { x: (rnd() - 0.5) * 1100, y: (rnd() - 0.5) * 1100 };
      const b = { x: (rnd() - 0.5) * 1100, y: (rnd() - 0.5) * 1100 };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let oracle: number | null = null;
      for (let t = 0; t <= len; t += STEP) {
        const k = t / len;
        if (sampleHeight(r, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k) >= BATTERY_BLOCK_HEIGHT) {
          oracle = t;
          break;
        }
      }
      const got = firstHighGround(r, a, b, BATTERY_BLOCK_HEIGHT);
      if (oracle !== null) {
        blocked += 1;
        expect(got).not.toBeNull();
        expect(got!).toBeLessThanOrEqual(oracle + 1e-6); // never past the first high sample
      }
      if (got !== null) {
        // ...and the point it names is inside high ground (a corner the
        // fine-step oracle may step over still counts).
        const k = (got + 1e-4) / len;
        expect(sampleHeight(r, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)).toBeGreaterThanOrEqual(BATTERY_BLOCK_HEIGHT);
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });
});
