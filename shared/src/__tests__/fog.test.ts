// Story 9.10 FOG — the rolling fog density field and its sight toll
// (sim/fog.ts; Eric 2026-10-15 "no discs", epic-9 amendments 163–164,
// 167–170; 2026-10-16 amendment 179: the own bank is free, no fog past the
// rim). Contracts only: determinism, the wind, drift and morph, the
// density's range, soft edge and ocean clip, the toll's identities and the
// own-bank rule, the coverage quantile, the lattice, and the
// no-transcendentals source guard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FOG_NO_CUT, FOG_SOLID_DENSITY, fogCutForTarget, fogDensityAt, fogLattice, fogNoiseAt, fogSinCos, fogTollAlong, makeFogField,
  type FogFieldConfig,
} from '../sim/fog.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/fog.ts', import.meta.url)), 'utf8');

// Synthetic dials — the tests exercise the functions, not CONFIG's values.
const CFG: FogFieldConfig = {
  sightCostPerU: 2, wavelengthU: 600, octaves: 3, gain: 0.5,
  windU: 12, spinRimU: 30, spinShear: 0.5, morphMs: 90000, edgeBand: 0.12, marchStepU: 10,
};
const OCEAN_R = 5000;
const FULL = -2; // a cut below every noise value: density 1 everywhere
const field = makeFogField(12345, CFG, OCEAN_R);

/** A deterministic 100-point sweep over a 5,000 u square. */
const SWEEP = Array.from({ length: 100 }, (_, i) => ({ x: (i % 10) * 517 - 2500, y: Math.floor(i / 10) * 491 - 2500 }));

