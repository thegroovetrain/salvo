// STORY 10.6 — THE CATALOG UNDER THE INDEX, on the card surfaces (Eric
// 2026-11-05, R1 / R6–R11; orchestrator ruling 6). The three new SHIP ladders
// (RANGE, HULL REPAIR, SMOKE SCREEN) and the four one-off WEAPON cards (AFT
// TORPEDO LAUNCHER, SECOND LAUNCHER TUBE, SECOND MINE RACK, EXPANDED MINE
// RACKS) on the refit card face, its hover and the `C` / `V` tooltip.
//
// Label-blind (labels are copy): every expectation is a VALUE read off the
// same `effectiveStats` fold the surface reads, compared as `[cur, next]`.

import { describe, expect, it } from 'vitest';
import { hmText } from '../util/hmText.js';
import {
  CATALOG,
  CONFIG,
  DEFAULT_CLASS_ID,
  abilityCooldownMs,
  effectiveStats,
  rackCapacity,
  type EffectiveStats,
} from '@salvo/shared';
import {
  abilityStatRows,
  cardHoverRows,
  cardColorTier,
  ONE_OFF_COLOR_TIER,
  cardStatRows,
  cardTierLabel,
  equipmentStatRows,
} from '../ui/boonCopy.js';
import { hullPercent } from '../util/hullPercent.js';

const SPEC = CONFIG.shipClasses[DEFAULT_CLASS_ID];
const fold = (cards: readonly string[]): EffectiveStats => effectiveStats(SPEC, cards);
const ship = (cards: readonly string[]) => ({ cls: DEFAULT_CLASS_ID, cards: [...cards] });
const pairs = (rows: readonly { cur: string | null; next: string }[]): (string | null)[][] => rows.map((r) => [r.cur, r.next]);
const rep = (id: string, n: number): string[] => Array<string>(n).fill(id);

const ONE_OFFS = ['aftTorpedoLauncher', 'secondLauncherTube', 'secondMineRack', 'expandedMineRacks'] as const;

describe('the four one-off WEAPON cards (R6 / R7 / R10 / R11)', () => {
  it('wear GOLD — the ramp\'s top rung (Eric 2026-11-05: "The Launcher/Mine Rack upgrades should be Gold")', () => {
    for (const id of ONE_OFFS) expect(cardColorTier(CATALOG[id], 0), id).toBe(ONE_OFF_COLOR_TIER);
  });

  it('carry no tier numerals — a cap-1 card has no ladder to climb', () => {
    for (const id of ONE_OFFS) expect(cardTierLabel(CATALOG[id], 0), id).toBeNull();
  });

  it('print ONE row: the launcher / tube / rack count they add, before → after', () => {
    const cases: [string, string[], (s: EffectiveStats) => number][] = [
      ['aftTorpedoLauncher', ['heavyTorpedo'], (s) => s.torpedoLaunchers],
      ['secondLauncherTube', ['lightTorpedo'], (s) => s.tubesPerLauncher],
      ['secondLauncherTube', ['lightTorpedo', 'aftTorpedoLauncher'], (s) => s.tubesPerLauncher],
      ['secondMineRack', ['captiveMines'], (s) => s.mineRacks],
    ];
    for (const [id, cards, read] of cases) {
      const before = read(fold(cards));
      const after = read(fold([...cards, id]));
      expect(after, id).toBeGreaterThan(before);
      expect(pairs(cardStatRows(CATALOG[id], 0, ship(cards))), id).toEqual([[String(before), String(after)]]);
    }
  });

  it('RACK CAPACITY (expandedMineRacks) prints the held mine\'s per-rack capacity, with one or two racks', () => {
    for (const host of ['navalMines', 'foulingMines', 'captiveMines'] as const) {
      for (const cards of [[host], [host, 'secondMineRack']]) {
        const before = rackCapacity(fold(cards), host);
        const after = rackCapacity(fold([...cards, 'expandedMineRacks']), host);
        expect(after, host).toBe(before + 1);
        expect(pairs(cardStatRows(CATALOG.expandedMineRacks, 0, ship(cards))), host).toEqual([[String(before), String(after)]]);
      }
    }
  });

  it('hover prints the HELD weapon\'s own table, valued after the card', () => {
    const cases: [string, string[], 'heavyTorpedo' | 'navalMines'][] = [
      ['aftTorpedoLauncher', ['heavyTorpedo'], 'heavyTorpedo'],
      ['secondLauncherTube', ['heavyTorpedo'], 'heavyTorpedo'],
      ['secondMineRack', ['navalMines'], 'navalMines'],
      ['expandedMineRacks', ['navalMines'], 'navalMines'],
    ];
    for (const [id, cards, host] of cases) {
      const after = fold([...cards, id]);
      expect(cardHoverRows(CATALOG[id], 0, ship(cards)), id).toEqual(equipmentStatRows(host, after));
    }
  });

  // FAIL-OPEN (the module's law): the card is never dealt without a host
  // (R10), but a forced render still opens a panel — the family's first weapon.
  it('with no host held, the hover reads the family\'s first weapon', () => {
    for (const id of ONE_OFFS) {
      const first = CATALOG[id].appliesTo![0]!;
      expect(cardHoverRows(CATALOG[id], 0, ship([])), id).toEqual(equipmentStatRows(first, fold([id])));
    }
  });
});

