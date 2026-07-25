// Story 1.14 — the ambient CIC scene's pure layout/crossing math. The Pixi
// shell (AmbientScene) is a thin adapter left to visual QA; only these exported
// helpers are unit-tested (the repo pattern). The ambient's radar RULES are the
// game's own (Eric ruling 2026-07-24): the beam runs at the base CONFIG.vision.sweepRpm rate
// and blips light only on a beam crossing, then decay via render/phosphor —
// blipAlpha/blipTint already carry their own pins in phosphor.test.ts.

import { describe, it, expect } from 'vitest';
import { ambientScale, ringLayout, sweepAngleAt, sweepCrossed } from '../render/ambient.js';
import { CLIENT_CONFIG } from '../config.js';

const A = CLIENT_CONFIG.home.ambient;
const TAU = Math.PI * 2;

describe('ambientScale — fit ring geometry to viewport height, clamped', () => {
  it('is 1 at the reference height', () => {
    expect(ambientScale(A.refHeight)).toBe(1);
    expect(ambientScale(1080, 1080)).toBe(1);
  });

  it('scales linearly with height between the clamps', () => {
    expect(ambientScale(810, 1080)).toBeCloseTo(0.75, 9);
  });

  it('clamps to [0.5, 1.5]', () => {
    expect(ambientScale(200, 1080)).toBe(0.5); // 0.185 → floor
    expect(ambientScale(5000, 1080)).toBe(1.5); // 4.63 → ceil
  });

  it('guards a degenerate reference', () => {
    expect(ambientScale(1080, 0)).toBe(1);
  });
});

describe('ringLayout — reference radii scaled', () => {
  it('multiplies each radius by the scale', () => {
    expect(ringLayout([130, 290], 2)).toEqual([260, 580]);
    expect(ringLayout(A.ringRadii, 1)).toEqual([...A.ringRadii]);
  });
});

describe('sweepAngleAt — continuous full revolution', () => {
  it('maps elapsed/period onto [0, 2π)', () => {
    expect(sweepAngleAt(0, 8000)).toBe(0);
    expect(sweepAngleAt(2000, 8000)).toBeCloseTo(Math.PI / 2, 9);
    expect(sweepAngleAt(4000, 8000)).toBeCloseTo(Math.PI, 9);
  });

  it('wraps at a full period (no flash/jump — modular)', () => {
    expect(sweepAngleAt(8000, 8000)).toBe(0);
    expect(sweepAngleAt(10000, 8000)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('guards a degenerate period', () => {
    expect(sweepAngleAt(1234, 0)).toBe(0);
  });
});

describe('sweepCrossed — the paint rule: light ONLY when the beam crosses', () => {
  it('paints a bearing inside the advanced interval', () => {
    expect(sweepCrossed(0.1, 0.3, 0.2)).toBe(true);
  });

  it('does not paint a bearing ahead of or behind the interval', () => {
    expect(sweepCrossed(0.1, 0.3, 0.5)).toBe(false); // beam hasn't reached it
    expect(sweepCrossed(0.1, 0.3, 0.05)).toBe(false); // beam already passed it
  });

  it('is half-open (prev, cur]: exactly-at-new-beam paints, exactly-at-prev does not', () => {
    expect(sweepCrossed(0.1, 0.3, 0.3)).toBe(true);
    expect(sweepCrossed(0.1, 0.3, 0.1)).toBe(false);
  });

  it('handles the 2π wrap (beam passing through zero)', () => {
    expect(sweepCrossed(TAU - 0.1, 0.1, 0.0)).toBe(true);
    expect(sweepCrossed(TAU - 0.1, 0.1, TAU - 0.05)).toBe(true);
    expect(sweepCrossed(TAU - 0.1, 0.1, 0.2)).toBe(false);
  });

  it('a stationary beam never paints', () => {
    expect(sweepCrossed(1.0, 1.0, 1.0)).toBe(false);
    expect(sweepCrossed(1.0, 1.0, 2.0)).toBe(false);
  });

  it('one revolution paints each bearing exactly once (no double-paint across steps)', () => {
    // Walk a full revolution in uneven steps; a fixed bearing must paint once.
    const bearing = 4.0;
    const steps = [0, 0.9, 1.7, 2.6, 3.4, 4.4, 5.1, 6.0, TAU];
    let paints = 0;
    for (let i = 1; i < steps.length; i++) {
      if (sweepCrossed(steps[i - 1] % TAU, steps[i] % TAU, bearing)) paints++;
    }
    expect(paints).toBe(1);
  });
});
