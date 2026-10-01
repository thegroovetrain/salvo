// THE HOW-TO-PLAY STAT TABLES (Eric ruling 2026-10-01).
//
// *"For each weapon, instead of writing out its stats in the description, give
// me a stat table showing its exact attributes at each tier."*
//
// EVERY NUMBER HERE IS DERIVED, NEVER TYPED. Each cell is one `effectiveStats`
// fold (the stat firewall) printed through the SAME row builders the slot
// tooltip, the SHIP panel and the refit card's hover use (`ui/boonCopy.ts`), so
// the manual can never disagree with the card. A retune in `CONFIG` or the
// catalog moves this page with no edit here.
//
// Pure: plain data out, no DOM. `ui/page.ts`'s `makeStatTable` draws it.

import {
  CATALOG,
  CONFIG,
  effectiveStats,
  tierTargetOf,
  type CatalogLine,
  type ShipClassId,
} from '@salvo/shared';
import {
  cardTierSteps,
  consumableStatRows,
  equipmentStatRows,
  shipStatRows,
  statValueText,
  type CardStatRow,
} from '../ui/boonCopy.js';
import { CLASS_DISPLAY_NAMES } from '../ui/classNames.js';
import { romanTier } from '../ui/tierRamp.js';

/** One table: a header row of column labels, then labelled rows of values. */
export interface StatTable {
  columns: readonly string[];
  rows: readonly { label: string; values: readonly string[] }[];
}

/** The hull every equipment table folds against. Equipment stats are
 *  hull-independent (pinned by `weaponTables.test.ts` across all three). */
const TABLE_HULL: ShipClassId = 'torpedoBoat';

/** The three hulls, in the order the ship-upgrade tables print them. */
export const TABLE_HULLS: readonly ShipClassId[] = ['torpedoBoat', 'mineLayer', 'battleship'];

/** Printed where a derived row has no value at some tier (fail-open). */
const NO_VALUE = '—';

function lineOf(lineId: string): CatalogLine {
  if (!Object.hasOwn(CATALOG, lineId)) throw new Error(`weaponTables: unknown line ${lineId}`);
  return CATALOG[lineId];
}

/** The copy counts a line's tiers sit at: a gun ladder's tier I is the bare
 *  mount (zero copies), a weapon line's tier I is its first card. */
function tierCopies(line: CatalogLine): number[] {
  const first = line.kind === 'ladder' ? 0 : 1;
  const counts: number[] = [];
  for (let k = first; k <= line.cap; k++) counts.push(k);
  return counts;
}

/** Row label keyed by its occurrence, so two rows sharing a word stay apart. */
function rowKeys(rows: readonly CardStatRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const n = seen.get(r.label) ?? 0;
    seen.set(r.label, n + 1);
    return `${r.label}#${n}`;
  });
}

/** Pivot one row list per column into one table row per label (union, in
 *  first-seen order). */
function pivot(columns: readonly string[], perColumn: readonly (readonly CardStatRow[])[]): StatTable {
  const order: string[] = [];
  const labels = new Map<string, string>();
  const cells = perColumn.map((rows) => {
    const keys = rowKeys(rows);
    const byKey = new Map<string, string>();
    rows.forEach((row, i) => {
      if (!labels.has(keys[i])) {
        labels.set(keys[i], row.label);
        order.push(keys[i]);
      }
      byKey.set(keys[i], statValueText(row));
    });
    return byKey;
  });
  const rows = order.map((key) => ({
    label: labels.get(key) ?? key,
    values: cells.map((c) => c.get(key) ?? NO_VALUE),
  }));
  return { columns, rows };
}

/**
 * Pure: a tiered equipment line's table — one column per tier (I…V), one row
 * per stat the slot tooltip prints, each cell that tier's live fold. `cls`
 * exists for the hull-independence pin; the page always uses the default.
 */
export function tierTable(lineId: string, cls: ShipClassId = TABLE_HULL): StatTable {
  const line = lineOf(lineId);
  const target = tierTargetOf(line);
  if (target === undefined) throw new Error(`weaponTables: ${lineId} has no equipment row`);
  const spec = CONFIG.shipClasses[cls];
  const copies = tierCopies(line);
  const columns = copies.map((k) => romanTier(cardTierSteps(line, k)?.cur ?? 1));
  const perColumn = copies.map((k) => equipmentStatRows(target, effectiveStats(spec, Array(k).fill(lineId))));
  return pivot(columns, perColumn);
}

/** Pure: a consumable's table — attribute, value — or null for a line with no
 *  live rows (the entry then renders without a table). */
export function consumableTable(id: string): StatTable | null {
  const rows = consumableStatRows(id);
  if (rows.length === 0) return null;
  return { columns: ['', ''], rows: rows.map((r) => ({ label: r.label, values: [statValueText(r)] })) };
}

/** The SHIP-panel row index a ship ladder moves (the first row whose value
 *  changes with one card). */
function movedRowIndex(lineId: string): number {
  const spec = CONFIG.shipClasses[TABLE_HULL];
  const before = shipStatRows(effectiveStats(spec, []));
  const after = shipStatRows(effectiveStats(spec, [lineId]));
  const i = after.findIndex((r, n) => statValueText(r) !== statValueText(before[n]));
  if (i < 0) throw new Error(`weaponTables: ${lineId} moves no SHIP row`);
  return i;
}

/**
 * Pure: a ship upgrade's table — columns BASE, +1 … +cap; one row per hull,
 * each cell the one SHIP-panel stat the ladder moves, printed as the SHIP
 * tooltip prints it.
 */
export function shipUpgradeTable(lineId: string): StatTable {
  const line = lineOf(lineId);
  const index = movedRowIndex(lineId);
  const counts = Array.from({ length: line.cap + 1 }, (_, k) => k);
  const columns = counts.map((k) => (k === 0 ? 'BASE' : `+${k}`));
  const rows = TABLE_HULLS.map((cls) => ({
    label: CLASS_DISPLAY_NAMES[cls],
    values: counts.map((k) =>
      statValueText(shipStatRows(effectiveStats(CONFIG.shipClasses[cls], Array(k).fill(lineId)))[index])),
  }));
  return { columns, rows };
}
