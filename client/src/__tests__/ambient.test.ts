// Story 1.14 — the ambient CIC scene's pure layout/decay math. The Pixi shell
// (AmbientScene) is a thin adapter left to visual QA; only these exported helpers
// are unit-tested (the repo pattern).

import { describe, it, expect } from 'vitest';
import {
  ambientScale,
  ringLayout,
  sweepAngleAt,
  blipTierIndex,
  blipTierAlpha,
} from '../render/ambient.js';
import { CLIENT_CONFIG } from '../config.js';

const A = CLIENT_CONFIG.home.ambient;

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

describe('blipTierIndex — discrete decay windows', () => {
  it('splits life into equal tier windows (freshest = 0)', () => {
    expect(blipTierIndex(0, 9000, 3)).toBe(0);
    expect(blipTierIndex(2999, 9000, 3)).toBe(0);
    expect(blipTierIndex(3000, 9000, 3)).toBe(1);
    expect(blipTierIndex(5999, 9000, 3)).toBe(1);
    expect(blipTierIndex(6000, 9000, 3)).toBe(2);
  });

  it('pins to the dimmest tier at/after full life', () => {
    expect(blipTierIndex(9000, 9000, 3)).toBe(2);
    expect(blipTierIndex(99999, 9000, 3)).toBe(2);
  });

  it('guards negatives / single tier / degenerate life', () => {
    expect(blipTierIndex(-100, 9000, 3)).toBe(0);
    expect(blipTierIndex(4000, 9000, 1)).toBe(0);
    expect(blipTierIndex(4000, 0, 3)).toBe(0);
  });
});

describe('blipTierAlpha — the config tier alphas indexed by decay', () => {
  const tiers = A.blipTierAlphas;

  it('returns the fresh/dim/dimmer alphas across the lifetime', () => {
    expect(blipTierAlpha(0, 9000, tiers)).toBe(tiers[0]);
    expect(blipTierAlpha(4000, 9000, tiers)).toBe(tiers[1]);
    expect(blipTierAlpha(8000, 9000, tiers)).toBe(tiers[2]);
  });

  it('the configured tiers form a valid decay ramp (strictly dimming, all visible)', () => {
    expect(tiers.length).toBeGreaterThanOrEqual(1);
    for (const a of tiers) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeLessThan(tiers[i - 1]);
  });

  it('returns a fully-transparent 0 for an empty tier array (no undefined into alpha)', () => {
    expect(blipTierAlpha(0, 9000, [])).toBe(0);
    expect(blipTierAlpha(4000, 9000, [])).toBe(0);
  });
});