describe('makeFogField', () => {
  it('is deterministic: the same seed builds identical layers and wind', () => {
    const a = makeFogField(777, CFG, OCEAN_R);
    const b = makeFogField(777, CFG, OCEAN_R);
    expect(Array.from(a.layerA)).toEqual(Array.from(b.layerA));
    expect(Array.from(a.layerB)).toEqual(Array.from(b.layerB));
    expect([a.windX, a.windY]).toEqual([b.windX, b.windY]);
  });

  it('a different seed draws a different wind', () => {
    const a = makeFogField(777, CFG, OCEAN_R);
    const b = makeFogField(778, CFG, OCEAN_R);
    expect(a.windX === b.windX && a.windY === b.windY).toBe(false);
  });

  it('the wind speed is windU per second, in u per ms', () => {
    for (const seed of [1, 2, 3, 99999, 0xffffffff]) {
      const f = makeFogField(seed, CFG, OCEAN_R);
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

  it('NO FOG PAST THE RIM (amendment 179): density is 0 beyond the ocean radius whatever the cut, 1 just inside it under the full cut; a radius-0 field is unbounded', () => {
    expect(field.oceanRadiusU).toBe(OCEAN_R);
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, 0.8], [-0.6, -0.8]];
    for (const [ux, uy] of dirs) {
      expect(fogDensityAt(field, ux * (OCEAN_R + 1), uy * (OCEAN_R + 1), 1000, FULL)).toBe(0);
      expect(fogDensityAt(field, ux * (OCEAN_R + 1), uy * (OCEAN_R + 1), 1000, -0.5)).toBe(0);
      expect(fogDensityAt(field, ux * OCEAN_R, uy * OCEAN_R, 1000, FULL)).toBe(1); // the rim itself is ocean
      expect(fogDensityAt(field, ux * (OCEAN_R - 1), uy * (OCEAN_R - 1), 1000, FULL)).toBe(1);
    }
    // a hand-built field with no radius has no rim
    const open = makeFogField(12345, CFG, 0);
    expect(open.oceanRadiusU).toBe(0);
    expect(fogDensityAt(open, 50000, -50000, 1000, FULL)).toBe(1);
    // the clip is about the spin center
    const off = makeFogField(12345, CFG, 100, 1000, 1000);
    expect(fogDensityAt(off, 1000, 1000, 1000, FULL)).toBe(1);
    expect(fogDensityAt(off, 0, 0, 1000, FULL)).toBe(0);
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

  it('from CLEAR WATER into density 1 the toll is the fogged length × sightCostPerU: an observer just past the rim looking in (amendment 179 makes the rim the one exact clear/solid edge)', () => {
    // A at (R + 10, 0) is off the ocean (density 0); the ray runs 310 u inward along the axis; the
    // midpoint samples at R + 5 (clear) then R − 5, R − 15, … (solid): 30 steps × 10 u pay.
    expect(Math.abs(fogTollAlong(field, OCEAN_R + 10, 0, OCEAN_R - 300, 0, 0, FULL) - 300 * cost)).toBeLessThan(1e-9);
    // and a short ray that never reaches the ocean pays nothing
    expect(fogTollAlong(field, OCEAN_R + 10, 0, OCEAN_R + 3.5, 0, 0, FULL)).toBe(0);
  });

  it('THE OWN BANK IS FREE (amendment 179, "like grass patches in League"): under density 1 an observer ON the ocean pays nothing to anywhere — the whole ocean is one bank — and sees OUT past the rim for free', () => {
    const len = Math.sqrt(300 * 300 + 400 * 400);
    expect(len).toBeGreaterThan(0); // premise: a real ray
    expect(fogTollAlong(field, 0, 0, 300, 400, 0, FULL)).toBe(0);
    expect(fogTollAlong(field, 0, 0, 3.5, 0, 0, FULL)).toBe(0);
    for (const p of SWEEP) expect(fogTollAlong(field, p.x, p.y, p.x + 123, p.y - 321, 5000, FULL)).toBe(0);
    // out of the bank into clear water: the solid run is free, the clear water costs nothing anyway
    expect(fogTollAlong(field, OCEAN_R - 100, 0, OCEAN_R + 300, 0, 0, FULL)).toBe(0);
  });

  it('is DIRECTIONAL (amendment 179): from clear water into the bank pays, from the bank out to the same clear point pays nothing', () => {
    const inward = fogTollAlong(field, OCEAN_R + 10, 0, OCEAN_R - 300, 0, 0, FULL);
    const outward = fogTollAlong(field, OCEAN_R - 300, 0, OCEAN_R + 10, 0, 0, FULL);
    expect(inward).toBeGreaterThan(0);
    expect(outward).toBe(0);
  });

  it('the run ends at the first sample thinner than FOG_SOLID_DENSITY and never restarts: a second bank across thin or clear water pays full price (the rule written out against the density samples)', () => {
    // The reference re-implemented in the open: every midpoint sample along the ray; iff A stands
    // in solid fog, the first step (the observer's own ground) and then the leading solid run are
    // free; everything after the run is paid.
    const spelledOut = (ax: number, ay: number, bx: number, by: number, t: number, cut: number): number => {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
      let free = fogDensityAt(field, ax, ay, t, cut) >= FOG_SOLID_DENSITY;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const d = fogDensityAt(field, ax + (bx - ax) * f, ay + (by - ay) * f, t, cut);
        if (free && (i === 0 || d >= FOG_SOLID_DENSITY)) continue;
        free = false;
        sum += d;
      }
      return (sum * Math.hypot(bx - ax, by - ay)) / n * cost;
    };
    let ownBankRays = 0;
    let secondBankRays = 0;
    for (const p of SWEEP) {
      const [ax, ay, bx, by] = [p.x, p.y, p.x + 640, p.y - 270];
      const got = fogTollAlong(field, ax, ay, bx, by, 4000, 0);
      expect(Math.abs(got - spelledOut(ax, ay, bx, by, 4000, 0))).toBeLessThan(1e-9);
      if (fogDensityAt(field, ax, ay, 4000, 0) >= FOG_SOLID_DENSITY) {
        ownBankRays += 1;
        if (got > 0) secondBankRays += 1; // the ray left the bank and met more fog: that fog was paid
      }
    }
    expect(ownBankRays).toBeGreaterThan(5); // the sweep is not vacuous: observers inside banks...
    expect(secondBankRays).toBeGreaterThan(0); // ...and some of their rays reach a second bank
  });

  it('is additive over a split segment within one step of tolerance per piece when the observer is in clear water (an observer in a bank starts a free run the pieces cannot share)', () => {
    let checked = 0;
    for (const p of SWEEP) {
      if (fogDensityAt(field, p.x, p.y, 0, 0) >= FOG_SOLID_DENSITY) continue;
      const ax = p.x, ay = p.y, bx = p.x + 700, by = p.y + 250;
      const mx = ax + (bx - ax) * 0.37, my = ay + (by - ay) * 0.37;
      if (fogDensityAt(field, mx, my, 0, 0) >= FOG_SOLID_DENSITY) continue; // the second piece would start its own free run
      const whole = fogTollAlong(field, ax, ay, bx, by, 0, 0);
      const parts = fogTollAlong(field, ax, ay, mx, my, 0, 0) + fogTollAlong(field, mx, my, bx, by, 0, 0);
      expect(Math.abs(whole - parts)).toBeLessThanOrEqual(2 * step * cost);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('is symmetric A ↔ B when neither end stands in solid fog (the own-bank rule is the only asymmetry)', () => {
    let checked = 0;
    for (const p of SWEEP) {
      const [ax, ay, bx, by] = [p.x, p.y, p.x - 420, p.y + 610];
      if (fogDensityAt(field, ax, ay, 3000, 0) >= FOG_SOLID_DENSITY || fogDensityAt(field, bx, by, 3000, 0) >= FOG_SOLID_DENSITY) continue;
      expect(Math.abs(fogTollAlong(field, ax, ay, bx, by, 3000, 0) - fogTollAlong(field, bx, by, ax, ay, 3000, 0))).toBeLessThan(1e-9);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('fogCutForTarget', () => {
  const side = 48;
  const pts = fogLattice(0, 0, 5000, side);

  it('the realized SOLID share (density ≥ ½) over the lattice lands on the target (amendment 178)', () => {
    for (const t of [0, 25000, 90000]) {
      for (const target of [0.05, 0.22]) {
        const cut = fogCutForTarget(field, t, pts, target);
        const solid = pts.filter((p) => fogDensityAt(field, p.x, p.y, t, cut) >= FOG_SOLID_DENSITY).length;
        expect(Math.abs(solid / pts.length - target)).toBeLessThanOrEqual(2 / (side * side));
        // ...and the cut sits half an edge band under the plain quantile, so every point above the quantile is solid
        const above = pts.filter((p) => fogNoiseAt(field, p.x, p.y, t) > cut + CFG.edgeBand / 2).length;
        expect(Math.abs(above / pts.length - target)).toBeLessThanOrEqual(2 / (side * side));
      }
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

describe('the spin (Eric 2026-10-16, amendment 177)', () => {
  /** Shear and wind off: the pattern is a rigid turn about the ocean center. */
  const still: FogFieldConfig = { ...CFG, windU: 0, spinShear: 0 };

  it('with shear 0 and no wind the pattern is a rigid rotation about the ocean center: noise at a point turned by the rim angle equals noise at rest (a morph-phase-0 instant)', () => {
    for (const seed of [11, 12, 13]) {
      const f = makeFogField(seed, still, OCEAN_R);
      const t = still.morphMs; // morph weight 0: layer A only
      const th = (f.spinSign * (still.spinRimU / 1000) * t) / OCEAN_R; // rim speed over radius
      const c = Math.cos(th);
      const s = Math.sin(th);
      for (const p of SWEEP) {
        const rx = p.x * c - p.y * s;
        const ry = p.x * s + p.y * c;
        expect(Math.abs(fogNoiseAt(f, rx, ry, t) - fogNoiseAt(f, p.x, p.y, 0))).toBeLessThan(1e-3);
      }
    }
  });

  it('the direction is a per-seed coin flip and both faces come up', () => {
    const signs = new Set<number>();
    for (let seed = 1; seed <= 64; seed++) signs.add(makeFogField(seed, CFG, OCEAN_R).spinSign);
    expect(signs).toEqual(new Set([1, -1]));
    expect(makeFogField(42, CFG, OCEAN_R).spinSign).toBe(makeFogField(42, CFG, OCEAN_R).spinSign);
  });

  it('a non-positive or NaN ocean radius disables the spin instead of spinning a 1 u disc', () => {
    for (const bad of [0, -5, NaN]) {
      const f = makeFogField(5, CFG, bad);
      expect(f.spinRadiusU).toBe(0);
      const g = makeFogField(5, { ...CFG, spinRimU: 0 }, OCEAN_R);
      for (const p of SWEEP) expect(fogNoiseAt(f, p.x, p.y, 777)).toBe(fogNoiseAt(g, p.x, p.y, 777));
    }
  });

  it('spinRimU 0 is no spin: in the wind frame, two morph-phase-0 instants read the same noise', () => {
    const f = makeFogField(5, { ...CFG, spinRimU: 0 }, OCEAN_R);
    const tm = CFG.morphMs * 2;
    for (const p of SWEEP) {
      expect(Math.abs(fogNoiseAt(f, p.x + f.windX * tm, p.y + f.windY * tm, tm) - fogNoiseAt(f, p.x, p.y, 0))).toBeLessThan(1e-9);
    }
  });

  it('each layer\'s shear is measured from its own last reset, not from t = 0 (the bound that keeps stretch to one morphMs)', () => {
    // Just after t = 10·P layer B (reset there, invisible at phase 0) weighs ~1e-5: the field is layer A
    // alone, with P/2 + 1 ms of shear since A's reset at 9.5·P — exactly A's state at t = 1 ms (A's reset at
    // −P/2) — rotated rigidly by the rim angle for the 10·P in between. Were tA measured from 0, A's shear
    // angle at the centre would differ by w0·spinShear·10·P ≈ 3.9 rad and the readings would not match.
    // Symmetric for layer B just after 10.5·P (A invisible; B reset at 10·P) against t = P/2 + 1 ms.
    const cfg = { ...CFG, windU: 0 };
    const P = cfg.morphMs;
    for (const seed of [21, 22]) {
      const f = makeFogField(seed, cfg, OCEAN_R);
      for (const [tLate, tEarly] of [[10 * P + 1, 1], [10 * P + P / 2 + 1, P / 2 + 1]]) {
        const th = (f.spinSign * (cfg.spinRimU / 1000) * (tLate - tEarly)) / OCEAN_R; // the rigid turn in between
        const c = Math.cos(th);
        const sn = Math.sin(th);
        for (const p of SWEEP) {
          if (p.x * p.x + p.y * p.y > OCEAN_R * OCEAN_R) continue;
          const rx = p.x * c - p.y * sn;
          const ry = p.x * sn + p.y * c;
          expect(Math.abs(fogNoiseAt(f, rx, ry, tLate) - fogNoiseAt(f, p.x, p.y, tEarly))).toBeLessThan(2e-3);
        }
      }
    }
  });

  it('the noise is continuous across both reset instants (the resetting layer is invisible there)', () => {
    const f = makeFogField(99, CFG, OCEAN_R);
    for (const tReset of [CFG.morphMs, CFG.morphMs / 2, 3 * CFG.morphMs]) {
      for (const p of SWEEP) {
        expect(Math.abs(fogNoiseAt(f, p.x, p.y, tReset + 1e-3) - fogNoiseAt(f, p.x, p.y, tReset - 1e-3))).toBeLessThan(1e-4);
      }
    }
  });

  it('fogSinCos matches Math.sin / Math.cos within 1e-6 across the folds, at the fold points and at match-scale angles', () => {
    const out = { s: 0, c: 0 };
    const angles = [0, -0, 0.3, -0.3, Math.PI / 2, -Math.PI / 2, Math.PI / 2 + 1e-9, Math.PI / 2 - 1e-9, 2, -2, Math.PI, -Math.PI,
      3 * Math.PI / 2, 5, -5, 2 * Math.PI, 7, 100.5, -100.5, 56.5, 1e4 + 0.1, -1e4 - 0.1];
    for (const a of angles) {
      fogSinCos(a, out);
      expect(Math.abs(out.s - Math.sin(a)), `sin ${a}`).toBeLessThan(1e-6);
      expect(Math.abs(out.c - Math.cos(a)), `cos ${a}`).toBeLessThan(1e-6);
    }
    for (let i = 0; i < 2000; i++) {
      const a = (i - 1000) * 0.0123457;
      fogSinCos(a, out);
      expect(Math.abs(out.s - Math.sin(a))).toBeLessThan(1e-6);
      expect(Math.abs(out.c - Math.cos(a))).toBeLessThan(1e-6);
    }
  });

  it('a sheared field stays finite and bounded deep into a match', () => {
    const f = makeFogField(7, CFG, OCEAN_R);
    for (const t of [1, 2 * CFG.morphMs + 1, 1800000]) {
      for (const p of SWEEP) {
        const n = fogNoiseAt(f, p.x, p.y, t);
        expect(Number.isFinite(n)).toBe(true);
        expect(Math.abs(n)).toBeLessThanOrEqual(1.5);
      }
    }
  });
});
