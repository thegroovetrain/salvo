import { describe, it, expect } from 'vitest';
import { lerp, clamp01, clamp, dashArcs, expDecay, lerpAngle } from '../util/math.js';

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

// The dash/dot vocabulary the ordnance previews and the own-mine rings share:
// line STYLE is how two concentric radii stay distinguishable without a second
// color, and a static pattern reads identically at motion=off.
describe('dashArcs', () => {
  it('cuts the circle into `segments` evenly-spaced inked arcs', () => {
    const arcs = dashArcs(4, 0.5);
    expect(arcs).toHaveLength(4);
    expect(arcs[0][0]).toBeCloseTo(0, 9);
    expect(arcs[1][0]).toBeCloseTo(Math.PI / 2, 9);
    // Each arc inks HALF its slice — the gap is what makes it read as dashed.
    expect(arcs[0][1] - arcs[0][0]).toBeCloseTo(Math.PI / 4, 9);
  });

  it('never closes the ring: total ink is duty × the full circle', () => {
    const ink = dashArcs(20, 0.25).reduce((sum, [a, b]) => sum + (b - a), 0);
    expect(ink).toBeCloseTo(Math.PI * 2 * 0.25, 9);
  });

  it('caps duty at a full slice, and returns NOTHING for degenerate input', () => {
    expect(dashArcs(3, 2)[0][1]).toBeCloseTo((Math.PI * 2) / 3, 9);
    expect(dashArcs(0, 0.5)).toEqual([]);
    expect(dashArcs(10, 0)).toEqual([]);
  });
});
