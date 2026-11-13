// THE INDEX FLOORS (Story 10.3, 2026-11-04 — replaces the `turnRate` 0.05
// floor, whose leaf left CONFIG when the turn rate became DERIVED from the
// RUDDER index). Every `shipClasses.<cls>.index.<id>` is a --tune leaf; the
// three indices the fold divides by or scales through (reload / engines /
// intel — RANGE, the fourth, left the index with Story 11.2, R9) are floored at 1 — clampStats floors them there, so
// a 0 arm would print as moved while the sim ran 1 — and ARMOR / POWER keep
// floor 0.

import { describe, it, expect } from 'vitest';
import { CONFIG, INDEX_IDS, SHIP_CLASS_IDS } from '@salvo/shared';
import { applyOverrides, validateTuneKey, validateTuneValue, TunableError } from '../overrides.js';

const FLOOR_ONE = ['reload', 'engines', 'intel'] as const;

describe('--tune floors — the class indices', () => {
  it('every class index is a --tune key and accepts its SHIPPED value', () => {
    for (const cls of SHIP_CLASS_IDS) {
      for (const id of INDEX_IDS) {
        const key = `shipClasses.${cls}.index.${id}`;
        expect(() => validateTuneKey(key)).not.toThrow();
        expect(() => validateTuneValue(key, CONFIG.shipClasses[cls].index[id])).not.toThrow();
      }
    }
  });

  it('REFUSES zero (and anything under 1) on the derivation indices', () => {
    for (const id of FLOOR_ONE) {
      const key = `shipClasses.bismarck.index.${id}`;
      expect(() => validateTuneValue(key, 0)).toThrow(TunableError);
      expect(() => validateTuneValue(key, 0.5)).toThrow(TunableError);
      expect(() => validateTuneValue(key, 1)).not.toThrow();
    }
  });

  it('ARMOR and POWER may be zero; nothing may be negative or non-finite', () => {
    for (const id of ['armor', 'power']) {
      const key = `shipClasses.bismarck.index.${id}`;
      expect(() => validateTuneValue(key, 0)).not.toThrow();
      expect(() => validateTuneValue(key, -1)).toThrow(TunableError);
      expect(() => validateTuneValue(key, Number.NaN)).toThrow(TunableError);
    }
  });

  it('the retired speed leaves are no --tune keys: the speed and turn rate are DERIVED', () => {
    expect(() => validateTuneKey('shipClasses.bismarck.kinematics.maxSpeed')).toThrow(TunableError);
    expect(() => validateTuneKey('shipClasses.bismarck.kinematics.turnRate')).toThrow(TunableError);
  });

  it('leaves the OTHER min-one leaves at 1', () => {
    expect(() => validateTuneValue('shipClasses.bismarck.hp', 0.5)).toThrow(TunableError);
    expect(() => validateTuneValue('shipClasses.bismarck.kinematics.steerageSpeed', 0.5)).toThrow(TunableError);
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
// THE DECK-GUN BLOW FRACTION (Story 9.12, Eric 2026-10-16, epic-9 amendments
// 184–185): the shared function CLAMPS an out-of-range dial, so an arm outside
// [0, 1] would print as moved while the sim ran the clamp — false evidence.
// The range-attenuation dials (`gunAttenuation.*`) retired with the block
// (2026-11-12, Story 11.1): the family itself is refused.
// ---------------------------------------------------------------------------

describe('--tune ranges — the flak rim', () => {
  it('reaches `flak.rimFactor` from 0 up to 1 inclusive, the shipped value included', () => {
    expect(() => validateTuneKey('flak.rimFactor')).not.toThrow();
    for (const v of [0, 1, CONFIG.flak.rimFactor]) expect(() => validateTuneValue('flak.rimFactor', v)).not.toThrow();
  });

  it('refuses anything outside [0, 1] and anything non-finite', () => {
    for (const v of [-0.1, 1.2, Number.NaN]) expect(() => validateTuneValue('flak.rimFactor', v)).toThrow(TunableError);
  });

  it('the retired `gunAttenuation.*` family is refused by key (no dial is left to move)', () => {
    for (const key of ['gunAttenuation.fullFrac', 'gunAttenuation.minFactor']) expect(() => validateTuneKey(key)).toThrow(TunableError);
  });
});
