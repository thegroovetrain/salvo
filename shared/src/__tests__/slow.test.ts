// Pins slowedKinematics (Story 2.8) — the prop-fouling slow's shared per-tick
// hook, mirroring boost.test.ts property-for-property: identity (same
// reference) when inactive or factor 1; BOTH speed caps scaled when active;
// the input object is never mutated; every other field carried through
// untouched. Composition order is pinned boosted → slowed (mine) → slowed
// (shell) → drafted → hooks (documented in sim/slow.ts; the cross-fold cases
// below prove the arithmetic of that order).

import { describe, it, expect } from 'vitest';
import { CONFIG, boostedKinematics, effectiveStats, slowedKinematics, type ShipConfig } from '../index.js';

/** A representative Torpedo Boat kinematics block to slow. */
function tbKinematics(): ShipConfig {
  return { ...CONFIG.shipClasses.torpedoBoat.kinematics };
}

const FACTOR = CONFIG.foulingMines.slowFactor;

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

  it('the fouling SLOW deepens by tier from its CONFIG base and never reaches a full stop (amendment 81)', () => {
    const factorAt = (n: number): number =>
      effectiveStats(CONFIG.shipClasses.mineLayer, new Array<string>(n).fill('foulingMines'))
        .equipment.foulingMines.slowFactor;
    // CLOSE-TO, NOT EXACT, AND DELIBERATELY SO: an additive −0.05 ladder
    // accumulates float dust (0.55 folds to 0.5499999999999998) and nothing
    // rounds it, because — unlike `cooldownScale`, which feeds a 50 ms-
    // quantized reload tick — a speed cap has no quantum for the dust to cost
    // a step of. Both sides run the identical arithmetic, so it cannot desync.
    expect(factorAt(1)).toBeCloseTo(CONFIG.foulingMines.slowFactor, 9);
    for (let n = 2; n <= 5; n++) {
      expect(factorAt(n), `${n} copies`).toBeLessThan(factorAt(n - 1));
    }
    // A capped fouling mine still leaves the victim MOVING — never a full stop.
    expect(factorAt(5)).toBeGreaterThan(0);
  });
});

describe('composition order — boosted → slowed (the pinned fold order)', () => {
  it('slow applies OVER the boosted cap: (max + max × factor) × slowFactor', () => {
    const kin = tbKinematics();
    // Story 8.9: the boost is PROPORTIONAL — `CONFIG.boost.factor` of the
    // post-fold max, not a flat u/s (epic-8 amendment 55).
    const f = CONFIG.boost.factor;
    const folded = slowedKinematics(boostedKinematics(kin, f, true), FACTOR, true);
    expect(folded.maxSpeed).toBeCloseTo((kin.maxSpeed + kin.maxSpeed * f) * FACTOR, 9);
    // The reverse cap never saw the boost but IS slowed.
    expect(folded.reverseSpeed).toBeCloseTo(kin.reverseSpeed * FACTOR, 9);
    // THE TWO FOLDS NOW COMMUTE (Story 8.9): a proportional boost and a
    // proportional slow are both multiplications, so slow-then-boost lands on
    // the same number — it did NOT while the boost was a flat +10 u/s. The
    // pinned order is still the contract (server and predictor must execute
    // the SAME sequence, and a future non-proportional fold in the chain would
    // make it load-bearing again); it is simply no longer observable here.
    const flipped = boostedKinematics(slowedKinematics(kin, FACTOR, true), f, true);
    expect(flipped.maxSpeed).toBeCloseTo(folded.maxSpeed, 9);
  });

  it('both inactive: the whole fold is the input reference (allocation-free tick)', () => {
    const kin = tbKinematics();
    expect(slowedKinematics(boostedKinematics(kin, CONFIG.boost.factor, false), FACTOR, false)).toBe(kin);
  });
});

// THE TWO SLOW SOURCES (Story 9.4, Eric 2026-10-11, epic-9 amendments 61–68):
// the fouling MINE's slow and the FOULING SHELL zone's slow are two calls of
// the one fold — boosted → slowed (mine) → slowed (shell) → drafted → hooks.
// Different sources multiply; the same source is one stamp per hull, so the
// callers call the shell fold ONCE however many zones touch the hull (a
// second zone extends `fouledUntil`, it never adds a third call).
describe('two slow sources — mine × shell multiply through the one fold', () => {
  const SHELL = CONFIG.foulingShell.slowFactor;

  it('the shell alone scales both caps by its CONFIG factor', () => {
    const kin = tbKinematics();
    const shell = slowedKinematics(kin, SHELL, true);
    expect(shell.maxSpeed).toBeCloseTo(kin.maxSpeed * SHELL, 9);
    expect(shell.reverseSpeed).toBeCloseTo(kin.reverseSpeed * SHELL, 9);
  });

  it('a mine slow then the shell slow multiply on both caps', () => {
    const kin = tbKinematics();
    const both = slowedKinematics(slowedKinematics(kin, 0.55, true), SHELL, true);
    expect(both.maxSpeed).toBeCloseTo(kin.maxSpeed * 0.55 * SHELL, 9);
    expect(both.reverseSpeed).toBeCloseTo(kin.reverseSpeed * 0.55 * SHELL, 9);
  });

  it('when the mine window lapses only the shell factor remains', () => {
    const kin = tbKinematics();
    const shellOnly = slowedKinematics(slowedKinematics(kin, 0.55, false), SHELL, true);
    expect(shellOnly.maxSpeed).toBeCloseTo(kin.maxSpeed * SHELL, 9);
    expect(shellOnly.reverseSpeed).toBeCloseTo(kin.reverseSpeed * SHELL, 9);
  });

  it('both sources inactive: the input reference comes back (allocation-free tick)', () => {
    const kin = tbKinematics();
    expect(slowedKinematics(slowedKinematics(kin, 0.55, false), SHELL, false)).toBe(kin);
  });
});
