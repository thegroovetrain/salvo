// rangeBands.ts — the pure half of the main-battery hit-share-by-range-band
// readout (Story 11.1). Contracts only: the band arithmetic against the
// reach, and the "damaged a hull" rule read off one tick's events.

import { describe, it, expect } from 'vitest';
import { CONFIG, type GameEvent, type ShellState } from '@salvo/shared';
import { RANGE_BANDS, emptyBands, isMainBatteryShell, rangeBandOf, shellDamagedHull } from '../rangeBands.js';
import { bandLine } from '../botReadoutReport.js';
import { isDeckGunShell } from '../botReadouts.js';

describe('rangeBandOf — four equal bands of the reach, nearest first', () => {
  it('cuts the reach into RANGE_BANDS equal bands; the edges belong to the farther band', () => {
    const reach = 1000;
    for (let b = 0; b < RANGE_BANDS; b += 1) {
      const lo = (b * reach) / RANGE_BANDS;
      expect(rangeBandOf(lo, reach), `band ${b} low edge`).toBe(b);
      expect(rangeBandOf(lo + reach / RANGE_BANDS / 2, reach), `band ${b} middle`).toBe(b);
    }
  });

  it('a shot at or past the reach, and a degenerate reach, file in the last band; a negative range in the first', () => {
    expect(rangeBandOf(1000, 1000)).toBe(RANGE_BANDS - 1);
    expect(rangeBandOf(5000, 1000)).toBe(RANGE_BANDS - 1);
    expect(rangeBandOf(10, 0)).toBe(RANGE_BANDS - 1);
    expect(rangeBandOf(Number.NaN, 1000)).toBe(RANGE_BANDS - 1);
    expect(rangeBandOf(-3, 1000)).toBe(0);
  });

  it('emptyBands is one zero per band', () => {
    expect(emptyBands()).toEqual(new Array(RANGE_BANDS).fill(0));
  });
});

describe('shellDamagedHull — one tick\'s events', () => {
  const burst: GameEvent = { k: 'burst', id: 's1', x: 10, y: 20 };
  it('a burst WITH its owner\'s `hc` at the same point is a hit; without one, or with another\'s, it is not', () => {
    expect(shellDamagedHull([burst, { k: 'hc', id: 'own', x: 10, y: 20 }], 's1', 'own')).toBe(true);
    expect(shellDamagedHull([burst], 's1', 'own')).toBe(false);
    expect(shellDamagedHull([burst, { k: 'hc', id: 'other', x: 10, y: 20 }], 's1', 'own')).toBe(false);
    expect(shellDamagedHull([burst, { k: 'hc', id: 'own', x: 11, y: 20 }], 's1', 'own')).toBe(false); // another shell's hit
  });

  it('a `boom` naming the shell with a `hit` is a hit; a hit-less boom (a beacon, open water) is not', () => {
    expect(shellDamagedHull([{ k: 'boom', id: 's1', hit: 'b', x: 0, y: 0 }], 's1', 'own')).toBe(true);
    expect(shellDamagedHull([{ k: 'boom', id: 's1', x: 0, y: 0 }], 's1', 'own')).toBe(false);
    expect(shellDamagedHull([{ k: 'boom', id: 's2', hit: 'b', x: 0, y: 0 }], 's1', 'own')).toBe(false);
  });

  it('a hit-less landing `boom` (a main-battery shell on a beacon) is a hit only with its owner\'s `hc` at the same point', () => {
    const boom = { k: 'boom', id: 's1', x: 10, y: 20 } as const;
    expect(shellDamagedHull([boom, { k: 'hc', id: 'own', x: 10, y: 20 }], 's1', 'own')).toBe(true);
    expect(shellDamagedHull([boom, { k: 'hc', id: 'other', x: 10, y: 20 }], 's1', 'own')).toBe(false);
  });
});

describe('isMainBatteryShell — keyed on the server-private main-battery marker', () => {
  const unmarked = { kind: 'shell', family: 'cannon', hits: CONFIG.mainBattery.hits, damage: CONFIG.shipClasses.bismarck.battery.shellDamage, contactDamage: CONFIG.shipClasses.bismarck.battery.shellDamage } as unknown as ShellState;
  const marked = { ...unmarked, batteryShell: true } as ShellState;
  it('a marked shell is one EVEN WHEN its damage equals its contact damage (a hull or --tune arm like that); an unmarked cannon shell on the same mask (the broadside) is not', () => {
    expect(marked.damage).toBe(marked.contactDamage); // the premise the old inference misfiled
    expect(isMainBatteryShell(marked)).toBe(true);
    expect(isMainBatteryShell({ ...marked, damage: marked.contactDamage + 1 })).toBe(true);
    expect(isMainBatteryShell(unmarked)).toBe(false);
    expect(isMainBatteryShell({ ...unmarked, damage: unmarked.contactDamage + 1 })).toBe(false);
  });

  it('isDeckGunShell (the shot ledger) follows the marker the same way', () => {
    expect(isDeckGunShell(marked)).toBe(true);
    expect(isDeckGunShell(unmarked)).toBe(false);
  });
});

describe('bandLine — the report row', () => {
  it('one cell per band, each with its shell count and hit share', () => {
    const line = bandLine([4, 0, 2, 1], [2, 0, 1, 0]);
    expect(line.split(' | ')).toHaveLength(RANGE_BANDS);
    expect(line).toContain('n=4');
    expect(line).toContain('50.0%');
  });
});
