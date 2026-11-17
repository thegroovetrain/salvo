// sim/hm.ts — Story 11.2 the hectometer ruler (R1). Contracts only: the two
// conversions invert each other, the ruler is linear and increasing, and the
// formatter rounds to whole hectometers and fails closed on non-finite input.
// Every expectation is derived from the functions or HM_U, never a bare literal.
import { describe, expect, it } from 'vitest';
import { HM_U, formatHm, hmToU, uToHm } from '../sim/hm.js';

const SAMPLES = [0, 0.5, 1, 3, 15, 55, 130, 200, 380, 400, 475, 1234.5];

describe('hectometer ruler', () => {
  it('hmToU and uToHm invert each other', () => {
    for (const hm of SAMPLES) expect(uToHm(hmToU(hm))).toBeCloseTo(hm, 9);
    for (const hm of SAMPLES) {
      const u = hm * 7.3;
      expect(hmToU(uToHm(u))).toBeCloseTo(u, 9);
    }
  });

  it('one hectometer is HM_U units, and the ruler is linear and increasing', () => {
    expect(hmToU(1)).toBe(HM_U);
    expect(HM_U).toBeGreaterThan(0);
    for (let i = 1; i < SAMPLES.length; i++) {
      expect(hmToU(SAMPLES[i])).toBeGreaterThan(hmToU(SAMPLES[i - 1]));
      expect(hmToU(SAMPLES[i] * 2)).toBeCloseTo(2 * hmToU(SAMPLES[i]), 9);
    }
  });

  it('formatHm prints whole hectometers, rounding to nearest', () => {
    for (const hm of SAMPLES) expect(formatHm(hmToU(hm))).toBe(String(Math.round(hm)));
    expect(formatHm(hmToU(7) + HM_U * 0.49)).toBe(String(7));
    expect(formatHm(hmToU(7) + HM_U * 0.51)).toBe(String(8));
    expect(formatHm(-hmToU(0.2))).toBe(String(0));
  });

  it('formatHm fails closed on non-finite input', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(formatHm(bad)).toBe('');
  });
});
