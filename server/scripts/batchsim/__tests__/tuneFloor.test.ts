// THE turnRate FLOOR — a leaf whose whole legitimate range sits below the
// blanket min-one floor.
//
// `TUNE_MIN_ONE_LEAVES` exists to stop a divide-or-spin hazard: ai/tactics.ts
// and ai/utility.ts both divide by `turnRate`, and a 0 there yields Infinity /
// NaN steer that game/inputs.ts silently drops, leaving bots inert while every
// report row still reads plausible. That hazard is real — but it is a divide by
// ZERO, and the floor was set at 1 while all three hulls ship 0.4 / 0.6 / 0.8.
// The leaf was therefore untunable at its own shipped values.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { applyOverrides, validateTuneKey, validateTuneValue, TunableError } from '../overrides.js';

const TURN = 'shipClasses.battleship.kinematics.turnRate';

describe('--tune floors — turnRate', () => {
  it('accepts every SHIPPED hull turn rate (the regression that motivated this)', () => {
    for (const hull of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const shipped = CONFIG.shipClasses[hull].kinematics.turnRate;
      expect(() => validateTuneValue(`shipClasses.${hull}.kinematics.turnRate`, shipped)).not.toThrow();
    }
  });

  it('accepts a plausible buffed value', () => {
    expect(() => validateTuneValue(TURN, 0.48)).not.toThrow();
  });

  it('still REFUSES zero — the divide hazard the floor exists for', () => {
    expect(() => validateTuneValue(TURN, 0)).toThrow(TunableError);
  });

  it('still refuses a negative and a non-finite value', () => {
    expect(() => validateTuneValue(TURN, -0.5)).toThrow(TunableError);
    expect(() => validateTuneValue(TURN, Number.NaN)).toThrow(TunableError);
    expect(() => validateTuneValue(TURN, Number.POSITIVE_INFINITY)).toThrow(TunableError);
  });

  it('leaves the OTHER min-one leaves at 1 — this corrects one magnitude, not the class', () => {
    expect(() => validateTuneValue('shipClasses.battleship.hp', 0.5)).toThrow(TunableError);
    expect(() => validateTuneValue('shipClasses.battleship.kinematics.steerageSpeed', 0.5)).toThrow(TunableError);
    expect(() => validateTuneValue('torpedo.speed', 0.5)).toThrow(TunableError);
    expect(() => validateTuneValue('gun.shellSpeed', 0.5)).toThrow(TunableError);
  });

  it('leaves the reload/cooldown suffix rule at 1', () => {
    expect(() => validateTuneValue('broadside.reloadMs', 0.5)).toThrow(TunableError);
    // Matched by SUFFIX, not exact leaf: a reload leaf with a prefix (the
    // hazard class the deleted `machineGun.idleReloadMs` motivated) and a
    // future `cooldownMs` both inherit the floor.
    expect(() => validateTuneValue('machineGun.swapReloadMs', 0.5)).toThrow(TunableError);
    expect(() => validateTuneValue('boost.cooldownMs', 0.5)).toThrow(TunableError);
  });

  it('floors the COUNTERMEASURE divisors at 1 (Story 9.3 review gate): r0 = 0 makes cloudScale non-finite, lifeMs = 0 measures no cloud', () => {
    for (const leaf of ['r0', 'lifeMs']) {
      const key = `countermeasure.${leaf}`;
      expect(() => validateTuneKey(key)).not.toThrow(); // a real --tune key
      expect(() => validateTuneValue(key, 0)).toThrow(TunableError);
      expect(() => validateTuneValue(key, 0.5)).toThrow(TunableError);
      expect(() => validateTuneValue(key, 1)).not.toThrow();
    }
  });

  it('REFUSES the retired `flak.edgeFalloff` by name, pointing at `flak.rimFactor` (Story 9.12, reading r7): an old arm fails loudly', () => {
    expect(() => validateTuneKey('flak.edgeFalloff')).toThrow(/RETIRED.*flak\.rimFactor/);
    expect(() => applyOverrides({}, { 'flak.edgeFalloff': 5 })).toThrow(TunableError);
  });

  it('takes `gun.barrels` as an INTEGER in [1, 3] (Story 9.12 review gate): 0 fires nothing, and past clampStats\'s 1..3 clamp or a fraction the arm would print moved while the sim fired the clamp', () => {
    expect(() => validateTuneKey('gun.barrels')).not.toThrow();
    expect(() => validateTuneValue('gun.barrels', CONFIG.gun.barrels)).not.toThrow();
    for (const ok of [1, 2, 3]) expect(() => validateTuneValue('gun.barrels', ok)).not.toThrow();
    for (const bad of [4, 9, 1.5, 0]) {
      expect(() => validateTuneValue('gun.barrels', bad)).toThrow(/clampStats/);
    }
  });

  it('still lets a genuinely zero-able dial be zero', () => {
    expect(() => validateTuneValue('gun.burstRadius', 0)).not.toThrow();
    expect(() => validateTuneValue('mine.damage', 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// THE WEIGHTING DIALS (Story 8.14 review, F5)
//
// `lineWeight(n) = max(floor, factor ** n)` (amendments 90/91). Both leaves are
// MULTIPLIERS in (0, 1], and the generic "finite and >= 0" floor let three arms
// through that measure something other than the mechanism:
//   - factor 0 with floor 0 weighs every taken line zero, so stage 2's
//     cumulative walk never crosses `r` and falls through to its float-dust
//     fallback: the LAST candidate, deterministically, every draw;
//   - floor 0 is the same trap once five captains have taken a line;
//   - factor > 1 INVERTS the rule — a taken line becomes MORE likely — while
//     the run key and the report header still say "weighting".
// A balance harness may not produce false evidence, so the range is refused.
// ---------------------------------------------------------------------------

describe('--tune ranges — the weapon weighting', () => {
  const FACTOR = 'offer.weighting.factor';
  const FLOOR = 'offer.weighting.floor';

  it('accepts the SHIPPED values and anything else inside (0, 1]', () => {
    expect(() => validateTuneValue(FACTOR, CONFIG.offer.weighting.factor)).not.toThrow();
    expect(() => validateTuneValue(FLOOR, CONFIG.offer.weighting.floor)).not.toThrow();
    for (const v of [0.01, 0.5, 0.9999, 1]) {
      expect(() => validateTuneValue(FACTOR, v)).not.toThrow();
      expect(() => validateTuneValue(FLOOR, v)).not.toThrow();
    }
  });

  it('REFUSES zero on both leaves — the fall-through-to-the-last-candidate trap', () => {
    expect(() => validateTuneValue(FACTOR, 0)).toThrow(TunableError);
    expect(() => validateTuneValue(FLOOR, 0)).toThrow(TunableError);
  });

  it('REFUSES anything above 1 — that inverts the rule rather than tuning it', () => {
    expect(() => validateTuneValue(FACTOR, 1.5)).toThrow(TunableError);
    expect(() => validateTuneValue(FLOOR, 1.0001)).toThrow(TunableError);
  });

  it('refuses a negative and a non-finite value', () => {
    expect(() => validateTuneValue(FACTOR, -0.25)).toThrow(TunableError);
    expect(() => validateTuneValue(FLOOR, Number.NaN)).toThrow(TunableError);
    expect(() => validateTuneValue(FACTOR, Number.POSITIVE_INFINITY)).toThrow(TunableError);
  });

  it('REFUSES floor > factor at APPLY time, and rolls the whole apply back', () => {
    const before = { ...CONFIG.offer.weighting };
    // Each leaf is legal on its own; the PAIR is not — so like the boost pair
    // this is only judgeable on the finished CONFIG.
    expect(() => validateTuneValue(FACTOR, 0.3)).not.toThrow();
    expect(() => validateTuneValue(FLOOR, 0.9)).not.toThrow();
    expect(() => applyOverrides({}, { [FACTOR]: 0.3, [FLOOR]: 0.9 })).toThrow(TunableError);
    expect(CONFIG.offer.weighting).toEqual(before); // all-or-nothing
  });

  it('accepts floor === factor, and a legal pair applies and restores', () => {
    const before = { ...CONFIG.offer.weighting };
    const restore = applyOverrides({}, { [FACTOR]: 0.5, [FLOOR]: 0.5 });
    expect(CONFIG.offer.weighting).toEqual({ factor: 0.5, floor: 0.5 });
    restore();
    expect(CONFIG.offer.weighting).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// THE DECK-GUN BLOW FRACTIONS (Story 9.12, Eric 2026-10-16, epic-9 amendments
// 184–185): the shared functions CLAMP an out-of-range dial, so an arm outside
// [0, 1] would print as moved while the sim ran the clamp — false evidence.
// `fullFrac` at or past 1 collapses the attenuation curve to a step at range,
// refused on the finished CONFIG like the dropout curve.
// ---------------------------------------------------------------------------

describe('--tune ranges — range attenuation and the flak rim', () => {
  const KEYS = ['gunAttenuation.fullFrac', 'gunAttenuation.minFactor', 'flak.rimFactor'];

  it('reaches all three leaves from 0, `minFactor` and `rimFactor` up to 1 inclusive, shipped values included', () => {
    for (const key of KEYS) {
      expect(() => validateTuneKey(key)).not.toThrow();
      expect(() => validateTuneValue(key, 0)).not.toThrow();
    }
    expect(() => validateTuneValue('gunAttenuation.minFactor', 1)).not.toThrow(); // attenuation off, a real arm
    expect(() => validateTuneValue('flak.rimFactor', 1)).not.toThrow();
    expect(() => validateTuneValue('gunAttenuation.fullFrac', CONFIG.gunAttenuation.fullFrac)).not.toThrow();
    expect(() => validateTuneValue('gunAttenuation.minFactor', CONFIG.gunAttenuation.minFactor)).not.toThrow();
    expect(() => validateTuneValue('flak.rimFactor', CONFIG.flak.rimFactor)).not.toThrow();
  });

  it('refuses anything outside [0, 1] and anything non-finite', () => {
    for (const key of KEYS) {
      expect(() => validateTuneValue(key, -0.1)).toThrow(TunableError);
      expect(() => validateTuneValue(key, 1.2)).toThrow(TunableError);
      expect(() => validateTuneValue(key, Number.NaN)).toThrow(TunableError);
    }
  });

  it('REFUSES `fullFrac` at 1 or more at the PARSE leaf (half-open [0, 1) — the curve would be a step)', () => {
    expect(() => validateTuneValue('gunAttenuation.fullFrac', 1)).toThrow(/\[0, 1\)/);
    expect(() => validateTuneValue('gunAttenuation.fullFrac', 1.2)).toThrow(TunableError);
    expect(() => validateTuneValue('gunAttenuation.fullFrac', 0.999)).not.toThrow();
  });

  it('REFUSES `fullFrac = 1` at APPLY time (the curve would be a step) and rolls the apply back', () => {
    const before = { ...CONFIG.gunAttenuation };
    expect(() => applyOverrides({}, { 'gunAttenuation.fullFrac': 1 })).toThrow(/fullFrac/);
    expect(CONFIG.gunAttenuation).toEqual(before); // all-or-nothing
  });

  it('a legal attenuation arm applies and restores', () => {
    const before = { ...CONFIG.gunAttenuation };
    const restore = applyOverrides({}, { 'gunAttenuation.fullFrac': 0.25, 'gunAttenuation.minFactor': 1 });
    expect(CONFIG.gunAttenuation).toEqual({ fullFrac: 0.25, minFactor: 1 });
    restore();
    expect(CONFIG.gunAttenuation).toEqual(before);
  });
});
