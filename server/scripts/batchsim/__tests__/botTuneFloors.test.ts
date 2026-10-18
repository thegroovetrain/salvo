// THE `--tune bots.*` FLOORS (Story 9.13 fix wave P10, Edge Case Hunter): a
// bot dial whose arm would make the brain divide by zero, forget instantly,
// read every lone hull as a crowd, flag every plot a decoy, kite on top of its
// target or never fire a whole gun is refused at the parse leaf — a balance
// harness may not report a moved sim that is really a broken one. Each dial is
// pinned both ways: its shipped value is accepted, the hazard is refused.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { validateTuneKey, validateTuneValue } from '../overrides.js';

const accept = (key: string, value: number): void => {
  expect(() => validateTuneKey(key)).not.toThrow();
  expect(() => validateTuneValue(key, value)).not.toThrow();
};
const refuse = (key: string, value: number): void => {
  expect(() => validateTuneValue(key, value), `${key}=${value}`).toThrow();
};

describe('P10 (Edge Case Hunter): --tune bots.* floors', () => {
  it('aimScatterRefU / contactMemoryMs / outnumberedCount / decoyStillSweeps are floored at 1', () => {
    for (const key of ['bots.aimScatterRefU', 'bots.contactMemoryMs', 'bots.outnumberedCount', 'bots.decoyStillSweeps']) {
      const leaf = key.slice('bots.'.length) as 'aimScatterRefU' | 'contactMemoryMs' | 'outnumberedCount' | 'decoyStillSweeps';
      accept(key, CONFIG.bots[leaf]);
      accept(key, 1);
      refuse(key, 0);
      refuse(key, 0.5);
    }
  });

  it('kiteHoldFrac lives on (0, 1]', () => {
    accept('bots.kiteHoldFrac', CONFIG.bots.kiteHoldFrac);
    accept('bots.kiteHoldFrac', 1);
    accept('bots.kiteHoldFrac', 0.01);
    refuse('bots.kiteHoldFrac', 0);
    refuse('bots.kiteHoldFrac', 1.01);
    refuse('bots.kiteHoldFrac', -0.1);
  });

  it('a 0 far edge on a gun band is refused (the gun would never fire); a positive one is accepted', () => {
    for (const gun of ['machineGun', 'flak'] as const) {
      const key = `bots.gunBand.${gun}.1`;
      accept(key, CONFIG.bots.gunBand[gun][1]);
      accept(key, 0.25);
      refuse(key, 0);
    }
    // The NEAR edge may still be 0 (the MG / flak bands ship [0, 0.5]).
    accept('bots.gunBand.machineGun.0', 0);
  });

  it('nav.routeRetryMs is floored at 1', () => {
    accept('bots.nav.routeRetryMs', CONFIG.bots.nav.routeRetryMs);
    accept('bots.nav.routeRetryMs', 1);
    refuse('bots.nav.routeRetryMs', 0);
  });
});
