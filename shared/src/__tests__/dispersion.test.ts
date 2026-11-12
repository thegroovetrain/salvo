// sim/dispersion.ts — Story 11.1 real dispersion (Eric 2026-11-12, R2–R5).
// Contracts only: every case runs on SYNTHETIC dials and checks relations
// (inside the ellipse, linear growth, floor, long axis follows the shot,
// determinism, bell shape) — never a seed-produced number, never a shipped
// CONFIG literal.
import { describe, expect, it } from 'vitest';
import { dispersedPoint, dispersionAxes, type DispersionCfg } from '../sim/dispersion.js';

const CFG: DispersionCfg = { alongFrac: 0.02, acrossFrac: 0.25, floorU: 3, sigmas: 2 };
const SEEDS = 4000;
const EPS = 1e-9;

/** The landing's offset from the aim, in the shot's frame, normalized by the semi-axes. */
function normalized(ox: number, oy: number, ax: number, ay: number, p: { x: number; y: number }, cfg: DispersionCfg) {
  const range = Math.hypot(ax - ox, ay - oy);
  const ux = range > 0 ? (ax - ox) / range : 1;
  const uy = range > 0 ? (ay - oy) / range : 0;
  const dx = p.x - ax;
  const dy = p.y - ay;
  const { alongU, acrossU } = dispersionAxes(range, cfg);
  return { a: (dx * ux + dy * uy) / alongU, b: (-dx * uy + dy * ux) / acrossU };
}

describe('dispersionAxes — semi-axes grow linearly with range above the floor', () => {
  it('along = alongFrac × range / 2 and across = acrossFrac × along above the floor', () => {
    for (const range of [1000, 2500, 9000]) {
      const { alongU, acrossU } = dispersionAxes(range, CFG);
      expect(alongU).toBeCloseTo((CFG.alongFrac * range) / 2, 9);
      expect(acrossU).toBeCloseTo(alongU * CFG.acrossFrac, 9);
    }
  });

  it('doubling the range doubles both axes once both are above the floor', () => {
    const near = dispersionAxes(2000, CFG);
    const far = dispersionAxes(4000, CFG);
    expect(far.alongU / near.alongU).toBeCloseTo(2, 9);
    expect(far.acrossU / near.acrossU).toBeCloseTo(2, 9);
  });

  it('below the floor both axes are floorU / 2', () => {
    for (const range of [0, 1, CFG.floorU / CFG.alongFrac / 2]) {
      const { alongU, acrossU } = dispersionAxes(range, CFG);
      expect(alongU).toBe(CFG.floorU / 2);
      expect(acrossU).toBe(CFG.floorU / 2);
    }
  });

  it('the floor is per axis: across can sit on the floor while along has grown past it', () => {
    const range = (CFG.floorU / CFG.alongFrac) * 2; // along = 2 × floor, across = half the floor
    const { alongU, acrossU } = dispersionAxes(range, CFG);
    expect(alongU).toBeCloseTo(CFG.floorU, 9);
    expect(acrossU).toBe(CFG.floorU / 2);
  });

  it('a negative or non-finite range is treated as zero', () => {
    const zero = dispersionAxes(0, CFG);
    for (const bad of [-500, Number.NaN, Number.POSITIVE_INFINITY]) expect(dispersionAxes(bad, CFG)).toEqual(zero);
  });
});

describe('dispersedPoint — every landing lies inside the ellipse in the shot frame', () => {
  it('holds for many seeds, several ranges and bearings', () => {
    const shots = [
      [0, 0, 1000, 0],
      [100, -50, -700, 2300],
      [5, 5, 5, 6],
      [0, 0, 0, -9000],
    ] as const;
    for (const [ox, oy, ax, ay] of shots) {
      for (let s = 0; s < SEEDS; s++) {
        const p = dispersedPoint(ox, oy, ax, ay, s, CFG);
        const n = normalized(ox, oy, ax, ay, p, CFG);
        expect(n.a * n.a + n.b * n.b).toBeLessThanOrEqual(1 + EPS);
      }
    }
  });

  it('holds with a uniform-disc cfg (sigmas 0) too', () => {
    const flat = { ...CFG, sigmas: 0 };
    for (let s = 0; s < SEEDS; s++) {
      const p = dispersedPoint(0, 0, 3000, 400, s, flat);
      const n = normalized(0, 0, 3000, 400, p, flat);
      expect(n.a * n.a + n.b * n.b).toBeLessThanOrEqual(1 + EPS);
    }
  });
});

/** Spread (max − min) of the landings along x and y. */
function extents(ax: number, ay: number, cfg: DispersionCfg) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let s = 0; s < SEEDS; s++) {
    const p = dispersedPoint(0, 0, ax, ay, s, cfg);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: maxX - minX, y: maxY - minY };
}

describe('dispersedPoint — the long axis follows the line of fire', () => {
  it('a shot along +x spreads wider in x; the same shot rotated 90° spreads wider in y', () => {
    const east = extents(5000, 0, CFG);
    const north = extents(0, 5000, CFG);
    expect(east.x).toBeGreaterThan(east.y * 2);
    expect(north.y).toBeGreaterThan(north.x * 2);
  });
});

describe('dispersedPoint — seeded and deterministic', () => {
  it('same inputs and seed give the identical point', () => {
    for (const seed of [0, 1, 12345, 0xffffffff]) {
      expect(dispersedPoint(10, 20, 900, -300, seed, CFG)).toEqual(dispersedPoint(10, 20, 900, -300, seed, CFG));
    }
  });

  it('different seeds do not all give the same point', () => {
    const pts = new Set<string>();
    for (let s = 0; s < 50; s++) {
      const p = dispersedPoint(0, 0, 2000, 0, s, CFG);
      pts.add(`${p.x},${p.y}`);
    }
    expect(pts.size).toBeGreaterThan(1);
  });
});

describe('dispersedPoint — degenerate shots stay finite', () => {
  it('a zero-length shot lands finite and within the floor', () => {
    for (let s = 0; s < 500; s++) {
      const p = dispersedPoint(42, -7, 42, -7, s, CFG);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(Math.hypot(p.x - 42, p.y + 7)).toBeLessThanOrEqual(CFG.floorU / 2 + EPS);
    }
  });

  it('a tiny or zero sigmas is finite', () => {
    for (const sigmas of [0, 1e-12, -1]) {
      const p = dispersedPoint(0, 0, 1000, 0, 7, { ...CFG, sigmas });
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('dispersedPoint — bell-shaped: denser in the middle than a uniform disc', () => {
  /** Share of landings whose normalized radius is under one half. */
  function innerShare(cfg: DispersionCfg): number {
    let inner = 0;
    for (let s = 0; s < SEEDS; s++) {
      const p = dispersedPoint(0, 0, 4000, 0, s, cfg);
      const n = normalized(0, 0, 4000, 0, p, cfg);
      if (Math.hypot(n.a, n.b) < 0.5) inner++;
    }
    return inner / SEEDS;
  }

  it('a tight bell puts clearly more than a quarter of shells in the middle half (a uniform disc puts a quarter)', () => {
    expect(innerShare({ ...CFG, sigmas: 3 })).toBeGreaterThan(0.4);
  });

  it('more bunching puts more shells in the middle', () => {
    expect(innerShare({ ...CFG, sigmas: 3 })).toBeGreaterThan(innerShare({ ...CFG, sigmas: 1 }));
  });

  it('the uniform fallback (sigmas 0) is close to a quarter', () => {
    expect(Math.abs(innerShare({ ...CFG, sigmas: 0 }) - 0.25)).toBeLessThan(0.05);
  });
});
