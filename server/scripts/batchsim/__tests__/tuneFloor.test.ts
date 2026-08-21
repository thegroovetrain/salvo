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
import { validateTuneValue, TunableError } from '../overrides.js';

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
