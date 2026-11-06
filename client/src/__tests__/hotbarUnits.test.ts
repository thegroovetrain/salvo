// Story 10.6 — the `Q` / `E` UNIT PIPS (render/hotbarUnits.ts): one pip per
// torpedo tube (a column per launcher, each tube on its own clock — R6) and
// one per mine seat (a column per rack, one clock per rack — R7), read off the
// own block / the predicted launchers, measured against the held weapon's
// FOLDED reload; drawn only past a single unit, in place of the count badge.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  effectiveStats,
  equipmentReloadMs,
  initialLaunchers,
  initialRacks,
  initialTurrets,
  SHIP_CLASS_IDS,
  rackCapacity,
  type LauncherState,
  type RackState,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { pipRects, rackPips, shownPips, tubePips, turretPips } from '../render/hotbarUnits.js';
import { slotPips } from '../render/hotbar.js';

const HULL = DEFAULT_CLASS_ID;
const SQUARE = { x: 100, y: 50, w: 54, h: 54 };
const stats = (cards: string[]) => effectiveStats(CONFIG.shipClasses[HULL], cards);

describe('tubePips — one per tube, a column per launcher, each its own clock', () => {
  it('Q with ONE tube loaded is one full pip (and shows none — the single-round square)', () => {
    const pips = tubePips(initialLaunchers(HULL, { torpedoLaunchers: 1, tubesPerLauncher: 1 }), 30_000);
    expect(pips).toEqual([{ group: 0, fill: 1 }]);
    expect(shownPips(pips)).toBeNull();
  });

  it('Q with FOUR tubes: two loaded, two at their own different clocks', () => {
    const launchers: LauncherState[] = [
      { a: 0, tubes: [0, 7_500] },
      { a: Math.PI, tubes: [0, 22_500] },
    ];
    expect(tubePips(launchers, 30_000)).toEqual([
      { group: 0, fill: 1 },
      { group: 0, fill: 0.75 },
      { group: 1, fill: 1 },
      { group: 1, fill: 0.25 },
    ]);
  });
});

describe('rackPips — one per seat, a column per rack, one clock per rack', () => {
  it('E with one rack of 3: 2 held, the third filling with the rack\'s clock', () => {
    const racks: RackState[] = [{ n: 2, reloadMsLeft: 5_000 }];
    expect(rackPips(racks, 3, 20_000)).toEqual([
      { group: 0, fill: 1 },
      { group: 0, fill: 1 },
      { group: 0, fill: 0.75 },
    ]);
  });

  it('E with two racks of 4 at different counts and clocks — only the next seat of a running rack fills', () => {
    const racks: RackState[] = [{ n: 1, reloadMsLeft: 10_000 }, { n: 4, reloadMsLeft: 0 }];
    expect(rackPips(racks, 4, 20_000).map((p) => [p.group, p.fill])).toEqual([
      [0, 1], [0, 0.5], [0, 0], [0, 0],
      [1, 1], [1, 1], [1, 1], [1, 1],
    ]);
  });
});

describe('pipRects — a column per group from the left inside edge, bottom-up', () => {
  it('stacks each group upward and steps the columns right; every pip sits inside the square', () => {
    const pips = rackPips([{ n: 4, reloadMsLeft: 0 }, { n: 4, reloadMsLeft: 0 }], 4, 1);
    const rects = pipRects(SQUARE, pips);
    const col0 = rects.slice(0, 4);
    const col1 = rects.slice(4);
    for (let k = 1; k < 4; k++) expect(col0[k].y).toBeLessThan(col0[k - 1].y);
    expect(col1[0].x).toBeGreaterThan(col0[0].x);
    expect(col1[0].y).toBe(col0[0].y);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(SQUARE.x);
      expect(r.y).toBeGreaterThanOrEqual(SQUARE.y);
      expect(r.x + r.w).toBeLessThanOrEqual(SQUARE.x + SQUARE.w);
      expect(r.y + r.h).toBeLessThanOrEqual(SQUARE.y + SQUARE.h);
    }
  });

  it('the columns stay left of the centred glyph', () => {
    const rects = pipRects(SQUARE, tubePips(initialLaunchers(HULL, { torpedoLaunchers: 2, tubesPerLauncher: 2 }), 1));
    const glyphLeft = SQUARE.x + (SQUARE.w - CLIENT_CONFIG.hudBar.icon) / 2;
    for (const r of rects) expect(r.x + r.w).toBeLessThanOrEqual(glyphLeft);
  });
});

describe('slotPips — the square reads the held weapon\'s units off the view', () => {
  it('a held torpedo reads the launchers at its folded reload', () => {
    const st = stats(['heavyTorpedo', 'aftTorpedoLauncher']);
    const launchers: LauncherState[] = [{ a: 0, tubes: [0] }, { a: Math.PI, tubes: [equipmentReloadMs(st, 'heavyTorpedo') / 2] }];
    expect(slotPips({ stats: st, launchers }, 'heavyTorpedo')).toEqual([{ group: 0, fill: 1 }, { group: 1, fill: 0.5 }]);
  });

  it('a held mine reads the racks at the per-rack capacity the fold gives', () => {
    const st = stats(['navalMines', 'secondMineRack']);
    const bank = initialRacks(st, 'navalMines');
    const pips = slotPips({ stats: st, racks: bank.racks }, 'navalMines');
    expect(pips).toHaveLength(bank.racks.length * rackCapacity(st, 'navalMines'));
    expect(new Set(pips!.map((p) => p.group)).size).toBe(2);
  });

  it('no launchers / racks on the view, or any other weapon, is no pips', () => {
    const st = stats(['heavyTorpedo']);
    expect(slotPips({ stats: st }, 'heavyTorpedo')).toBeNull();
    expect(slotPips({ stats: st, launchers: [{ a: 0, tubes: [0, 0] }] }, 'mainBattery')).toBeNull();
  });
});

// Eric 2026-11-05: "can you give the main gun the same treatment?" — one pip
// per main-battery turret, ONE column, turret order, each on its own clock.
describe('turretPips — the main battery, one pip per turret in one column', () => {
  it('one pip per turret, all in column 0, filling with each turret\'s own clock', () => {
    const turrets = [{ a: 0, reloadMsLeft: 0 }, { a: 0, reloadMsLeft: 2_500 }, { a: Math.PI, reloadMsLeft: 0 }];
    expect(turretPips(turrets, 10_000)).toEqual([
      { group: 0, fill: 1 },
      { group: 0, fill: 0.75 },
      { group: 0, fill: 1 },
    ]);
  });

  it('the gun square reads the view\'s turrets at the battery\'s folded reload — every hull', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const st = effectiveStats(CONFIG.shipClasses[cls], []);
      const turrets = initialTurrets(cls);
      turrets[0].reloadMsLeft = equipmentReloadMs(st, 'mainBattery') / 2;
      const pips = slotPips({ stats: st, turrets }, 'mainBattery')!;
      expect(pips, cls).toHaveLength(turrets.length);
      expect(new Set(pips.map((p) => p.group))).toEqual(new Set([0]));
      expect(pips[0].fill).toBeCloseTo(0.5);
      for (const r of pipRects(SQUARE, pips)) expect(r.y).toBeGreaterThanOrEqual(SQUARE.y);
    }
  });
});