/** HULL REPAIR's three values, in the face's printers: instant %, over-time %, cooldown s. */
const repairVals = (s: EffectiveStats): string[] => [
  `+${hullPercent(s.repair.instantHp, s.maxHp)}%`,
  `+${hullPercent(s.repair.regenHp, s.maxHp)}%`,
  `${(s.repair.cooldownMs / 1000).toFixed(1)} s`,
];
/** SMOKE SCREEN's three values: life (whole s), end size (hm, Story 11.2), cooldown s. */
const smokeVals = (s: EffectiveStats): string[] => [
  `${Math.round(s.smoke.lifeMs / 1000)}`,
  hmText(s.smoke.r1), // in hectometers since Story 11.2
  `${(s.smoke.cooldownMs / 1000).toFixed(1)} s`,
];

describe('the HULL REPAIR and SMOKE SCREEN ladders (R8 / R9)', () => {
  it('climb a five-rung ladder', () => {
    for (const id of ['hullRepair', 'smokeScreen'] as const) {
      expect(CATALOG[id].cap, id).toBe(5);
      expect(cardTierLabel(CATALOG[id], 0), id).not.toBeNull();
    }
  });

  it('HULL REPAIR prints heal now, heal over time and cooldown off stats.repair, at every rung', () => {
    for (let k = 0; k < 5; k += 1) {
      const rows = cardStatRows(CATALOG.hullRepair, k, ship(rep('hullRepair', k)));
      const before = repairVals(fold(rep('hullRepair', k)));
      const after = repairVals(fold(rep('hullRepair', k + 1)));
      expect(rows.map((r) => r.cur), `@${k}`).toEqual(before);
      // `next` may carry a trailing unit; it must START with the after value.
      rows.forEach((r, i) => expect(r.next.startsWith(after[i]), `@${k} row ${i}: ${r.next}`).toBe(true));
    }
  });

  it('SMOKE SCREEN prints life, size and cooldown off stats.smoke, at every rung', () => {
    for (let k = 0; k < 5; k += 1) {
      const rows = cardStatRows(CATALOG.smokeScreen, k, ship(rep('smokeScreen', k)));
      const before = smokeVals(fold(rep('smokeScreen', k)));
      const after = smokeVals(fold(rep('smokeScreen', k + 1)));
      rows.forEach((r, i) => {
        expect(r.cur?.startsWith(before[i]), `@${k} row ${i}: ${r.cur}`).toBe(true);
        expect(r.next.startsWith(after[i]), `@${k} row ${i}: ${r.next}`).toBe(true);
        expect(r.cur, `@${k} row ${i} moves`).not.toBe(r.next);
      });
      expect(rows).toHaveLength(3);
    }
  });

  it('hover prints the ability\'s own tooltip table, valued after the card', () => {
    expect(cardHoverRows(CATALOG.hullRepair, 2, ship(rep('hullRepair', 2)))).toEqual(abilityStatRows('repair', fold(rep('hullRepair', 3))));
    expect(cardHoverRows(CATALOG.smokeScreen, 0, ship([]))).toEqual(abilityStatRows('smoke', fold(['smokeScreen'])));
  });
});

describe('the C / V tooltip reads the ship\'s own stats (R8 / R9)', () => {
  it('every value moves with the cards and matches the fold', () => {
    const bare = fold([]);
    const five = { repair: fold(rep('hullRepair', 5)), smoke: fold(rep('smokeScreen', 5)) } as const;
    for (const id of ['repair', 'smoke'] as const) {
      const a = abilityStatRows(id, bare);
      const b = abilityStatRows(id, five[id]);
      expect(a).toHaveLength(b.length);
      a.forEach((row, i) => expect(row.next, `${id} row ${i}`).not.toBe(b[i].next));
      expect(b.at(-1)!.next).toContain((abilityCooldownMs(five[id], id) / 1000).toFixed(1));
    }
    expect(abilityStatRows('repair', five.repair)[0].next).toContain(String(hullPercent(five.repair.repair.instantHp, five.repair.maxHp)));
    expect(abilityStatRows('smoke', five.smoke)[1].next).toContain(hmText(five.smoke.smoke.r1));
  });
});
