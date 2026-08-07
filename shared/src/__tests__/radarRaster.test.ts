// THE SERVER-SIDE HULL RASTER (cycle 63, amendments 151-155) — unit coverage
// for the ONE shared function that projects a hull polygon onto the radar
// grid. The perception suite holds the independently-reimplemented anti-cheat
// oracle (server/src/__tests__/perception.test.ts maskOracle); this file pins
// the primitive's own contract: the rect, the packing, the centre-cell
// fail-safe, world anchoring, and the cell-centre coverage rule.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  coverageCellCount,
  coverageHas,
  hullSilhouette,
  pointInPolygon,
  rasterizeHullCoverage,
  transformPolygon,
  type HullCoverage,
} from '../index.js';

const CELL = CONFIG.vision.radarCellU;

/** Every covered cell of a mask, as absolute cell indices. */
function cellsOf(c: HullCoverage): { gx: number; gy: number }[] {
  const out: { gx: number; gy: number }[] = [];
  for (let row = 0; row < c.h; row++) {
    for (let col = 0; col < c.w; col++) {
      if (coverageHas(c, col, row)) out.push({ gx: c.gx + col, gy: c.gy + row });
    }
  }
  return out;
}

describe('rasterizeHullCoverage — the coverage contract', () => {
  it('covers exactly the cells whose CENTRE is inside the posed silhouette, plus the hull cell', () => {
    const [x, y, heading] = [412, -230, 0.83];
    const c = rasterizeHullCoverage('battleship', x, y, heading, CELL);
    const poly = transformPolygon(hullSilhouette('battleship'), x, y, heading);
    const hullCell = { gx: Math.floor(x / CELL), gy: Math.floor(y / CELL) };
    // Two-sided: every covered cell is earned, every earned cell is covered.
    for (let row = 0; row < c.h; row++) {
      for (let col = 0; col < c.w; col++) {
        const centre = { x: (c.gx + col + 0.5) * CELL, y: (c.gy + row + 0.5) * CELL };
        const isHullCell = c.gx + col === hullCell.gx && c.gy + row === hullCell.gy;
        const inside = pointInPolygon(centre, poly);
        if (coverageHas(c, col, row)) expect(inside || isHullCell).toBe(true);
        else expect(inside).toBe(false);
      }
    }
    // The rect is the polygon's cell-space bounding box exactly.
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    expect(c.gx).toBe(Math.floor(Math.min(...xs) / CELL));
    expect(c.gy).toBe(Math.floor(Math.min(...ys) / CELL));
    expect(c.gx + c.w - 1).toBe(Math.floor(Math.max(...xs) / CELL));
    expect(c.gy + c.h - 1).toBe(Math.floor(Math.max(...ys) / CELL));
  });

  it('the bits array is sized exactly to the rect and packed LSB-first row-major', () => {
    const c = rasterizeHullCoverage('mineLayer', 100, 100, 0.4, CELL);
    expect(c.bits.length).toBe(Math.ceil((c.w * c.h) / 32));
    // coverageHas agrees with a hand-decoded read of every bit.
    for (let i = 0; i < c.w * c.h; i++) {
      const byHand = ((c.bits[i >>> 5] >>> (i & 31)) & 1) === 1;
      expect(coverageHas(c, i % c.w, Math.floor(i / c.w))).toBe(byHand);
    }
    // Out-of-rect reads are uncovered, never a wrap-around into another row.
    expect(coverageHas(c, -1, 0)).toBe(false);
    expect(coverageHas(c, c.w, 0)).toBe(false);
    expect(coverageHas(c, 0, c.h)).toBe(false);
  });

  it('a bow-on and a broadside pose of the same hull produce DIFFERENT rects', () => {
    const east = rasterizeHullCoverage('battleship', 300, 300, 0, CELL); // long axis in x
    const north = rasterizeHullCoverage('battleship', 300, 300, Math.PI / 2, CELL); // long axis in y
    expect(east.w).toBeGreaterThan(east.h * 2);
    expect(north.h).toBeGreaterThan(north.w * 2);
  });

  it('is WORLD-ANCHORED: translating the pose by whole cells translates the mask verbatim', () => {
    const base = rasterizeHullCoverage('torpedoBoat', 60, 90, 1.1, CELL);
    const moved = rasterizeHullCoverage('torpedoBoat', 60 + 7 * CELL, 90 - 3 * CELL, 1.1, CELL);
    expect(moved.gx).toBe(base.gx + 7);
    expect(moved.gy).toBe(base.gy - 3);
    expect(moved.w).toBe(base.w);
    expect(moved.h).toBe(base.h);
    expect(moved.bits).toEqual(base.bits);
  });

  it('THE CENTRE-CELL FAIL-SAFE: the cell containing the hull position is always covered', () => {
    for (let k = 0; k < 16; k++) {
      const heading = (k * Math.PI) / 8;
      const c = rasterizeHullCoverage('torpedoBoat', 1234.5, -987.6, heading, CELL);
      expect(coverageCellCount(c)).toBeGreaterThan(0);
      expect(coverageHas(c, Math.floor(1234.5 / CELL) - c.gx, Math.floor(-987.6 / CELL) - c.gy)).toBe(true);
    }
  });

  it('degrades to a single-cell mask on a degenerate cell size or unknown hull, never throws', () => {
    const zero = rasterizeHullCoverage('torpedoBoat', 10, 10, 0, 0);
    expect(zero.w).toBe(1);
    expect(zero.h).toBe(1);
    expect(zero.bits).toEqual([1]);
    const inf = rasterizeHullCoverage('torpedoBoat', 10, 10, 0, Infinity);
    expect(coverageCellCount(inf)).toBe(1);
    const bad = rasterizeHullCoverage('notAHull' as never, 10, 10, 0, CELL);
    expect(bad).toEqual({ gx: 1, gy: 1, w: 1, h: 1, bits: [1] });
  });

  it('all covered cells lie inside the rect (the packing cannot leak outside it)', () => {
    const c = rasterizeHullCoverage('mineLayer', -333, 777, 2.2, CELL);
    for (const cell of cellsOf(c)) {
      expect(cell.gx).toBeGreaterThanOrEqual(c.gx);
      expect(cell.gx).toBeLessThan(c.gx + c.w);
      expect(cell.gy).toBeGreaterThanOrEqual(c.gy);
      expect(cell.gy).toBeLessThan(c.gy + c.h);
    }
  });
});
