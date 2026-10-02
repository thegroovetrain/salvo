// Pins draftedKinematics (Story 8.19, Eric rulings 2026-09-30, epic-8
// amendments 151–155) — the wake draft's shared per-tick fold, mirroring
// boost.test.ts / slow.test.ts: identity (same reference) when inactive or the
// lift is 0; the forward maxSpeed cap raised by `lift` OF ITSELF through the
// PINNED expression `m + m * lift`; reverse untouched; the input never
// mutated. The "Fold order" matrix row proves the pinned composition
// boosted → slowed → drafted → hooks, and CONFIG.wake.draft's numbers are
// pinned beside it.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  boostedKinematics,
  draftedKinematics,
  hookKinematics,
  slowedKinematics,
  type HookRegistry,
  type ShipConfig,
} from '../index.js';

/** A representative Torpedo Boat kinematics block (maxSpeed 45). */
function tbKinematics(): ShipConfig {
  return { ...CONFIG.shipClasses.torpedoBoat.kinematics };
}

describe('CONFIG.wake.draft — the drafting dials (amendments 151–152)', () => {
  it('lift is 5 % and the lane half-width is one wake-maker hull width', () => {
    expect(CONFIG.wake.draft.lift).toBe(0.05);
    expect(CONFIG.wake.draft.halfWidthBeams).toBe(1);
    expect(Object.keys(CONFIG.wake)).toEqual(['draft']);
    expect(Object.keys(CONFIG.wake.draft).sort()).toEqual(['halfWidthBeams', 'lift']);
  });

  it('the wake clocks stay in CONFIG.vision', () => {
    expect(CONFIG.vision.wakeLifeMs).toBeGreaterThan(0);
    expect(CONFIG.vision.wakeSampleU).toBeGreaterThan(0);
  });
});

describe('draftedKinematics — inactive is an identity', () => {
  it('returns the SAME reference when inactive', () => {
    const kin = tbKinematics();
    expect(draftedKinematics(kin, 0.05, false)).toBe(kin);
  });

  it('returns the SAME reference when the lift is 0, even if active', () => {
    const kin = tbKinematics();
    expect(draftedKinematics(kin, 0, true)).toBe(kin);
  });
});

describe('draftedKinematics — active raises the forward cap only', () => {
  it('uses the PINNED expression m + m * lift (never m * (1 + lift))', () => {
    const kin = tbKinematics();
    for (const lift of [0.05, 0.03, 0.0123456789, 1e-9, CONFIG.wake.draft.lift]) {
      const out = draftedKinematics(kin, lift, true);
      expect(out.maxSpeed).toBe(kin.maxSpeed + kin.maxSpeed * lift);
    }
  });

  it('leaves reverseSpeed and every other field untouched', () => {
    const kin = tbKinematics();
    const out = draftedKinematics(kin, 0.05, true);
    expect(out).not.toBe(kin);
    expect(out.reverseSpeed).toBe(kin.reverseSpeed);
    expect(out.accel).toBe(kin.accel);
    expect(out.decel).toBe(kin.decel);
    expect(out.turnRate).toBe(kin.turnRate);
    expect(out.steerageSpeed).toBe(kin.steerageSpeed);
    expect(Object.keys(out).sort()).toEqual(Object.keys(kin).sort());
  });

  it('never mutates its input', () => {
    const kin = tbKinematics();
    const before = { ...kin };
    draftedKinematics(kin, 0.05, true);
    expect(kin).toEqual(before);
  });
});

describe('the pinned composition boosted → slowed → drafted → hooks (Fold order row)', () => {
  it('boost open + fouled 0.75 + draft 0.05 at maxSpeed 45', () => {
    const kin = tbKinematics();
    expect(kin.maxSpeed).toBe(45);
    const empty: HookRegistry = {};
    const boosted = boostedKinematics(kin, 0.25, true);
    const slowed = slowedKinematics(boosted, 0.75, true);
    const drafted = draftedKinematics(slowed, 0.05, true);
    const out = hookKinematics(drafted, [], empty);
    // An empty registry is an identity on the drafted result.
    expect(out).toBe(drafted);

    const m = (45 + 45 * 0.25) * 0.75;
    expect(slowed.maxSpeed).toBe(m);
    expect(out.maxSpeed).toBe(m + m * 0.05);
    // Reverse is slowed only — neither the boost nor the draft touches it.
    expect(out.reverseSpeed).toBe(kin.reverseSpeed * 0.75);
  });

  it('a zero draft leaves the pre-8.19 boosted → slowed → hooks result byte-identical', () => {
    const kin = tbKinematics();
    const slowed = slowedKinematics(boostedKinematics(kin, 0.25, true), 0.75, true);
    expect(draftedKinematics(slowed, 0, false)).toBe(slowed);
    expect(draftedKinematics(slowed, 0, true)).toBe(slowed);
  });
});
