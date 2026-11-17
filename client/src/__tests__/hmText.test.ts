// THE CLIENT'S ONE DISTANCE PRINTER (Story 11.2, util/hmText.ts): every
// distance a player reads prints in hectometers — whole through the shared
// `formatHm` from 10 hm up, one decimal under it. Contracts only: the relation
// to the shared ruler, never a pinned string of a CONFIG value.

import { describe, expect, it } from 'vitest';
import { formatHm, hmToU } from '@salvo/shared';
import { DISTANCE_FIELDS, hmText, isDistanceField } from '../util/hmText.js';

describe('hmText', () => {
  it('from 10 hm up it IS the shared formatHm (whole hectometers)', () => {
    for (const hm of [10, 12.4, 99.6, 380, 523, 1234.5]) expect(hmText(hmToU(hm)), `${hm}`).toBe(formatHm(hmToU(hm)));
  });

  it('under 10 hm it keeps exactly one decimal, rounded on the ruler', () => {
    for (const hm of [0, 0.04, 1.3, 2.25, 9.94]) {
      const t = hmText(hmToU(hm));
      expect(t, `${hm}`).toMatch(/^\d\.\d$/);
      expect(Math.abs(Number(t) - hm), `${hm}`).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it('two radii a whole-hm print would merge stay apart under 10 hm', () => {
    expect(hmText(hmToU(1.2))).not.toBe(hmText(hmToU(1.6)));
  });

  it('never prints "-0" and fails closed to "" on a non-finite input', () => {
    expect(hmText(-1e-9)).toBe('0.0');
    expect(hmText(Number.NaN)).toBe('');
    expect(hmText(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('the distance fields are the reach, the run and the effect radii', () => {
    for (const f of ['rangeU', 'runU', 'burstRadius', 'blastRadius', 'triggerRadius']) expect(isDistanceField(f), f).toBe(true);
    for (const f of ['damage', 'reloadMs', 'speed', 'maxAmmo']) expect(isDistanceField(f), f).toBe(false);
    expect(DISTANCE_FIELDS.size).toBeGreaterThan(0);
  });
});
