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

/** Every row's cells, label-blind — a derived row is found by its VALUES. */
const cells = (t: StatTable): (readonly string[])[] => t.rows.map((r) => r.values);
/** The copy counts a line's five tiers sit at: a ladder's tier I is the bare
 *  mount (zero copies), a weapon line's tier I is its first card. */
const tierCopies = (id: string): number[] => (CATALOG[id].kind === 'ladder' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5]);
const fold = (id: string, k: number) => effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<string>(k).fill(id));

describe('tier tables', () => {
  it('equipment tables are hull-independent', () => {
    for (const id of TIERED) {
      for (const cls of TABLE_HULLS) expect(tierTable(id, cls), `${id} on ${cls}`).toEqual(tierTable(id));
    }
  });

  it('every tiered table has five tier columns and one value per column', () => {
    for (const id of TIERED) {
      const t = tierTable(id);
      expect(t.columns, id).toHaveLength(5);
      expect(t.rows.length, id).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.values, `${id} ${r.label}`).toHaveLength(t.columns.length);
    }
  });

  // The values are Eric's dials (a 2026-10-13 experiment moved them), so the
  // expectation is read off the fold the card reads, tier I..V = 0..4 copies.
  it('CANNON damage reads the folded gun damage at every tier', () => {
    const at = (k: number): string =>
      String(effectiveStats(CONFIG.shipClasses.torpedoBoat, new Array<string>(k).fill('deckGun')).equipment.gun.damage);
    expect(cells(tierTable('deckGun'))).toContainEqual([0, 1, 2, 3, 4].map(at));
  });

  it('FLAK reload reads the folded flak reload (seconds, to the printed tenth) at every tier', () => {
    const want = tierCopies('flak').map((k) => fold('flak', k).equipment.flak.reloadMs / 1000);
    const match = cells(tierTable('flak')).filter((v) =>
      v.every((c, i) => Math.abs(Number.parseFloat(c) - want[i]!) <= 0.05 + 1e-9));
    expect(match.length).toBeGreaterThan(0);
  });

  it('STAR SHELLS and PHOSPHOR SHELLS burst damage reads the floored folded damage at every tier', () => {
    for (const id of ['starShells', 'phosphorShells'] as const) {
      const want = tierCopies(id).map((k) => String(Math.floor(fold(id, k).equipment[id].damage)));
      expect(cells(tierTable(id)), id).toContainEqual(want);
    }
  });
});

describe('ship upgrade tables', () => {
  it('a BASE column then one column per card up to the cap, one row per hull, one value per column', () => {
    for (const id of SHIP) {
      const t = shipUpgradeTable(id);
      expect(t.columns, id).toHaveLength(1 + CATALOG[id].cap);
      expect(t.rows, id).toHaveLength(TABLE_HULLS.length);
      for (const r of t.rows) expect(r.values, `${id} ${r.label}`).toHaveLength(t.columns.length);
    }
  });

  it('HULL tops the DREADNOUGHT out at its base hull + 5 × 50 (Story 9.6, amendment 90; was ARMOR at 450)', () => {
    const base = effectiveStats(CONFIG.shipClasses.battleship, []).maxHp;
    const top = effectiveStats(CONFIG.shipClasses.battleship, Array<string>(CATALOG.hullPoints.cap).fill('hullPoints')).maxHp;
    const dread = shipUpgradeTable('hullPoints').rows[TABLE_HULLS.indexOf('battleship')]!.values;
    expect(dread[0]).toBe(String(base));
    expect(dread.at(-1)).toBe(String(top));
  });

  it('PASSIVE HEALING derives its table from the folded heal rate (percent per second) at every count', () => {
    const heal = shipUpgradeTable('passiveHealing').rows[TABLE_HULLS.indexOf('torpedoBoat')]!.values;
    heal.forEach((cell, k) => {
      expect(Number.parseFloat(cell), `+${k}`).toBeCloseTo(fold('passiveHealing', k).regen.missingPctPerS * 100, 6);
    });
  });

  // ARMOR PIERCING (Story 9.9, epic-9 amendment 159): its table derives from the
  // eighth SHIP-panel row by construction, ready for the entry Story 9.17's copy
  // adds — base 0, then the fold's value per card, on every hull.
  it('ARMOR PIERCING derives its table from the ARMOR PIERCING row', () => {
    const t = shipUpgradeTable('armorPiercing');
    TABLE_HULLS.forEach((cls, i) => {
      const at = (k: number): string =>
        String(effectiveStats(CONFIG.shipClasses[cls], Array<string>(k).fill('armorPiercing')).armorPiercing);
      expect(t.rows[i]!.values, cls).toEqual([0, 1, 2, 3, 4, 5].map(at));
    });
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
