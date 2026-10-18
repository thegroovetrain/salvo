// sim/attenuation.ts — the deck-gun blow arithmetic of Story 9.12 (Eric
// 2026-10-16, forge weapon-balance-math; epic-9 amendments 184–185). Every case
// runs on SYNTHETIC dials so the curve's shape is what is tested, never the
// shipped numbers; CONFIG is read once to show the shipped dials obey the
// same law.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../constants.js';
import { BLOW_FLOOR_EPS, flakRimFactor, rangeAttenuation, settleBlow } from '../sim/attenuation.js';

const CFG = { fullFrac: 0.5, minFactor: 0.8 };

describe('rangeAttenuation — full damage to fullFrac of range, linear to minFactor at range, clamped beyond', () => {
  it('is 1 at or inside fullFrac of the reference', () => {
    expect(rangeAttenuation(400, 1000, CFG)).toBe(1);
    expect(rangeAttenuation(500, 1000, CFG)).toBe(1);
    expect(rangeAttenuation(1, 1000, CFG)).toBe(1);
  });

  it('falls linearly between fullFrac and the reference (midway = halfway between 1 and minFactor)', () => {
    expect(rangeAttenuation(750, 1000, CFG)).toBeCloseTo(0.9, 12);
    expect(rangeAttenuation(900, 1000, CFG)).toBeCloseTo(0.84, 12);
  });

  it('is minFactor at the reference and clamped there beyond it (a lifted shot NOT exempted by the shooter\'s own light)', () => {
    expect(rangeAttenuation(1000, 1000, CFG)).toBe(0.8);
    expect(rangeAttenuation(1300, 1000, CFG)).toBe(0.8);
  });

  it('is monotone non-increasing in the distance flown', () => {
    let prev = Infinity;
    for (let f = 0; f <= 1500; f += 25) {
      const a = rangeAttenuation(f, 1000, CFG);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('fails open to 1 on a degenerate reference or distance (rangeU 0 / negative / NaN / Infinity; flown 0 / NaN)', () => {
    for (const rangeU of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rangeAttenuation(750, rangeU, CFG)).toBe(1);
    }
    for (const flown of [0, -1, Number.NaN]) {
      expect(rangeAttenuation(flown, 1000, CFG)).toBe(1);
    }
  });

  it('a non-finite fullFrac FAILS OPEN to 1 — no attenuation at any distance, never "falloff from the muzzle" (Story 9.12 review gate)', () => {
    for (const fullFrac of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const cfg = { fullFrac, minFactor: 0.8 };
      expect(rangeAttenuation(750, 1000, cfg)).toBe(1);
      expect(rangeAttenuation(100, 1000, cfg)).toBe(1);
      expect(rangeAttenuation(1500, 1000, cfg)).toBe(1);
    }
  });

  it('a fullFrac of 1 or more is a STEP: 1 below range, minFactor at and after it', () => {
    for (const fullFrac of [1, 1.2]) {
      const cfg = { fullFrac, minFactor: 0.8 };
      expect(rangeAttenuation(999, 1000, cfg)).toBe(1);
      expect(rangeAttenuation(1000, 1000, cfg)).toBe(0.8);
      expect(rangeAttenuation(1200, 1000, cfg)).toBe(0.8);
    }
  });

  it('a hostile dial never produces NaN or a factor outside [0, 1]', () => {
    const hostile = [
      { fullFrac: -1, minFactor: 0.8 },
      { fullFrac: 0.5, minFactor: 2 },
      { fullFrac: 0.5, minFactor: -3 },
      { fullFrac: Number.NaN, minFactor: Number.NaN },
      { fullFrac: Number.POSITIVE_INFINITY, minFactor: Number.NEGATIVE_INFINITY },
    ];
    for (const cfg of hostile) {
      for (const f of [0, 100, 500, 750, 1000, 2000]) {
        const a = rangeAttenuation(f, 1000, cfg);
        expect(Number.isNaN(a)).toBe(false);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the shipped CONFIG.gunAttenuation dials obey the same law (midway between fullFrac and range is the mean of 1 and minFactor)', () => {
    const { fullFrac, minFactor } = CONFIG.gunAttenuation;
    const mid = (fullFrac + 1) / 2;
    expect(rangeAttenuation(mid * 1000, 1000, CONFIG.gunAttenuation)).toBeCloseTo((1 + minFactor) / 2, 12);
    expect(rangeAttenuation(1000, 1000, CONFIG.gunAttenuation)).toBe(minFactor);
  });
});

describe('flakRimFactor — the rim deals (1 − rimFactor) of the centre, proportional by the nearest outline point', () => {
  it('is 1 at the centre, 1 − rimFactor at the rim, linear between, clamped past the rim', () => {
    expect(flakRimFactor(0, 50, 0.5)).toBe(1);
    expect(flakRimFactor(25, 50, 0.5)).toBeCloseTo(0.75, 12);
    expect(flakRimFactor(50, 50, 0.5)).toBe(0.5);
    expect(flakRimFactor(80, 50, 0.5)).toBe(0.5);
  });

  it('a non-positive or non-finite burst radius is no falloff', () => {
    expect(flakRimFactor(10, 0, 0.5)).toBe(1);
    expect(flakRimFactor(10, -1, 0.5)).toBe(1);
    expect(flakRimFactor(10, Number.NaN, 0.5)).toBe(1);
  });

  it('rimFactor is clamped to [0, 1]; a non-finite nearest distance reads as the rim', () => {
    expect(flakRimFactor(50, 50, 2)).toBe(0);
    expect(flakRimFactor(50, 50, -1)).toBe(1);
    expect(flakRimFactor(Number.NaN, 50, 0.5)).toBe(0.5);
    expect(flakRimFactor(-5, 50, 0.5)).toBe(1); // inside the outline
  });
});

describe('settleBlow — the ONE floor to a whole number, floor of one for a positive blow', () => {
  it('floors a fractional positive blow and keeps a whole one', () => {
    expect(settleBlow(6.4)).toBe(6);
    expect(settleBlow(13)).toBe(13);
    expect(settleBlow(4.2)).toBe(4);
  });

  it('absorbs float dust below a whole number (the epsilon)', () => {
    expect(settleBlow(14 - BLOW_FLOOR_EPS / 10)).toBe(14);
    expect(settleBlow(16 * 0.9)).toBe(14);
  });

  it('a positive blow under one deals one (the 1 hp drone shell at max range)', () => {
    expect(settleBlow(0.8)).toBe(1);
    expect(settleBlow(1e-6)).toBe(1);
  });

  it('a zero, negative or non-finite blow is no blow', () => {
    for (const raw of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(settleBlow(raw)).toBe(0);
  });

  it('composes with the curve and the rim per the I/O matrix (synthetic D, factors from the functions)', () => {
    // a Tier-I-like far shot: D × the at-range factor, floored once
    expect(settleBlow(8 * rangeAttenuation(1000, 1000, CFG))).toBe(Math.floor(8 * 0.8));
    // a flak rim at max range: D × half × the at-range factor
    expect(settleBlow(16 * flakRimFactor(50, 50, 0.5) * rangeAttenuation(1000, 1000, CFG))).toBe(Math.floor(16 * 0.5 * 0.8));
  });
});
