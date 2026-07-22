// Pins boostedKinematics (Story 1.6) — THE one shared per-tick hook both sim
// sides call to fold an active speed boost into a ship's kinematics. Four
// properties: identity (same reference) when inactive or bonus 0; forward
// maxSpeed +bonus when active; the input object is never mutated; and every
// other field — reverseSpeed above all — is carried through untouched.

import { describe, it, expect } from 'vitest';
import { CONFIG, boostedKinematics, type ShipConfig } from '../index.js';

/** A representative Torpedo Boat kinematics block to boost. */
function tbKinematics(): ShipConfig {
  return { ...CONFIG.shipClasses.torpedoBoat.kinematics };
}

const BONUS = CONFIG.speedBoost.speedBonus;

describe('boostedKinematics — inactive is an identity', () => {
  it('returns the SAME reference when inactive (allocation-free path)', () => {
    const kin = tbKinematics();
    expect(boostedKinematics(kin, BONUS, false)).toBe(kin);
  });

  it('returns the SAME reference when the bonus is 0, even if active', () => {
    const kin = tbKinematics();
    expect(boostedKinematics(kin, 0, true)).toBe(kin);
  });
});

describe('boostedKinematics — active raises the forward cap only', () => {
  it('adds the bonus to maxSpeed and nothing else', () => {
    const kin = tbKinematics();
    const boosted = boostedKinematics(kin, BONUS, true);
    expect(boosted.maxSpeed).toBe(kin.maxSpeed + BONUS);
    // TB 45 + 10 = 55 under Eric's rescale — stays under the 60 fish speed.
    expect(boosted.maxSpeed).toBe(55);
  });

  it('leaves reverseSpeed and every other field untouched', () => {
    const kin = tbKinematics();
    const boosted = boostedKinematics(kin, BONUS, true);
    expect(boosted.reverseSpeed).toBe(kin.reverseSpeed);
    expect(boosted.accel).toBe(kin.accel);
    expect(boosted.decel).toBe(kin.decel);
    expect(boosted.turnRate).toBe(kin.turnRate);
    expect(boosted.steerageSpeed).toBe(kin.steerageSpeed);
  });

  it('returns a FRESH object — never mutates its input', () => {
    const kin = tbKinematics();
    const before = { ...kin };
    const boosted = boostedKinematics(kin, BONUS, true);
    expect(boosted).not.toBe(kin);
    expect(kin).toEqual(before); // input untouched
  });
});
