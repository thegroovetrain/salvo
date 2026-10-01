// SMOKE SCREEN (Story 8.18, catalog-v3 R38; Eric rulings 2026-09-29, epic-8
// amendments 138–145; radii re-ruled by Eric 2026-09-30 to 1/8 → 2/8 of intel
// range, then ×1.5 by Eric 2026-10-01 to 1.5/8 → 3/8) — the shared puff-growth curve both sides run, and the CONFIG block's
// six ruled numbers. Wounded smoke (`CONFIG.smoke`) is a
// DIFFERENT block and is pinned untouched here so the two are never conflated.

import { describe, it, expect } from 'vitest';
import { CONFIG, puffRadius } from '../index.js';

describe('CONFIG.smokeScreen — the ruled numbers', () => {
  it('is exactly the six ruled numbers (R38 + amendments 138–140, radii re-ruled 2026-09-30, ×1.5 2026-10-01) plus the in-smoke sight dial (amendment 149)', () => {
    expect(CONFIG.smokeScreen).toEqual({
      r0: 123.75,
      r1: 247.5,
      lifeMs: 30000,
      layMs: 5000,
      puffIntervalMs: 500,
      expandMs: 30000,
      inSmokeSightFraction: 0.125,
    });
  });

  it('authors the radii as 1.5/8 and 3/8 of intel range (CONFIG.vision.radar), exactly', () => {
    expect(CONFIG.vision.radar).toBe(660);
    expect(CONFIG.smokeScreen.r0).toBe(CONFIG.vision.radar * (1.5 / 8));
    expect(CONFIG.smokeScreen.r1).toBe(CONFIG.vision.radar * (3 / 8));
  });

  it('leaves WOUNDED smoke (CONFIG.smoke) untouched at its 250 ms cadence', () => {
    expect(CONFIG.smoke.puffIntervalMs).toBe(250);
  });
});

describe('puffRadius — linear r0 → r1 over expandMs, clamped both ends', () => {
  const T0 = 123456;

  it('is r0 (123.75) at the instant the puff is laid', () => {
    expect(puffRadius(T0, T0)).toBe(123.75);
  });

  it('is 185.625 halfway through its growth (+15 s)', () => {
    expect(puffRadius(T0, T0 + 15000)).toBe(185.625);
  });

  it('is r1 (247.5) at full growth (+30 s)', () => {
    expect(puffRadius(T0, T0 + 30000)).toBe(247.5);
  });

  it('clamps at r1 past full growth (+40 s)', () => {
    expect(puffRadius(T0, T0 + 40000)).toBe(247.5);
  });

  it('clamps at r0 for a `now` before the birth stamp (−1 s)', () => {
    expect(puffRadius(T0, T0 - 1000)).toBe(123.75);
  });
});
