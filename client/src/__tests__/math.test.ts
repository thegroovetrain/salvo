import { describe, it, expect } from 'vitest';
import { lerp, clamp01, clamp, expDecay, lerpAngle } from '../util/math.js';

describe('lerp', () => {
  it('interpolates endpoints and midpoint', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(-4, 4, 0.25)).toBe(-2);
  });
});

describe('clamp01 / clamp', () => {
  it('clamps to [0,1]', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(5)).toBe(1);
  });
  it('clamps to a range', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('expDecay', () => {
  it('returns current at dt=0', () => {
    expect(expDecay(3, 10, 5, 0)).toBeCloseTo(3, 10);
  });
  it('converges toward target over time', () => {
    let v = 0;
    for (let i = 0; i < 1000; i++) v = expDecay(v, 10, 5, 0.05);
    expect(v).toBeCloseTo(10, 6);
  });
  it('matches the closed-form single step', () => {
    expect(expDecay(0, 100, 5, 0.05)).toBeCloseTo(100 * (1 - Math.exp(-0.25)), 9);
  });
});

describe('lerpAngle (re-exported from shared)', () => {
  it('takes the short way around the wrap', () => {
    const a = -3.0; // near -pi
    const b = 3.0; // near +pi
    // shortest path crosses the +/-pi seam, not the long way through 0
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(mid)).toBeGreaterThan(3.0);
  });
});
