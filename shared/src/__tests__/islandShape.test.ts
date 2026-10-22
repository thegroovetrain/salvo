// The landmass extraction pipeline (sim/islandShape.ts) over SYNTHETIC height
// fields: a hand-built grid whose land/water answer is known by construction,
// so each stage's contract is checked without running the map generator.
import { describe, it, expect } from 'vitest';
import type { HeightField } from '../sim/heightField.js';
import {
  MASK,
  buildMask,
  closeUnreachableWater,
  forceLandDisc,
  makeGrid,
  poleOfInaccessibility,
  traceLoops,
} from '../sim/islandShape.js';
import { pointInPolygon } from '../sim/silhouette.js';

const N = 41;
const HALF = 20;

/** An N×N unit-cell field centred on the origin, valued by distance from it. */
function radialField(value: (d: number) => number): HeightField {
  const v = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) v[j * N + i] = value(Math.hypot(i - HALF, j - HALF));
  }
  return { n: N, cell: 1, x0: -HALF, y0: -HALF, v };
}

const idx = (x: number, y: number): number => (y + HALF) * N + (x + HALF);

describe('makeGrid', () => {
  it('marks exactly the samples inside the map disc and lists them', () => {
    const g = makeGrid(radialField(() => -1), 10);
    let inside = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const want = (i - HALF) ** 2 + (j - HALF) ** 2 <= 100 ? 1 : 0;
        expect(g.inDisc[j * N + i]).toBe(want);
        inside += want;
      }
    }
    expect(g.idxList.length).toBe(inside);
    for (const k of g.idxList) expect(g.inDisc[k]).toBe(1);
  });
});

describe('buildMask', () => {
  it('classifies off-disc samples OUT, samples at or above the level LAND, the rest WATER', () => {
    const g = makeGrid(radialField((d) => (d <= 4 ? 1 : -1)), 15);
    const mask = buildMask(g, 0);
    expect(mask[idx(0, 0)]).toBe(MASK.LAND);
    expect(mask[idx(10, 0)]).toBe(MASK.WATER);
    expect(mask[idx(20, 20)]).toBe(MASK.OUT);
    // A sample exactly AT the level is land.
    const flat = makeGrid(radialField(() => 0.5), 15);
    expect(buildMask(flat, 0.5)[idx(0, 0)]).toBe(MASK.LAND);
  });
});

describe('closeUnreachableWater', () => {
  const ringIsland = (d: number): number => (d >= 3 && d <= 6 ? 1 : -1);

  it('turns an enclosed lagoon into land and leaves the open ocean water', () => {
    const g = makeGrid(radialField(ringIsland), HALF);
    const mask = buildMask(g, 0);
    let lagoon = 0;
    for (let k = 0; k < N * N; k++) {
      const d = Math.hypot((k % N) - HALF, Math.floor(k / N) - HALF);
      if (d < 3 && mask[k] === MASK.WATER) lagoon++;
    }
    expect(lagoon).toBeGreaterThan(0);
    const filled = closeUnreachableWater(g, 12, 0.5);
    expect(filled).toBe(lagoon);
    expect(g.mask[idx(0, 0)]).toBe(MASK.LAND);
    expect(g.mask[idx(12, 0)]).toBe(MASK.WATER);
  });

  it('fills nothing when every body of water touches the ocean', () => {
    const g = makeGrid(radialField((d) => (d <= 4 ? 1 : -1)), HALF);
    buildMask(g, 0);
    expect(closeUnreachableWater(g, 12, 0.5)).toBe(0);
  });
});

describe('forceLandDisc', () => {
  it('raises the field at the point to land and leaves samples beyond its reach untouched', () => {
    const g = makeGrid(radialField(() => -1), HALF);
    forceLandDisc(g, 0, 0, 6, 0);
    expect(buildMask(g, 0)[idx(0, 0)]).toBe(MASK.LAND);
    expect(g.field.v[idx(15, 0)]).toBe(-1);
  });
});

describe('traceLoops', () => {
  it('traces one closed coastline around a single island, at the island edge', () => {
    const g = makeGrid(radialField((d) => (d <= 4 ? 1 : -1)), 15);
    buildMask(g, 0);
    const loops = traceLoops(g, 0);
    expect(loops).toHaveLength(1);
    expect(pointInPolygon({ x: 0, y: 0 }, loops[0])).toBe(true);
    for (const p of loops[0]) {
      const d = Math.hypot(p.x, p.y);
      // Every crossing sits on a cell edge between a land and a water sample.
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(5);
    }
  });

  it('traces nothing over an all-water field', () => {
    const g = makeGrid(radialField(() => -1), 15);
    buildMask(g, 0);
    expect(traceLoops(g, 0)).toEqual([]);
  });
});

describe('poleOfInaccessibility', () => {
  it('finds the inscribed disc of a rectangle: centred, radius half the short side', () => {
    const rect = [
      { x: -20, y: -5 },
      { x: 20, y: -5 },
      { x: 20, y: 5 },
      { x: -20, y: 5 },
    ];
    const pole = poleOfInaccessibility(rect);
    expect(pointInPolygon(pole, rect)).toBe(true);
    expect(pole.y).toBeCloseTo(0, 1);
    expect(pole.r).toBeCloseTo(5, 1);
  });

  it('places the pole at the elbow of an L, where the inscribed disc is largest', () => {
    const ell = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ];
    const pole = poleOfInaccessibility(ell);
    expect(pointInPolygon(pole, ell)).toBe(true);
    // Exact optimum: on the diagonal, equidistant from the outer walls and the
    // reflex corner (10, 10): t = 10√2 / (1 + √2).
    const best = (10 * Math.SQRT2) / (1 + Math.SQRT2);
    expect(pole.r).toBeLessThanOrEqual(best + 1e-9);
    expect(pole.r).toBeCloseTo(best, 1);
  });
});
