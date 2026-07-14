import { describe, it, expect } from 'vitest';
import {
  wrapAngle,
  wrapPositive,
  angleDiff,
  bearing,
  inArc,
  lerpAngle,
} from '../math/angle.js';

const PI = Math.PI;
const TAU = Math.PI * 2;

describe('wrapAngle', () => {
  it('maps into [-pi, pi)', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(PI)).toBeCloseTo(-PI); // pi wraps to -pi (half-open top)
    expect(wrapAngle(-PI)).toBeCloseTo(-PI);
    expect(wrapAngle(PI / 2)).toBeCloseTo(PI / 2);
    expect(wrapAngle(3 * PI)).toBeCloseTo(-PI);
    expect(wrapAngle(-3 * PI)).toBeCloseTo(-PI);
  });

  it('stays within range for arbitrary inputs', () => {
    for (let a = -20; a <= 20; a += 0.37) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-PI);
      expect(w).toBeLessThan(PI);
    }
  });
});

describe('wrapPositive', () => {
  it('maps into [0, 2pi)', () => {
    expect(wrapPositive(0)).toBeCloseTo(0);
    expect(wrapPositive(TAU)).toBeCloseTo(0);
    expect(wrapPositive(-0.5)).toBeCloseTo(TAU - 0.5);
    expect(wrapPositive(3 * PI)).toBeCloseTo(PI);
  });
});

describe('angleDiff', () => {
  it('returns the shortest signed rotation', () => {
    expect(angleDiff(0, PI / 2)).toBeCloseTo(PI / 2);
    expect(angleDiff(PI / 2, 0)).toBeCloseTo(-PI / 2);
    // across the +/-pi seam: from 3.0 to -3.0 is a short +ve hop, not a long -ve one
    expect(angleDiff(3.0, -3.0)).toBeCloseTo(TAU - 6.0);
    expect(Math.abs(angleDiff(3.0, -3.0))).toBeLessThan(PI);
  });

  it('handles +/-pi boundary', () => {
    expect(Math.abs(angleDiff(-PI + 0.01, PI - 0.01))).toBeLessThan(0.03);
  });
});

describe('bearing', () => {
  it('points from one location to another', () => {
    expect(bearing({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(PI / 2);
    expect(bearing({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(PI);
  });
});

describe('inArc', () => {
  it('includes angles within half-width of center', () => {
    expect(inArc(0.1, 0, 0.2)).toBe(true);
    expect(inArc(0.3, 0, 0.2)).toBe(false);
    expect(inArc(0, 0, 0.2)).toBe(true);
  });

  it('handles wrap around +/-pi', () => {
    // center at pi, angle at -pi + 0.05 is 0.05 away across the seam
    expect(inArc(-PI + 0.05, PI, 0.1)).toBe(true);
    expect(inArc(-PI + 0.2, PI, 0.1)).toBe(false);
  });
});

describe('lerpAngle', () => {
  it('interpolates along the shortest arc', () => {
    expect(lerpAngle(0, PI / 2, 0.5)).toBeCloseTo(PI / 4);
    // 3.0 -> -3.0 should cross the seam, not sweep the long way
    const mid = lerpAngle(3.0, -3.0, 0.5);
    expect(Math.abs(mid)).toBeGreaterThan(3.0); // near +/-pi, not near 0
  });

  it('is identity at t=0 and reaches target at t=1', () => {
    expect(lerpAngle(1.0, 2.5, 0)).toBeCloseTo(1.0);
    expect(lerpAngle(1.0, 2.5, 1)).toBeCloseTo(2.5);
  });
});
