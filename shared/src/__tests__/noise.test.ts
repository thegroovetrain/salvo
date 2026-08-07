// Pins the noise primitives the fBm height field is built from (cycle 59).
//
// Two things matter here and nothing else does: the noise is DETERMINISTIC from
// its seed, and it is free of transcendentals. The second is the load-bearing
// one — a single Math.sin on the generation path reintroduces the cross-engine
// float risk the height-field pivot was chosen to retire, so the guard reads
// the source file rather than trusting review.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fbm, makeLayer, perlin, ridged } from '../sim/noise.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/noise.ts', import.meta.url)), 'utf8');

// NOTE: this guard is duplicated verbatim in heightField.test.ts rather than
// shared, because importing one vitest file from another re-registers its
// suites. Two copies of six lines is the cheaper trade.

/** Every Math member that is a library approximation rather than an exact op. */
const FORBIDDEN_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'hypot', 'cbrt', 'random',
];

/** Assert `src` contains no transcendental, no unseeded randomness, no clock. */
function expectNoTranscendentals(src: string): void {
  for (const fn of FORBIDDEN_MATH) {
    expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(src), `Math.${fn}( is forbidden`).toBe(false);
  }
  expect(/Date\.now\s*\(/.test(src), 'Date.now( is forbidden').toBe(false);
  expect(/\bMath\.PI\b/.test(src), 'Math.PI is forbidden').toBe(false);
}

describe('makeLayer — seeded permutation table', () => {
  it('is a true permutation of 0..255, mirrored into the upper half', () => {
    const P = makeLayer(12345);
    expect(P).toHaveLength(512);
    const seen = new Set<number>();
    for (let i = 0; i < 256; i++) {
      seen.add(P[i]);
      expect(P[256 + i]).toBe(P[i]);
    }
    expect(seen.size).toBe(256);
  });

  it('is deterministic per seed and decorrelated across seeds', () => {
    expect(Array.from(makeLayer(7))).toEqual(Array.from(makeLayer(7)));
    expect(Array.from(makeLayer(7))).not.toEqual(Array.from(makeLayer(8)));
  });

  it('coerces the seed to uint32 (negative seeds are legal)', () => {
    expect(Array.from(makeLayer(-1))).toEqual(Array.from(makeLayer(0xffffffff)));
  });
});

describe('perlin — gradient noise', () => {
  const P = makeLayer(99);

  it('vanishes at every lattice point (the gradient-noise signature)', () => {
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) expect(Math.abs(perlin(i, j, P))).toBe(0);
    }
  });

  it('stays finite and bounded over a dense sample grid', () => {
    let min = Infinity;
    let max = -Infinity;
    let nonFinite = 0;
    for (let i = 0; i < 200; i++) {
      for (let j = 0; j < 200; j++) {
        const v = perlin(i * 0.137, j * 0.137, P);
        if (!Number.isFinite(v)) nonFinite++;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    expect(nonFinite).toBe(0);
    expect(min).toBeLessThan(-0.3);
    expect(max).toBeGreaterThan(0.3);
    expect(Math.max(-min, max)).toBeLessThanOrEqual(1.5);
  });

  it('is deterministic and seed-dependent', () => {
    expect(perlin(3.7, -2.1, P)).toBe(perlin(3.7, -2.1, P));
    expect(perlin(3.7, -2.1, P)).not.toBe(perlin(3.7, -2.1, makeLayer(100)));
  });
});

describe('fbm / ridged', () => {
  const P = makeLayer(4242);

  it('fbm at one octave is exactly perlin (normalized by amplitude 1)', () => {
    expect(fbm(1.25, -0.75, P, 1, 0.5)).toBe(perlin(1.25, -0.75, P));
  });

  it('fbm stays bounded and is deterministic at the shipped persistence', () => {
    for (let i = 0; i < 400; i++) {
      const v = fbm(i * 0.031, i * 0.017, P, 5, 0.68);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.5);
      expect(v).toBe(fbm(i * 0.031, i * 0.017, P, 5, 0.68));
    }
  });

  it('ridged is confined to [0, 1] and is deterministic', () => {
    for (let i = 0; i < 400; i++) {
      const v = ridged(i * 0.023, i * 0.041, P, 4, 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(ridged(i * 0.023, i * 0.041, P, 4, 0.5));
    }
  });

  it('persistence is a real shape lever: 0.68 carries more mid-band power than 0.5', () => {
    let smooth = 0;
    let rough = 0;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.019;
      const y = i * 0.029;
      smooth += Math.abs(fbm(x, y, P, 5, 0.5) - fbm(x, y, P, 1, 0.5));
      rough += Math.abs(fbm(x, y, P, 5, 0.68) - fbm(x, y, P, 1, 0.68));
    }
    expect(rough).toBeGreaterThan(smooth);
  });
});

describe('noise.ts — no transcendentals on the generation path', () => {
  it('calls no transcendental Math function, no Math.random, no Date.now', () => {
    expectNoTranscendentals(SRC);
  });

  it('still uses the exact-op primitives it is allowed (guards against a gutted test)', () => {
    expect(SRC).toMatch(/Math\.imul\(/);
    expect(SRC).toMatch(/Math\.floor\(/);
  });
});
