// Pins slowedKinematics (Story 2.8) — the prop-fouling slow's shared per-tick
// hook, mirroring boost.test.ts property-for-property: identity (same
// reference) when inactive or factor 1; BOTH speed caps scaled when active;
// the input object is never mutated; every other field carried through
// untouched. Composition order is pinned boosted → slowed → hooks (documented
// in sim/boost.ts and sim/slow.ts; the cross-fold case below proves the
// arithmetic of that order).

import { describe, it, expect } from 'vitest';
import { CONFIG, boostedKinematics, slowedKinematics, type ShipConfig } from '../index.js';

/** A representative Torpedo Boat kinematics block to slow. */
function tbKinematics(): ShipConfig {
  return { ...CONFIG.shipClasses.torpedoBoat.kinematics };
}

const FACTOR = CONFIG.mine.foulFactor;

describe('slowedKinematics — inactive is an identity', () => {
  it('returns the SAME reference when inactive (allocation-free path)', () => {
    const kin = tbKinematics();
    expect(slowedKinematics(kin, FACTOR, false)).toBe(kin);
  });

  it('returns the SAME reference when the factor is 1, even if active', () => {
    const kin = tbKinematics();
    expect(slowedKinematics(kin, 1, true)).toBe(kin);
  });
});

describe('slowedKinematics — active scales BOTH speed caps', () => {
  it('scales maxSpeed AND reverseSpeed by the factor (a fouled prop is slow both ways)', () => {
    const kin = tbKinematics();
    const slowed = slowedKinematics(kin, FACTOR, true);
    expect(slowed.maxSpeed).toBeCloseTo(kin.maxSpeed * FACTOR, 9);
    expect(slowed.reverseSpeed).toBeCloseTo(kin.reverseSpeed * FACTOR, 9);
  });

  it('leaves accel, decel, turnRate and steerageSpeed untouched', () => {
    const kin = tbKinematics();
    const slowed = slowedKinematics(kin, FACTOR, true);
    expect(slowed.accel).toBe(kin.accel);
    expect(slowed.decel).toBe(kin.decel);
    expect(slowed.turnRate).toBe(kin.turnRate);
    expect(slowed.steerageSpeed).toBe(kin.steerageSpeed);
  });

  it('returns a FRESH object — never mutates its input', () => {
    const kin = tbKinematics();
    const before = { ...kin };
    const slowed = slowedKinematics(kin, FACTOR, true);
    expect(slowed).not.toBe(kin);
    expect(kin).toEqual(before);
  });

  it('the CONFIG draft: foulFactor halves speed for foulDurationMs', () => {
    expect(CONFIG.mine.foulFactor).toBe(0.5);
    expect(CONFIG.mine.foulDurationMs).toBe(4000);
  });
});

describe('composition order — boosted → slowed (the pinned fold order)', () => {
  it('slow applies OVER the boosted cap: (max + bonus) × factor', () => {
    const kin = tbKinematics();
    const bonus = CONFIG.speedBoost.speedBonus;
    const folded = slowedKinematics(boostedKinematics(kin, bonus, true), FACTOR, true);
    expect(folded.maxSpeed).toBeCloseTo((kin.maxSpeed + bonus) * FACTOR, 9);
    // The reverse cap never saw the boost but IS slowed.
    expect(folded.reverseSpeed).toBeCloseTo(kin.reverseSpeed * FACTOR, 9);
    // The order is load-bearing: slow-then-boost would differ.
    const wrongOrder = boostedKinematics(slowedKinematics(kin, FACTOR, true), bonus, true);
    expect(wrongOrder.maxSpeed).not.toBeCloseTo(folded.maxSpeed, 9);
  });

  it('both inactive: the whole fold is the input reference (allocation-free tick)', () => {
    const kin = tbKinematics();
    expect(slowedKinematics(boostedKinematics(kin, CONFIG.speedBoost.speedBonus, false), FACTOR, false)).toBe(kin);
  });
});
