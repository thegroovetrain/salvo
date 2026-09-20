// Pins slowedKinematics (Story 2.8) — the prop-fouling slow's shared per-tick
// hook, mirroring boost.test.ts property-for-property: identity (same
// reference) when inactive or factor 1; BOTH speed caps scaled when active;
// the input object is never mutated; every other field carried through
// untouched. Composition order is pinned boosted → slowed → hooks (documented
// in sim/boost.ts and sim/slow.ts; the cross-fold case below proves the
// arithmetic of that order).

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

  it('the ratified values: the fouling slow cuts speed 25% for slowDurationMs', () => {
    // Eric ruling 2026-08-19 (Story 7-5): *"simply slows affected ships by 25%
    // for 5 seconds"* — was 0.5 / 4000ms. The slow got WEAKER and LONGER, and
    // the doctrine stopped costing damage entirely.
    //
    // THE PIN MOVED HOME, not value (Eric ruling 2026-09-19, epic-8 amendment
    // 81): FOULING MINES is its own tiered EQUIPMENT line now and NAVAL MINES
    // no longer foul, so `CONFIG.mine.foulFactor`/`foulDurationMs` became
    // `CONFIG.foulingMines.slowFactor`/`slowDurationMs`. The tier-I numbers
    // are unchanged; tiers II–V deepen the FACTOR by 0.05 each (×0.55 at V)
    // and the 5 s window never moves.
    expect(CONFIG.foulingMines.slowFactor).toBe(0.75);
    expect(CONFIG.foulingMines.slowDurationMs).toBe(5000);
    expect('foulFactor' in CONFIG.mine).toBe(false);
    expect('foulDurationMs' in CONFIG.mine).toBe(false);
  });

  it('the fouling SLOW deepens by tier and the DURATION never does (amendment 81)', () => {
    const factorAt = (n: number): number =>
      effectiveStats(CONFIG.shipClasses.mineLayer, new Array<string>(n).fill('foulingMines'))
        .equipment.foulingMines.slowFactor;
    // CLOSE-TO, NOT EXACT, AND DELIBERATELY SO: an additive −0.05 ladder
    // accumulates float dust (0.55 folds to 0.5499999999999998) and nothing
    // rounds it, because — unlike `cooldownScale`, which feeds a 50 ms-
    // quantized reload tick — a speed cap has no quantum for the dust to cost
    // a step of. Both sides run the identical arithmetic, so it cannot desync.
    for (const [n, want] of [[1, 0.75], [2, 0.7], [3, 0.65], [4, 0.6], [5, 0.55]] as const) {
      expect(factorAt(n), `${n} copies`).toBeCloseTo(want, 9);
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
