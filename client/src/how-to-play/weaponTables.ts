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
  DEFAULT_CLASS_ID,
  SHIP_CLASS_IDS,
  effectiveStats,
  tierTargetOf,
  type CatalogLine,
  type EffectiveStats,
  type EquipmentId,
  type ShipClassId,
} from '@salvo/shared';
import {
  ABILITY_LADDERS,
  abilityStatRows,
  cardTierSteps,
  equipmentStatRows,
  shipStatRows,
  statValueText,
  type CardStatRow,
} from '../ui/boonCopy.js';
import { CLASS_DISPLAY_NAMES } from '../ui/classNames.js';
import { shownWeaponDamage } from '../render/console/readouts.js';
import { romanTier } from '../ui/tierRamp.js';

/** One table: a header row of column labels, then labelled rows of values. */
export interface StatTable {
  columns: readonly string[];
  rows: readonly { label: string; values: readonly string[] }[];
}

/** The hull every equipment and ability table folds against. Since Story 10.4
 *  the RELOAD index folds into equipment rows (and HULL REPAIR heals a share of
 *  the hull), so the numbers are the default hull's (the tables' SHAPE is the
 *  same on every hull — weaponTables.test.ts). */
const TABLE_HULL: ShipClassId = DEFAULT_CLASS_ID;

/** The hulls, in the order the ship-upgrade tables print them (Story 10.4:
 *  the shared menu order). */
export const TABLE_HULLS: readonly ShipClassId[] = SHIP_CLASS_IDS;

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
 * The fold a table row prints, with the weapon's DAMAGE swapped for the damage
 * the battle console shows (`shownWeaponDamage`: vs an ARMOR-100 hull, the
 * weapon's tier POWER included — epic-11 amendment 17), so the manual's DAMAGE
 * climbs per tier exactly as the HUD's does. Every other field is the fold's.
 */
function shownFold(stats: EffectiveStats, target: EquipmentId): EffectiveStats {
  const damage = shownWeaponDamage(stats, target);
  if (damage === undefined) return stats;
  const row = { ...stats.equipment[target], damage };
  return { ...stats, equipment: { ...stats.equipment, [target]: row } };
}

/**
 * Pure: a tiered equipment line's table — one column per tier (I…V), one row
 * per stat the slot tooltip prints, each cell that tier's live fold (DAMAGE as
 * the HUD shows it). `cls` exists for the hull-independence pin; the page
 * always uses the default.
 */
export function tierTable(lineId: string, cls: ShipClassId = TABLE_HULL): StatTable {
  const line = lineOf(lineId);
  const target = tierTargetOf(line);
  if (target === undefined) throw new Error(`weaponTables: ${lineId} has no equipment row`);
  const spec = CONFIG.shipClasses[cls];
  const copies = tierCopies(line);
  const columns = copies.map((k) => romanTier(cardTierSteps(line, k)?.cur ?? 1));
  const perColumn = copies.map((k) =>
    equipmentStatRows(target, shownFold(effectiveStats(spec, Array(k).fill(lineId)), target)));
  return pivot(columns, perColumn);
}

/** The BASE, +1 … +cap columns of a ladder's table, as copy counts. */
function ladderCounts(line: CatalogLine): number[] {
  return Array.from({ length: line.cap + 1 }, (_, k) => k);
}

/** A ladder column's label: BASE at zero copies, else `+k`. */
function ladderColumn(k: number): string {
  return k === 0 ? 'BASE' : `+${k}`;
}

/**
 * Pure: a C / V ability ladder's table (HULL REPAIR, SMOKE SCREEN — Story
 * 11.11) — columns BASE, +1 … +cap; one row per stat the ability's tooltip
 * prints (`abilityStatRows`), each cell that copy count's live fold on the
 * default hull.
 */
export function abilityTable(lineId: string): StatTable {
  const line = lineOf(lineId);
  const ability = ABILITY_LADDERS[line.id];
  if (ability === undefined) throw new Error(`weaponTables: ${lineId} improves no ability`);
  const spec = CONFIG.shipClasses[TABLE_HULL];
  const counts = ladderCounts(line);
  const perColumn = counts.map((k) => abilityStatRows(ability, effectiveStats(spec, Array(k).fill(lineId))));
  return pivot(counts.map(ladderColumn), perColumn);
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
  const counts = ladderCounts(line);
  const columns = counts.map(ladderColumn);
  const rows = TABLE_HULLS.map((cls) => ({
    label: CLASS_DISPLAY_NAMES[cls],
    values: counts.map((k) =>
      statValueText(shipStatRows(effectiveStats(CONFIG.shipClasses[cls], Array(k).fill(lineId)))[index])),
  }));
  return { columns, rows };
}
