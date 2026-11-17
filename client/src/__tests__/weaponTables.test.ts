// THE HOW-TO-PLAY STAT TABLES (Eric ruling 2026-10-01).
//
// The tables are DERIVED from `effectiveStats` through the refit card's own
// row builders, so these pins read a handful of Eric's ruled numbers back out
// of the derived tables — a wrong fold, a wrong copy count per tier, or a
// wrong row pick fails here.

import { describe, expect, it } from 'vitest';
import { abilityTable, shipUpgradeTable, tierTable, TABLE_HULLS, type StatTable } from '../how-to-play/weaponTables.js';
import { shownWeaponDamage } from '../render/console/readouts.js';
import { ABILITY_LADDERS, abilityStatRows, statValueText } from '../ui/boonCopy.js';
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, INDEX_IDS, effectiveStats, type LineId } from '@salvo/shared';

const TIERED = [
  'deckGun', 'machineGun', 'flak', 'heavyTorpedo', 'lightTorpedo', 'broadside',
  'starShells', 'phosphorShells', 'navalMines', 'captiveMines', 'foulingMines',
];
// HULL POINTS and PASSIVE HEALING left with Story 10.3 (Eric 2026-11-04,
// epic-10 amendment 8); RUDDER left with Story 10.6 (R2) and RANGE joined —
// the index cards. HULL REPAIR and SMOKE SCREEN print ability tables.
const SHIP = INDEX_IDS;
const ABILITY = ['hullRepair', 'smokeScreen'] as const;

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
  // expectation is read off the fold the card reads, tier I..V = 0..4 copies,
  // as the battle HUD shows it (Story 11.11: weapon POWER per tier included).
  it('CANNON damage reads the HUD-shown gun damage at every tier', () => {
    const at = (k: number): string => String(shownWeaponDamage(fold('deckGun', k), 'gun'));
    expect(cells(tierTable('deckGun'))).toContainEqual([0, 1, 2, 3, 4].map(at));
  });

  // Epic-11 amendment 17: +10 weapon POWER a tier, so the shown damage climbs.
  it('a torpedo table\'s damage row is the HUD-shown damage, and Tier V out-hits Tier I', () => {
    const want = tierCopies('heavyTorpedo').map((k) => String(shownWeaponDamage(fold('heavyTorpedo', k), 'heavyTorpedo')));
    expect(cells(tierTable('heavyTorpedo'))).toContainEqual(want);
    expect(Number(want[4])).toBeGreaterThan(Number(want[0]));
  });

  it('FLAK reload reads the folded flak reload (seconds, to the printed tenth) at every tier', () => {
    const want = tierCopies('flak').map((k) => fold('flak', k).equipment.flak.reloadMs / 1000);
    const match = cells(tierTable('flak')).filter((v) =>
      v.every((c, i) => Math.abs(Number.parseFloat(c) - want[i]!) <= 0.05 + 1e-9));
    expect(match.length).toBeGreaterThan(0);
  });

  it('STAR SHELLS and PHOSPHOR SHELLS burst damage reads the HUD-shown damage at every tier', () => {
    for (const id of ['starShells', 'phosphorShells'] as const) {
      const want = tierCopies(id).map((k) => String(shownWeaponDamage(fold(id, k), id)));
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

describe('ability tables', () => {
  it('a BASE column then one column per card up to the cap, one value per column', () => {
    for (const id of ABILITY) {
      const t = abilityTable(id);
      expect(t.columns, id).toHaveLength(1 + CATALOG[id].cap);
      expect(t.rows.length, id).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.values, `${id} ${r.label}`).toHaveLength(t.columns.length);
    }
  });

  // Every cell is the ability tooltip's row off that copy count's fold.
  it('each column is the ability tooltip off the fold with that many cards', () => {
    for (const id of ABILITY) {
      const ability = ABILITY_LADDERS[id as LineId]!;
      const t = abilityTable(id);
      t.columns.forEach((_, k) => {
        const want = abilityStatRows(ability, fold(id, k)).map(statValueText);
        expect(t.rows.map((r) => r.values[k]), `${id} +${k}`).toEqual(want);
      });
    }
  });

  it('the top card moves some row off BASE', () => {
    for (const id of ABILITY) {
      const t = abilityTable(id);
      expect(t.rows.some((r) => r.values.at(-1) !== r.values[0]), id).toBe(true);
    }
  });

  it('a line that improves no ability throws', () => {
    expect(() => abilityTable('armor')).toThrow();
  });
});
