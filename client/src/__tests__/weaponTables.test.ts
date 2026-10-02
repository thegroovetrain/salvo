// THE HOW-TO-PLAY STAT TABLES (Eric ruling 2026-10-01).
//
// The tables are DERIVED from `effectiveStats` through the refit card's own
// row builders, so these pins read a handful of Eric's ruled numbers back out
// of the derived tables — a wrong fold, a wrong copy count per tier, or a
// wrong row pick fails here.

import { describe, expect, it } from 'vitest';
import { consumableTable, shipUpgradeTable, tierTable, TABLE_HULLS, type StatTable } from '../how-to-play/weaponTables.js';
import { HOWTO_SECTIONS } from '../how-to-play/copy.js';

const TIERED = [
  'deckGun', 'machineGun', 'flak', 'heavyTorpedo', 'lightTorpedo', 'broadside',
  'starShells', 'phosphorShells', 'navalMines', 'captiveMines', 'foulingMines',
];
const SHIP = ['armor', 'speed', 'turning', 'radarSweep', 'reload'];

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

  it('CANNON damage reads 15 / 16 / 18 / 19 / 21', () => {
    expect(row(tierTable('deckGun'), 'DAMAGE')).toEqual(['15', '16', '18', '19', '21']);
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

  it('ARMOR tops the DREADNOUGHT out at 450', () => {
    expect(row(shipUpgradeTable('armor'), 'DREADNOUGHT').at(-1)).toBe('450');
  });
});

describe('consumable tables', () => {
  it('every consumable entry on the page has a derived table', () => {
    const entries = HOWTO_SECTIONS.flatMap((s) => s.entries ?? []).filter((e) => e.table === 'consumable');
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(consumableTable(e.lineId), e.lineId).not.toBeNull();
  });

  it('a line with no live rows yields no table', () => {
    expect(consumableTable('depthCharge')).toBeNull();
  });
});
