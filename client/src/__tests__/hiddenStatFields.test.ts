// THE HIDDEN STAT FIELDS (Eric 2026-11-26: phosphor is all burn, no burst).
//
// PHOSPHOR SHELLS keeps `damage` in `EQUIPMENT_STAT_FIELDS` (the catalog's
// stat-path whitelist) but no player-facing table prints it. ONE presentation
// rule (ui/boonCopy.ts `HIDDEN_STAT_FIELDS`) feeds every reader, so this suite
// walks each of them: the fit card face, the tier cards, the refit hover, the
// stat table, the How-to-Play table and the battle console — and keeps the
// console's field list aligned with the printed rows.
//
// Label-blind: the DAMAGE row's word is read off a line that still prints one
// (STAR SHELLS, which has a burst), through the console's field alignment —
// never a typed string, never a number.

import { describe, expect, it } from 'vitest';
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, effectiveStats, type EffectiveStats, type EquipmentId } from '@salvo/shared';
import { cardHoverRows, cardStatRows, equipmentStatRows, printedStatFields, type CardStatRow } from '../ui/boonCopy.js';
import { READOUT_KEY, rowTableReadouts, shipReadouts, statRowFields, type ReadoutShip } from '../render/console/readouts.js';
import { tierTable } from '../how-to-play/weaponTables.js';

const CLS = DEFAULT_CLASS_ID;
const HIDDEN = 'phosphorShells' as const;
const BURST = 'starShells' as const;
const COPIES = [1, 2, 3, 4, 5];

const fold = (id: string, k: number): EffectiveStats => effectiveStats(CONFIG.shipClasses[CLS], Array<string>(k).fill(id));
const held = (id: string, k: number) => ({ cls: CLS, cards: Array<string>(k).fill(id) });
const ship = (id: string, k: number): ReadoutShip => ({ cls: CLS, cards: Array<string>(k).fill(id), ib: {}, shift: 'boost' });
const labels = (rows: readonly CardStatRow[]): string[] => rows.map((r) => r.label);

/** The word a DAMAGE row prints, read off STAR SHELLS' own aligned table. */
function damageWord(): string {
  const s = fold(BURST, 1);
  const i = statRowFields(BURST, s).indexOf('damage');
  expect(i).toBeGreaterThanOrEqual(0);
  return equipmentStatRows(BURST, s)[i].label;
}

describe('HIDDEN_STAT_FIELDS — phosphor prints no DAMAGE row anywhere', () => {
  const word = damageWord();

  it('the printed field list drops phosphor DAMAGE and keeps every other field; other lines keep theirs', () => {
    expect(printedStatFields(HIDDEN)).not.toContain('damage');
    expect(printedStatFields(HIDDEN)).toContain('dps');
    expect(printedStatFields(BURST)).toContain('damage');
  });

  it('the stat table (slot tooltip / hover / How-to-Play rows) carries no DAMAGE row at any tier', () => {
    for (const k of COPIES) {
      expect(labels(equipmentStatRows(HIDDEN, fold(HIDDEN, k))), `x${k}`).not.toContain(word);
      expect(labels(equipmentStatRows(BURST, fold(BURST, k))), `x${k}`).toContain(word);
    }
  });

  it('the console field list stays aligned one-to-one with the printed rows, without DAMAGE', () => {
    for (const k of COPIES) {
      const s = fold(HIDDEN, k);
      const fields = statRowFields(HIDDEN, s);
      expect(fields, `x${k}`).toHaveLength(equipmentStatRows(HIDDEN, s).length);
      expect(fields, `x${k}`).not.toContain('damage');
      expect(statRowFields(BURST, fold(BURST, k)), `x${k}`).toContain('damage');
    }
  });

  it('the fit card face and every tier card print no DAMAGE row; star shells still print theirs on the fit', () => {
    for (let k = 0; k < CATALOG[HIDDEN].cap; k += 1) {
      expect(labels(cardStatRows(CATALOG[HIDDEN], k, held(HIDDEN, k))), `@${k}`).not.toContain(word);
    }
    expect(labels(cardStatRows(CATALOG[BURST], 0, held(BURST, 0)))).toContain(word);
  });

  it('the refit card hover prints no DAMAGE row at any copy count', () => {
    for (let k = 0; k < CATALOG[HIDDEN].cap; k += 1) {
      expect(labels(cardHoverRows(CATALOG[HIDDEN], k, held(HIDDEN, k))), `@${k}`).not.toContain(word);
    }
    expect(labels(cardHoverRows(CATALOG[BURST], 0, held(BURST, 0)))).toContain(word);
  });

  it('the How-to-Play tier table has no DAMAGE row; star shells keep theirs', () => {
    expect(tierTable(HIDDEN).rows.map((r) => r.label)).not.toContain(word);
    expect(tierTable(BURST).rows.map((r) => r.label)).toContain(word);
  });

  it('the battle console prints no phosphor DAMAGE readout (cell or whole-table preview)', () => {
    const key = READOUT_KEY.stat('special', 'damage');
    for (const k of COPIES) {
      expect(shipReadouts(ship(HIDDEN, k))!.map((r) => r.key), `x${k}`).not.toContain(key);
      const table = rowTableReadouts(ship(HIDDEN, k), 'special')!;
      expect(table.id).toBe(HIDDEN satisfies EquipmentId);
      expect(table.readouts.map((r) => r.key), `x${k}`).not.toContain(key);
    }
    expect(shipReadouts(ship(BURST, 1))!.map((r) => r.key)).toContain(key);
    expect(rowTableReadouts(ship(BURST, 1), 'special')!.readouts.map((r) => r.key)).toContain(key);
  });
});
