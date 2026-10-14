// THE HOW-TO-PLAY STAT TABLES (Eric ruling 2026-10-01).
//
// The tables are DERIVED from `effectiveStats` through the refit card's own
// row builders, so these pins read a handful of Eric's ruled numbers back out
// of the derived tables — a wrong fold, a wrong copy count per tier, or a
// wrong row pick fails here.

import { describe, expect, it } from 'vitest';
import { consumableTable, shipUpgradeTable, tierTable, TABLE_HULLS, type StatTable } from '../how-to-play/weaponTables.js';
import { HOWTO_SECTIONS } from '../how-to-play/copy.js';
import { CATALOG, CONFIG, LINE_IDS, effectiveStats } from '@salvo/shared';

const TIERED = [
  'deckGun', 'machineGun', 'flak', 'heavyTorpedo', 'lightTorpedo', 'broadside',
  'starShells', 'phosphorShells', 'navalMines', 'captiveMines', 'foulingMines',
];
const SHIP = ['hullPoints', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing'];

const row = (t: StatTable, label: string): readonly string[] => {
  const r = t.rows.find((x) => x.label === label);
  if (r === undefined) throw new Error(`no ${label} row in ${JSON.stringify(t.rows.map((x) => x.label))}`);
  return r.values;
};

describe('tier tables', () => {
  it('equipment tables are hull-independent', () => {
    for (const id of TIERED) {
      for (const cls of TABLE_HULLS) expect(tierTable(id, cls), `${id} on ${cls}`).toEqual(tierTable(id));
    }
  });

  it('every tiered table has five tier columns I…V and one value per column', () => {
    for (const id of TIERED) {
      const t = tierTable(id);
      expect(t.columns, id).toEqual(['I', 'II', 'III', 'IV', 'V']);
      expect(t.rows.length, id).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.values, `${id} ${r.label}`).toHaveLength(t.columns.length);
    }
  });

  // The values are Eric's dials (a 2026-10-13 experiment moved them), so the
  // expectation is read off the fold the card reads, tier I..V = 0..4 copies.
  it('CANNON damage reads the folded gun damage at every tier', () => {
    const at = (k: number): string =>
      String(effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<string>(k).fill('deckGun')).equipment.gun.damage);
    expect(row(tierTable('deckGun'), 'DAMAGE')).toEqual([0, 1, 2, 3, 4].map(at));
  });

  it('FLAK reload runs 3.5 s down to 2.8 s (Eric 2026-10-02)', () => {
    const reload = row(tierTable('flak'), 'RELOAD');
    expect(reload[0]).toBe('3.5 s');
    expect(reload[4]).toBe('2.8 s');
  });

  it('STAR SHELLS and PHOSPHOR SHELLS burst damage (amendment 208)', () => {
    expect(row(tierTable('starShells'), 'DAMAGE')).toEqual(['20', '22', '25', '27', '30']);
    expect(row(tierTable('phosphorShells'), 'DAMAGE')).toEqual(['10', '12', '15', '17', '20']);
  });
});

describe('ship upgrade tables', () => {
  it('BASE then one column per card, three hull rows, one value per column', () => {
    for (const id of SHIP) {
      const t = shipUpgradeTable(id);
      expect(t.columns[0], id).toBe('BASE');
      expect(t.rows.map((r) => r.label), id).toEqual(['SPEEDBOAT', 'REPEATER', 'DREADNOUGHT']);
      for (const r of t.rows) expect(r.values, `${id} ${r.label}`).toHaveLength(t.columns.length);
    }
  });

  it('every ship ladder has BASE then +1 … +5 (Story 9.6, epic-9 amendments 90/91)', () => {
    for (const id of SHIP) expect(shipUpgradeTable(id).columns, id).toEqual(['BASE', '+1', '+2', '+3', '+4', '+5']);
  });

  it('HULL tops the DREADNOUGHT out at its base hull + 5 × 50 (Story 9.6, amendment 90; was ARMOR at 450)', () => {
    const base = effectiveStats(CONFIG.shipClasses.battleship, []).maxHp;
    const top = effectiveStats(CONFIG.shipClasses.battleship, Array<string>(CATALOG.hullPoints.cap).fill('hullPoints')).maxHp;
    expect(row(shipUpgradeTable('hullPoints'), 'DREADNOUGHT')[0]).toBe(String(base));
    expect(row(shipUpgradeTable('hullPoints'), 'DREADNOUGHT').at(-1)).toBe(String(top));
  });

  it('PASSIVE HEALING derives its table from the HEAL row: 2 %/S at BASE, 5 %/S at +5', () => {
    const heal = row(shipUpgradeTable('passiveHealing'), 'SPEEDBOAT');
    expect(heal[0]).toBe('2 %/S');
    expect(heal.at(-1)).toBe('5 %/S');
  });
});

describe('consumable tables', () => {
  it('every consumable entry on the page has a derived table', () => {
    // A line that has LEFT the catalog (CHAFF, Story 9.2) keeps its frozen copy
    // entry until 9.11 (epic-9 amendment 36) but derives no table.
    const entries = HOWTO_SECTIONS.flatMap((s) => s.entries ?? [])
      .filter((e) => e.table === 'consumable' && (LINE_IDS as readonly string[]).includes(e.lineId));
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(consumableTable(e.lineId), e.lineId).not.toBeNull();
  });

  it('a line with no live rows yields no table', () => {
    expect(consumableTable('depthCharge')).toBeNull();
  });
});
