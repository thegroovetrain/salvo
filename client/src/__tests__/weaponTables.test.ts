// THE HOW-TO-PLAY STAT TABLES (Eric ruling 2026-10-01).
//
// The tables are DERIVED from `effectiveStats` through the refit card's own
// row builders, so these pins read a handful of Eric's ruled numbers back out
// of the derived tables — a wrong fold, a wrong copy count per tier, or a
// wrong row pick fails here.

import { describe, expect, it } from 'vitest';
import { consumableTable, shipUpgradeTable, tierTable, TABLE_HULLS, type StatTable } from '../how-to-play/weaponTables.js';
import { HOWTO_SECTIONS } from '../how-to-play/copy.js';
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, LINE_IDS, effectiveStats } from '@salvo/shared';

const TIERED = [
  'deckGun', 'machineGun', 'flak', 'heavyTorpedo', 'lightTorpedo', 'broadside',
  'starShells', 'phosphorShells', 'navalMines', 'captiveMines', 'foulingMines',
];
// HULL POINTS and PASSIVE HEALING left with Story 10.3 (Eric 2026-11-04,
// epic-10 amendment 8); the six that remain are index cards.
const SHIP = ['armor', 'power', 'reload', 'engines', 'rudder', 'intel'] as const;

/** Every row's cells, label-blind — a derived row is found by its VALUES. */
const cells = (t: StatTable): (readonly string[])[] => t.rows.map((r) => r.values);
/** The copy counts a line's five tiers sit at: a ladder's tier I is the bare
 *  mount (zero copies), a weapon line's tier I is its first card. */
const tierCopies = (id: string): number[] => (CATALOG[id].kind === 'ladder' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5]);
const fold = (id: string, k: number) => effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], new Array<string>(k).fill(id));

describe('tier tables', () => {
  // Story 10.4: the four hulls carry different RELOAD and RANGE indices, and
  // those fold into the equipment rows, so the VALUES now follow the hull. What
  // stays hull-independent is the table's SHAPE: the same tiers, the same rows.
  it('equipment tables have the same shape on every hull', () => {
    const shape = (t: StatTable) => ({ columns: t.columns, labels: t.rows.map((r) => r.label) });
    for (const id of TIERED) {
      for (const cls of TABLE_HULLS) expect(shape(tierTable(id, cls)), `${id} on ${cls}`).toEqual(shape(tierTable(id)));
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
      String(effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], new Array<string>(k).fill('deckGun')).equipment.gun.damage);
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

  // The HULL (maxHp) and PASSIVE HEALING (heal rate) table tests lived here
  // until Story 10.3 deleted both lines (Eric 2026-11-04, epic-10 amendment 8).

  // Story 10.3 (ruling 4): every ship upgrade's table prints its OWN INDEX —
  // the hull's base, then the fold's value per card, on every hull (never a
  // derived speed / turn / RPM / cooldown).
  it('every ship upgrade table is its own index off the fold, per hull, per card', () => {
    for (const id of SHIP) {
      const t = shipUpgradeTable(id);
      TABLE_HULLS.forEach((cls, i) => {
        const at = (k: number): string => String(effectiveStats(CONFIG.shipClasses[cls], Array<string>(k).fill(id))[id]);
        expect(t.rows[i]!.values, `${id} ${cls}`).toEqual(t.columns.map((_, k) => at(k)));
      });
    }
  });
});

describe('consumable tables', () => {
  it('a consumable entry derives no table since the kit retired (Story 10.5; the copy is 10.14\'s)', () => {
    // The page's copy is FROZEN until Story 10.14 and still tags some entries
    // `consumable`; no consumable line exists any more (2026-11-05, epic-10
    // amendment 11), so each renders without a table until the copy pass.
    const entries = HOWTO_SECTIONS.flatMap((s) => s.entries ?? []).filter((e) => e.table === 'consumable');
    for (const e of entries) expect(consumableTable(e.lineId), e.lineId).toBeNull();
  });

  it('a line with no live rows yields no table', () => {
    expect(consumableTable('depthCharge')).toBeNull();
  });
});
