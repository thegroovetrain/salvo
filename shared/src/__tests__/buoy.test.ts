// The BUOY LAW (sim/buoy.ts) — Story 10.9, Eric rulings 2026-10-28 (epic-10
// amendment 4): the four buoy kinds, the line-id ↔ kind map, the inside test,
// the shield/speed TAIL (full through the hold, linear to zero over the ramp)
// and the combined boost factor (Shift + SPEED BUOY add on the BASE, ruling
// 6). Every number is read from CONFIG.buoy — never pinned; the RELATION is
// what is tested.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_IDS,
  BUOY_KINDS,
  BUOY_LINE_IDS,
  isBuoyLine,
  buoyKindOf,
  buoyTail,
  insideBuoy,
  combinedBoostFactor,
} from '../index.js';

const HOLD = CONFIG.buoy.tailHoldMs;
const RAMP = CONFIG.buoy.tailRampMs;

describe('the four kinds and their lines', () => {
  it('BUOY_LINE_IDS are four distinct consumable ids, each mapping to its own kind', () => {
    expect(BUOY_LINE_IDS).toHaveLength(BUOY_KINDS.length);
    expect(new Set(BUOY_LINE_IDS).size).toBe(BUOY_LINE_IDS.length);
    for (const id of BUOY_LINE_IDS) expect((CONSUMABLE_IDS as readonly string[]).includes(id), id).toBe(true);
    const kinds = BUOY_LINE_IDS.map((id) => buoyKindOf(id));
    expect([...kinds].sort()).toEqual([...BUOY_KINDS].sort());
  });

  it('isBuoyLine is true for exactly the four buoy lines over every consumable id (and false for junk)', () => {
    for (const id of CONSUMABLE_IDS) {
      expect(isBuoyLine(id), id).toBe((BUOY_LINE_IDS as readonly string[]).includes(id));
    }
    expect(isBuoyLine('decoyBuoy')).toBe(false);
    expect(isBuoyLine('')).toBe(false);
  });
});

describe('buoyTail — 1 through the hold, linear to 0 over the ramp', () => {
  it('is 0 when the hull was never inside (insideAt <= 0)', () => {
    expect(buoyTail(1000, 0, HOLD, RAMP)).toBe(0);
    expect(buoyTail(1000, -5, HOLD, RAMP)).toBe(0);
  });

  it('is exactly 1 from the stamp through the end of the hold', () => {
    const at = 10_000;
    expect(buoyTail(at, at, HOLD, RAMP)).toBe(1);
    expect(buoyTail(at + HOLD / 2, at, HOLD, RAMP)).toBe(1);
    expect(buoyTail(at + HOLD, at, HOLD, RAMP)).toBe(1);
  });

  it('falls linearly from 1 to 0 across the ramp and is 0 after it', () => {
    const at = 10_000;
    expect(buoyTail(at + HOLD + RAMP / 4, at, HOLD, RAMP)).toBeCloseTo(0.75, 12);
    expect(buoyTail(at + HOLD + RAMP / 2, at, HOLD, RAMP)).toBeCloseTo(0.5, 12);
    expect(buoyTail(at + HOLD + (3 * RAMP) / 4, at, HOLD, RAMP)).toBeCloseTo(0.25, 12);
    expect(buoyTail(at + HOLD + RAMP, at, HOLD, RAMP)).toBe(0);
    expect(buoyTail(at + HOLD + RAMP + 1, at, HOLD, RAMP)).toBe(0);
    expect(buoyTail(at + HOLD + RAMP * 50, at, HOLD, RAMP)).toBe(0);
  });

  it('is monotone non-increasing in now and always clamped to [0, 1]', () => {
    const at = 7_777;
    let prev = 1;
    for (let t = at; t <= at + HOLD + RAMP + 1000; t += 250) {
      const v = buoyTail(t, at, HOLD, RAMP);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    // A clock that reads BEFORE the stamp is still inside the hold (clamped high).
    expect(buoyTail(at - 1, at, HOLD, RAMP)).toBe(1);
  });

  it('a zero ramp is a step: 1 through the hold, 0 the instant after', () => {
    expect(buoyTail(1000 + HOLD, 1000, HOLD, 0)).toBe(1);
    expect(buoyTail(1000 + HOLD + 1, 1000, HOLD, 0)).toBe(0);
  });

  it('is NaN-safe: any non-finite input reads 0', () => {
    expect(buoyTail(Number.NaN, 1000, HOLD, RAMP)).toBe(0);
    expect(buoyTail(1000, Number.NaN, HOLD, RAMP)).toBe(0);
    expect(buoyTail(1000, 1000, Number.POSITIVE_INFINITY, RAMP)).toBe(0);
    expect(buoyTail(1000, 1000, HOLD, Number.NaN)).toBe(0);
  });
});

describe('insideBuoy — the centre within the radius, inclusive', () => {
  const R = CONFIG.buoy.radiusU;
  it('inside, on the edge and just outside', () => {
    expect(insideBuoy(0, 0, R / 2, 0, R)).toBe(true);
    expect(insideBuoy(0, 0, R, 0, R)).toBe(true);
    expect(insideBuoy(0, 0, 0, -R, R)).toBe(true);
    expect(insideBuoy(0, 0, R + 1e-6, 0, R)).toBe(false);
    expect(insideBuoy(100, 100, 100 + R * 0.8, 100 + R * 0.8, R)).toBe(false); // diagonal: R·1.13
  });

  it('is symmetric in the two points', () => {
    expect(insideBuoy(10, 20, 30, 40, 50)).toBe(insideBuoy(30, 40, 10, 20, 50));
  });
});

describe('combinedBoostFactor — Shift and SPEED BUOY add on the base (ruling 6)', () => {
  const SHIFT = CONFIG.boost.factor;
  const BUOY = CONFIG.buoy.speed.factor;

  it('neither active → 0; Shift alone → the Shift factor; buoy alone → the buoy factor × tail', () => {
    expect(combinedBoostFactor(false, 0, SHIFT, BUOY)).toBe(0);
    expect(combinedBoostFactor(true, 0, SHIFT, BUOY)).toBe(SHIFT);
    expect(combinedBoostFactor(false, 1, SHIFT, BUOY)).toBe(BUOY);
    expect(combinedBoostFactor(false, 0.5, SHIFT, BUOY)).toBeCloseTo(BUOY * 0.5, 12);
  });

  it('both → the SUM (adds on the base, never a product)', () => {
    expect(combinedBoostFactor(true, 1, SHIFT, BUOY)).toBe(SHIFT + BUOY);
    expect(combinedBoostFactor(true, 1, SHIFT, BUOY)).not.toBe((1 + SHIFT) * (1 + BUOY) - 1);
  });
});
