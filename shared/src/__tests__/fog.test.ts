// Story 9.10 FOG BANKS — the pure sight-cost math (sim/fog.ts; Eric
// 2026-10-15, epic-9 amendments 162–168). Contracts only: chord geometry,
// the life-scale ramps, cost additivity, the storm-kill identity, the
// non-finite guards, and the no-transcendentals source guard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  fogCostAlong, fogDensity, fogRadius, fogScale, segDiscChord,
  type FogBankRecord, type FogConfig,
} from '../sim/fog.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/fog.ts', import.meta.url)), 'utf8');

// Synthetic dials — the tests exercise the functions, not CONFIG's values.
const CFG: FogConfig = { sightCostPerU: 2, growMs: 30000, fadeMs: 30000 };
const LIFE = 120000;

function bank(over: Partial<FogBankRecord> = {}): FogBankRecord {
  return { id: 'f1', x: 0, y: 0, R: 100, bornAt: 0, until: LIFE, ...over };
}
/** A time in the bank's hold (scale 1). */
const HOLD = 60000;

describe('segDiscChord', () => {
  it('a segment that misses the disc has no chord', () => {
    expect(segDiscChord(0, 200, 400, 200, 200, 0, 150)).toBe(0);
  });

  it('a tangent segment has (numerically) no chord', () => {
    expect(segDiscChord(0, 150, 400, 150, 200, 0, 150)).toBeCloseTo(0, 9);
  });

  it('a segment through the centre with both endpoints outside crosses 2r', () => {
    expect(segDiscChord(0, 0, 400, 0, 200, 0, 150)).toBeCloseTo(300, 9);
  });

  it('one endpoint inside: the chord runs from the endpoint to the rim', () => {
    // A at the centre, B far outside along +x: chord = r.
    expect(segDiscChord(200, 0, 600, 0, 200, 0, 150)).toBeCloseTo(150, 9);
  });

  it('both endpoints inside: the whole segment counts', () => {
    expect(segDiscChord(150, 0, 250, 30, 200, 0, 150)).toBeCloseTo(Math.sqrt(100 * 100 + 30 * 30), 9);
  });

  it('a disc containing the whole segment returns |AB|', () => {
    expect(segDiscChord(-10, -10, 10, 10, 0, 0, 1000)).toBeCloseTo(Math.sqrt(800), 9);
  });

  it('degenerate radii (0, negative, NaN) and non-finite inputs give 0', () => {
    expect(segDiscChord(0, 0, 400, 0, 200, 0, 0)).toBe(0);
    expect(segDiscChord(0, 0, 400, 0, 200, 0, -5)).toBe(0);
    expect(segDiscChord(0, 0, 400, 0, 200, 0, Number.NaN)).toBe(0);
    expect(segDiscChord(Number.NaN, 0, 400, 0, 200, 0, 150)).toBe(0);
  });

  it('a zero-length segment has no length, even inside the disc', () => {
    expect(segDiscChord(200, 0, 200, 0, 200, 0, 150)).toBe(0);
  });

  it('is symmetric in A and B', () => {
    const ab = segDiscChord(-40, 17, 380, 90, 200, 40, 120);
    const ba = segDiscChord(380, 90, -40, 17, 200, 40, 120);
    expect(ab).toBeGreaterThan(0);
    expect(ba).toBeCloseTo(ab, 9);
  });
});

describe('fogScale / fogRadius / fogDensity', () => {
  it('ramps 0 → 1 over growMs from birth', () => {
    expect(fogScale(bank(), 0, CFG)).toBe(0);
    expect(fogScale(bank(), CFG.growMs / 4, CFG)).toBeCloseTo(0.25, 12);
    expect(fogScale(bank(), CFG.growMs, CFG)).toBe(1);
  });

  it('holds at 1 between the ramps', () => {
    for (const t of [CFG.growMs, HOLD, LIFE - CFG.fadeMs]) expect(fogScale(bank(), t, CFG)).toBe(1);
  });

  it('ramps 1 → 0 over the last fadeMs and stays 0 after until (and before birth)', () => {
    expect(fogScale(bank(), LIFE - CFG.fadeMs / 2, CFG)).toBeCloseTo(0.5, 12);
    expect(fogScale(bank(), LIFE, CFG)).toBe(0);
    expect(fogScale(bank(), LIFE + 5000, CFG)).toBe(0);
    expect(fogScale(bank(), -5000, CFG)).toBe(0);
  });

  it('non-finite inputs read 0', () => {
    expect(fogScale(bank(), Number.NaN, CFG)).toBe(0);
    expect(fogScale(bank({ bornAt: Number.NaN }), HOLD, CFG)).toBe(0);
    expect(fogScale(bank({ until: Number.POSITIVE_INFINITY }), HOLD, CFG)).toBe(0);
  });

  it('a zero grow span reads full scale at once (no division by zero)', () => {
    expect(fogScale(bank(), 0, { ...CFG, growMs: 0 })).toBe(1);
  });

  it('radius is R × scale and density equals the scale', () => {
    const t = CFG.growMs / 4;
    expect(fogRadius(bank({ R: 150 }), t, CFG)).toBeCloseTo(37.5, 12);
    expect(fogDensity(bank(), t, CFG)).toBe(fogScale(bank(), t, CFG));
    expect(fogRadius(bank({ R: Number.NaN }), HOLD, CFG)).toBe(0);
  });
});

