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
import { applyOverrides, validateTuneValue, TunableError } from '../overrides.js';

const TURN = 'shipClasses.battleship.kinematics.turnRate';

describe('--tune floors — turnRate', () => {
  it('accepts every SHIPPED hull turn rate (the regression that motivated this)', () => {
    for (const hull of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const shipped = CONFIG.shipClasses[hull].kinematics.turnRate;
      expect(shipped).toBeLessThan(1); // the whole point: all three are sub-1
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
    expect(() => validateTuneValue('radarBuoy.gunReloadMs', 0.5)).toThrow(TunableError);
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
