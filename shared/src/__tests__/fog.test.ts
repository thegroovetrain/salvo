// Story 9.10 FOG — the rolling fog density field and its sight toll
// (sim/fog.ts; Eric 2026-10-15 "no discs", epic-9 amendments 163–164,
// 167–170). Contracts only: determinism, the wind, drift and morph, the
// density's range and soft edge, the toll's additivity and identities, the
// coverage quantile, the lattice, and the no-transcendentals source guard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FOG_NO_CUT, fogCutForTarget, fogDensityAt, fogLattice, fogNoiseAt, fogTollAlong, makeFogField,
  type FogFieldConfig,
} from '../sim/fog.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/fog.ts', import.meta.url)), 'utf8');

// Synthetic dials — the tests exercise the functions, not CONFIG's values.
const CFG: FogFieldConfig = {
  sightCostPerU: 2, wavelengthU: 600, octaves: 3, gain: 0.5,
  windU: 12, morphMs: 90000, edgeBand: 0.12, marchStepU: 10,
};
const FULL = -2; // a cut below every noise value: density 1 everywhere
const field = makeFogField(12345, CFG);

/** A deterministic 100-point sweep over a 5,000 u square. */
const SWEEP = Array.from({ length: 100 }, (_, i) => ({ x: (i % 10) * 517 - 2500, y: Math.floor(i / 10) * 491 - 2500 }));

describe('makeFogField', () => {
  it('is deterministic: the same seed builds identical layers and wind', () => {
    const a = makeFogField(777, CFG);
    const b = makeFogField(777, CFG);
    expect(Array.from(a.layerA)).toEqual(Array.from(b.layerA));
    expect(Array.from(a.layerB)).toEqual(Array.from(b.layerB));
    expect([a.windX, a.windY]).toEqual([b.windX, b.windY]);
  });

  it('a different seed draws a different wind', () => {
    const a = makeFogField(777, CFG);
    const b = makeFogField(778, CFG);
    expect(a.windX === b.windX && a.windY === b.windY).toBe(false);
  });

  it('the wind speed is windU per second, in u per ms', () => {
    for (const seed of [1, 2, 3, 99999, 0xffffffff]) {
      const f = makeFogField(seed, CFG);
      expect(Math.abs(Math.sqrt(f.windX ** 2 + f.windY ** 2) - CFG.windU / 1000)).toBeLessThan(1e-9);
    }
  });
});

describe('fogNoiseAt', () => {
  it('is finite and bounded over a sweep, and identical for identical inputs', () => {
    for (const p of SWEEP) {
      const n = fogNoiseAt(field, p.x, p.y, 4321);
      expect(Number.isFinite(n)).toBe(true);
      expect(Math.abs(n)).toBeLessThanOrEqual(1.5);
      expect(fogNoiseAt(field, p.x, p.y, 4321)).toBe(n);
    }
  });

  it('drifts with time and morphs over half a morph period', () => {
    const at = (t: number) => SWEEP.map((p) => fogNoiseAt(field, p.x, p.y, t));
    expect(at(10000)).not.toEqual(at(0));
    // Same wind offset removed: sample the moving frame so only the morph differs.
    const half = CFG.morphMs / 2;
    const moving = (t: number) => SWEEP.map((p) => fogNoiseAt(field, p.x + field.windX * t, p.y + field.windY * t, t));
    expect(moving(half)).not.toEqual(moving(0));
  });

  it('a non-finite input reads 0', () => {
    expect(fogNoiseAt(field, NaN, 0, 0)).toBe(0);
    expect(fogNoiseAt(field, 0, Infinity, 0)).toBe(0);
    expect(fogNoiseAt(field, 0, 0, NaN)).toBe(0);
  });
});

describe('fogDensityAt', () => {
  it('lies in [0, 1]; 0 at the no-fog cut; 1 at a cut below every value', () => {
    for (const p of SWEEP) {
      for (const cut of [-0.3, 0, 0.2, 0.5]) {
        const d = fogDensityAt(field, p.x, p.y, 1000, cut);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }
      expect(fogDensityAt(field, p.x, p.y, 1000, FOG_NO_CUT)).toBe(0);
      expect(fogDensityAt(field, p.x, p.y, 1000, FULL)).toBe(1);
    }
  });

  it('is monotone non-increasing in the cut', () => {
    for (const p of SWEEP) {
      let prev = 1;
      for (let cut = -1.5; cut <= 1.5; cut += 0.05) {
        const d = fogDensityAt(field, p.x, p.y, 2000, cut);
        expect(d).toBeLessThanOrEqual(prev);
        prev = d;
      }
    }
  });

  it('the soft edge: half an edge band above the cut reads one half', () => {
    const n = fogNoiseAt(field, 123, -456, 7000);
    expect(fogDensityAt(field, 123, -456, 7000, n - CFG.edgeBand / 2)).toBeCloseTo(0.5, 9);
    expect(fogDensityAt(field, 123, -456, 7000, n + 0.01)).toBe(0);
    expect(fogDensityAt(field, 123, -456, 7000, n - CFG.edgeBand - 0.01)).toBe(1);
  });

  it('a non-finite cut reads 0', () => {
    expect(fogDensityAt(field, 0, 0, 0, NaN)).toBe(0);
  });
});

