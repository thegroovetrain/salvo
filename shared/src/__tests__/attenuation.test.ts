// sim/attenuation.ts — the deck-gun blow arithmetic of Story 9.12 (Eric
// 2026-10-16, forge weapon-balance-math; epic-9 amendments 184–185). Every case
// runs on SYNTHETIC dials so the shape is what is tested, never the shipped
// numbers. (The range-attenuation curve's cases retired with the curve,
// 2026-11-12, Story 11.1.)
import { describe, expect, it } from 'vitest';
import { BLOW_FLOOR_EPS, flakRimFactor, settleBlow } from '../sim/attenuation.js';

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

  it('a positive blow under one deals one (a 1 hp shell at max range)', () => {
    expect(settleBlow(0.8)).toBe(1);
    expect(settleBlow(1e-6)).toBe(1);
  });

  it('a zero, negative or non-finite blow is no blow', () => {
    for (const raw of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(settleBlow(raw)).toBe(0);
  });

  it('composes with the rim per the I/O matrix (synthetic D, factor from the function)', () => {
    // a flak rim: D × half, floored once
    expect(settleBlow(16 * flakRimFactor(50, 50, 0.5))).toBe(Math.floor(16 * 0.5));
  });
});
