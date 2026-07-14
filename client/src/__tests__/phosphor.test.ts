// Pure phosphor/blip/sweep math (render/phosphor.ts) — the decay and
// extrapolation the radar renderer applies per frame.

import { describe, it, expect } from 'vitest';
import { wrapPositive } from '@salvo/shared';
import {
  BLIP_BRIGHT,
  BLIP_DARK,
  TINT_FADE_FRACTION,
  blipAlpha,
  blipTint,
  lerpColor,
  sweepRotation,
} from '../render/phosphor.js';

const TAU = Math.PI * 2;
const PERIOD = 4000;

describe('blipAlpha — linear 1 → 0 over one sweep period', () => {
  it('is 1 at paint time and 0 exactly one period later', () => {
    expect(blipAlpha(0, PERIOD)).toBe(1);
    expect(blipAlpha(PERIOD, PERIOD)).toBe(0);
  });

  it('is linear in between', () => {
    expect(blipAlpha(PERIOD / 2, PERIOD)).toBeCloseTo(0.5, 12);
    expect(blipAlpha(PERIOD / 4, PERIOD)).toBeCloseTo(0.75, 12);
  });

  it('clamps: never negative past a period, never above 1 for a skewed clock', () => {
    expect(blipAlpha(PERIOD * 2, PERIOD)).toBe(0);
    expect(blipAlpha(-50, PERIOD)).toBe(1); // clock jitter can make age < 0
  });
});

describe('lerpColor — per-channel interpolation', () => {
  it('returns the endpoints at t=0 and t=1 (and clamps beyond)', () => {
    expect(lerpColor(0x123456, 0xabcdef, 0)).toBe(0x123456);
    expect(lerpColor(0x123456, 0xabcdef, 1)).toBe(0xabcdef);
    expect(lerpColor(0x123456, 0xabcdef, -3)).toBe(0x123456);
    expect(lerpColor(0x123456, 0xabcdef, 7)).toBe(0xabcdef);
  });

  it('mixes each channel independently', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0xff0000, 0x00ff00, 0.5)).toBe(0x808000);
  });
});

describe('blipTint — bright → dark phosphor over the first ~30% of life', () => {
  it('starts bright and is fully dark from the fade fraction onward', () => {
    expect(blipTint(0, PERIOD)).toBe(BLIP_BRIGHT);
    expect(blipTint(PERIOD * TINT_FADE_FRACTION, PERIOD)).toBe(BLIP_DARK);
    expect(blipTint(PERIOD, PERIOD)).toBe(BLIP_DARK);
  });

  it('cools monotonically (green channel falls) through the fade window', () => {
    const green = (c: number) => (c >> 8) & 0xff;
    const fadeMs = PERIOD * TINT_FADE_FRACTION;
    let prev = green(blipTint(0, PERIOD));
    for (const k of [0.25, 0.5, 0.75, 1]) {
      const g = green(blipTint(fadeMs * k, PERIOD));
      expect(g).toBeLessThan(prev);
      prev = g;
    }
  });
});

describe('sweepRotation — 60fps extrapolation of the 20Hz sweep angle', () => {
  it('returns the frame angle when no time has passed', () => {
    expect(sweepRotation(1.25, 1000, 1000, PERIOD)).toBeCloseTo(1.25, 12);
  });

  it('advances at exactly 2π per period', () => {
    expect(sweepRotation(0, 0, PERIOD / 4, PERIOD)).toBeCloseTo(TAU / 4, 12);
    expect(sweepRotation(1, 500, 500 + PERIOD / 2, PERIOD)).toBeCloseTo(wrapPositive(1 + Math.PI), 12);
  });

  it('wraps into [0, 2π)', () => {
    const r = sweepRotation(TAU - 0.01, 0, PERIOD / 8, PERIOD); // +π/4 past the wrap
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(TAU);
    expect(r).toBeCloseTo(TAU / 8 - 0.01, 12);
  });

  it('never runs backward when the clock lags the frame timestamp', () => {
    expect(sweepRotation(2, 1000, 900, PERIOD)).toBe(2);
  });

  it('is seamless across frame re-anchors (server + extrapolation agree)', () => {
    // A frame 50ms later carries the angle advanced by exactly one tick's worth;
    // extrapolating the OLD frame to that moment must land on the same rotation.
    const dtMs = 50;
    const a0 = 3.1;
    const a1 = wrapPositive(a0 + (TAU * dtMs) / PERIOD);
    expect(sweepRotation(a0, 0, dtMs, PERIOD)).toBeCloseTo(sweepRotation(a1, dtMs, dtMs, PERIOD), 12);
  });
});