describe('fogTollAlong', () => {
  const step = CFG.marchStepU;
  const cost = CFG.sightCostPerU;

  it('is 0 at the no-fog cut and for a zero-length segment', () => {
    expect(fogTollAlong(field, 0, 0, 500, 0, 0, FOG_NO_CUT)).toBe(0);
    expect(fogTollAlong(field, 40, 40, 40, 40, 0, FULL)).toBe(0);
  });

  it('is never negative and always finite, including on non-finite input', () => {
    for (const p of SWEEP) {
      const t = fogTollAlong(field, p.x, p.y, p.x + 300, p.y - 200, 500, 0.1);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(t)).toBe(true);
    }
    expect(fogTollAlong(field, NaN, 0, 10, 10, 0, FULL)).toBe(0);
  });

  it('with density 1 everywhere the toll is length × sightCostPerU', () => {
    const len = Math.sqrt(300 * 300 + 400 * 400);
    expect(Math.abs(fogTollAlong(field, 0, 0, 300, 400, 0, FULL) - len * cost)).toBeLessThan(1e-9);
    expect(Math.abs(fogTollAlong(field, 0, 0, 3.5, 0, 0, FULL) - 3.5 * cost)).toBeLessThan(1e-9);
  });

  it('is additive over a split segment within one step of tolerance per piece', () => {
    for (const p of SWEEP.slice(0, 30)) {
      const ax = p.x, ay = p.y, bx = p.x + 700, by = p.y + 250;
      const mx = ax + (bx - ax) * 0.37, my = ay + (by - ay) * 0.37;
      const whole = fogTollAlong(field, ax, ay, bx, by, 0, 0);
      const parts = fogTollAlong(field, ax, ay, mx, my, 0, 0) + fogTollAlong(field, mx, my, bx, by, 0, 0);
      expect(Math.abs(whole - parts)).toBeLessThanOrEqual(2 * step * cost);
    }
  });

  it('is symmetric A ↔ B', () => {
    for (const p of SWEEP.slice(0, 30)) {
      const ab = fogTollAlong(field, p.x, p.y, p.x - 420, p.y + 610, 3000, 0);
      const ba = fogTollAlong(field, p.x - 420, p.y + 610, p.x, p.y, 3000, 0);
      expect(Math.abs(ab - ba)).toBeLessThan(1e-9);
    }
  });
});

describe('fogCutForTarget', () => {
  const side = 48;
  const pts = fogLattice(0, 0, 5000, side);

  it('the realized fogged share over the lattice lands on the target', () => {
    for (const t of [0, 25000, 90000]) {
      const cut = fogCutForTarget(field, t, pts, 0.05);
      const above = pts.filter((p) => fogNoiseAt(field, p.x, p.y, t) > cut).length;
      expect(Math.abs(above / pts.length - 0.05)).toBeLessThanOrEqual(2 / (side * side));
    }
  });

  it('target 0 or no points → the no-fog cut; target 1 → a cut below every value', () => {
    expect(fogCutForTarget(field, 0, pts, 0)).toBe(FOG_NO_CUT);
    expect(fogCutForTarget(field, 0, [], 0.05)).toBe(FOG_NO_CUT);
    const full = fogCutForTarget(field, 0, pts, 1);
    for (const p of pts.slice(0, 200)) expect(fogDensityAt(field, p.x, p.y, 0, full)).toBe(1);
  });
});

describe('fogLattice', () => {
  it('keeps about π/4 of the side² cell centers, all inside the disc', () => {
    const pts = fogLattice(100, -200, 5000, 48);
    expect(Math.abs(pts.length / (48 * 48) - 0.7853981633974483)).toBeLessThan(0.05);
    for (const p of pts) expect((p.x - 100) ** 2 + (p.y + 200) ** 2).toBeLessThanOrEqual(5000 * 5000);
  });

  it('reuses the out array and its points', () => {
    const out = fogLattice(0, 0, 5000, 48);
    const first = out[0];
    const again = fogLattice(10, 10, 4000, 48, out);
    expect(again).toBe(out);
    expect(again[0]).toBe(first);
    const small = fogLattice(0, 0, 100, 8, out);
    expect(small.length).toBeLessThan(64);
  });
});

// NOTE: this guard is duplicated from noise.test.ts rather than shared,
// because importing one vitest file from another re-registers its suites.
const FORBIDDEN_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'hypot', 'cbrt', 'random',
];

describe('sim/fog.ts source guard', () => {
  it('uses no transcendental, no unseeded randomness and no clock', () => {
    for (const fn of FORBIDDEN_MATH) {
      expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(SRC), `Math.${fn}( is forbidden`).toBe(false);
    }
    expect(/Date\.now\s*\(/.test(SRC), 'Date.now( is forbidden').toBe(false);
    expect(/\bMath\.PI\b/.test(SRC), 'Math.PI is forbidden').toBe(false);
  });
});