describe('fogCostAlong', () => {
  it('a mature bank on the ray costs chord × density × sightCostPerU', () => {
    // observer (0,0), hull (400,0), bank (200,0) R 150 → chord 300 → 600.
    expect(fogCostAlong(0, 0, 400, 0, [bank({ x: 200, R: 150 })], HOLD, CFG)).toBeCloseTo(600, 9);
  });

  it('a tangent bank costs nothing', () => {
    expect(fogCostAlong(0, 0, 400, 0, [bank({ x: 200, y: 150, R: 150 })], HOLD, CFG)).toBeCloseTo(0, 9);
  });

  it('a young bank is small AND thin', () => {
    // age growMs/4: radius 37.5, density 0.25 → chord 75 × 0.25 × 2 = 37.5.
    expect(fogCostAlong(0, 0, 400, 0, [bank({ x: 200, R: 150 })], CFG.growMs / 4, CFG)).toBeCloseTo(37.5, 9);
  });

  it('an observer inside a bank pays only for the fog it looks through', () => {
    const b = bank({ R: 300 });
    expect(fogCostAlong(0, 0, 150, 0, [b], HOLD, CFG)).toBeCloseTo(300, 9);
    expect(fogCostAlong(0, 0, 180, 0, [b], HOLD, CFG)).toBeCloseTo(360, 9);
  });

  it('two banks on the ray add', () => {
    const a = bank({ id: 'a', x: 100, R: 50 });
    const b = bank({ id: 'b', x: 300, R: 40 });
    const both = fogCostAlong(0, 0, 400, 0, [a, b], HOLD, CFG);
    expect(both).toBeCloseTo(
      fogCostAlong(0, 0, 400, 0, [a], HOLD, CFG) + fogCostAlong(0, 0, 400, 0, [b], HOLD, CFG), 9,
    );
    expect(both).toBeCloseTo((100 + 80) * CFG.sightCostPerU, 9);
  });

  it('a bank at scale 0 or with a NaN radius adds nothing; the result is finite', () => {
    const live = bank({ id: 'live', x: 200, R: 150 });
    const dead = bank({ id: 'dead', x: 200, R: 150, until: HOLD });
    const bad = bank({ id: 'bad', x: 200, R: Number.NaN });
    const cost = fogCostAlong(0, 0, 400, 0, [live, dead, bad], HOLD, CFG);
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeCloseTo(600, 9);
    expect(fogCostAlong(0, 0, 400, 0, [dead, bad], HOLD, CFG)).toBe(0);
  });

  it('no banks, no cost', () => {
    expect(fogCostAlong(0, 0, 400, 0, [], HOLD, CFG)).toBe(0);
  });
});

describe('the storm kill continues the line without a jump (amendment 165)', () => {
  it('until := now + fadeMs × s keeps the scale at s now and ends it at the new until', () => {
    for (const now of [CFG.growMs / 3, HOLD, LIFE - CFG.fadeMs * 0.4]) {
      const b = bank();
      const s = fogScale(b, now, CFG);
      const killed = { ...b, until: now + CFG.fadeMs * s };
      expect(Math.abs(fogScale(killed, now, CFG) - s)).toBeLessThan(1e-12);
      expect(fogScale(killed, killed.until, CFG)).toBe(0);
    }
  });
});

// The map-gen posture (noise.test.ts): no transcendentals, no unseeded
// randomness, no clock in the fog math.
const FORBIDDEN_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'hypot', 'cbrt', 'random',
];

describe('sim/fog.ts source guard', () => {
  it('uses no transcendental, no Math.random, no Date.now, no Math.PI', () => {
    for (const fn of FORBIDDEN_MATH) {
      expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(SRC), `Math.${fn}( is forbidden`).toBe(false);
    }
    expect(/Date\.now\s*\(/.test(SRC), 'Date.now( is forbidden').toBe(false);
    expect(/\bMath\.PI\b/.test(SRC), 'Math.PI is forbidden').toBe(false);
  });
});
