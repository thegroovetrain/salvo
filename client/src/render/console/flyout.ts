// THE FLYOUT'S PURE MODEL (Story 12.3 Part B, AC 34 / 36) — what the little
// box beside the bar prints, and which tile a hovered upgrade card points at.
// No DOM, no Pixi (ui/hudFlyout.ts draws it).
//
//   • A WEAPON tile under the pointer: the stat lines the old console cells
//     printed always (readouts.ts `rowStats`: DAMAGE vs ARMOR 100, RANGE,
//     RELOAD, SPEED, HOMING, the radius…), label left, value right.
//   • An ABILITY tile: its tooltip table — HULL REPAIR / SMOKE their
//     `abilityStatRows`, the fitted Shift its `equipmentStatRows` — the game's
//     own words (ui/boonCopy.ts).
//   • A hovered UPGRADE CARD that changes a weapon or an ability: the card's
//     own `cur → next` rows (the face's diff, `OfferCard.rows`), amber, with
//     the arrow of the move. A SHIP-stat card opens nothing (the row changes
//     in place, AC 36).

import type { EffectiveStats, EquipmentId, ShiftId } from '@salvo/shared';
import { abilityStatRows, equipmentStatRows, statValueText, TIER_ARROW, type CardStatRow } from '../../ui/boonCopy.js';
import { ABILITY_KINDS, WEAPON_ROW_KINDS, type AbilityKind, type WeaponRowKind } from './layout.js';
import { PREVIEW_ARROW } from './skins.js';
import type { AbilityModel, PreviewMarks, WeaponRowModel } from './readouts.js';

export interface FlyoutLine {
  label: string;
  value: string;
  /** A change line (amber), or a plain stat (phosphor). */
  amber: boolean;
}

export interface FlyoutModel {
  title: string;
  lines: FlyoutLine[];
}

/** What a hovered card changes: one weapon tile, one ability tile, or the
 *  ship rows (which change in place, no box). */
export type PreviewTarget = { kind: 'row'; row: WeaponRowKind } | { kind: 'ability'; ability: AbilityKind } | { kind: 'ship' };

/**
 * Pure: the tile a hovered card points at, read off its REAL marks (a re-fold
 * with the card, readouts.ts `hoverPreview`). A card that moves an index's
 * tier ladder (`index.<id>.held`) is a SHIP card — even where it also moves
 * every weapon's shown damage (POWER) — else the first weapon tile it marks,
 * else the first ability tile; null when it marks nothing.
 */
export function previewTarget(marks: PreviewMarks | null): PreviewTarget | null {
  if (marks === null || marks.size === 0) return null;
  const keys = [...marks.keys()];
  if (keys.some((k) => /^index\.[a-z]+\.held$/.test(k))) return { kind: 'ship' };
  const row = WEAPON_ROW_KINDS.find((kind) => keys.some((k) => k.startsWith(`row.${kind}.`)));
  if (row !== undefined) return { kind: 'row', row };
  const ability = ABILITY_KINDS.find((kind) => keys.some((k) => k.startsWith(`ability.${kind}.`)));
  return ability === undefined ? null : { kind: 'ability', ability };
}

/** Pure: a weapon tile's flyout — its stat lines; null for a tile with none
 *  (an empty slot). */
export function weaponFlyout(row: WeaponRowModel): FlyoutModel | null {
  if (row.stats.length === 0) return null;
  return { title: row.name, lines: row.stats.map((r) => ({ label: r.label, value: r.value, amber: false })) };
}

/** Pure: an ability tile's flyout — its tooltip table off the live fold. */
export function abilityFlyout(ab: AbilityModel, stats: EffectiveStats, shift: ShiftId): FlyoutModel {
  const rows = ab.kind === 'shift' ? equipmentStatRows(shift as EquipmentId, stats) : abilityStatRows(ab.kind, stats);
  return { title: ab.name, lines: rows.map((r) => ({ label: r.label, value: statValueText(r), amber: false })) };
}

/** Pure: the leading number of a printed value (`+35%`, `13.5S`, `380 hm`), or NaN. */
function leadingNumber(text: string): number {
  const m = /-?\d+(?:\.\d+)?/.exec(text);
  return m === null ? NaN : Number(m[0]);
}

/** Pure: one change line's value — `old → new ▲` (▼ where the number falls),
 *  or `new ▲` for a number that did not exist before. */
export function changeText(row: CardStatRow): string {
  if (row.cur === null) return `${row.next} ${PREVIEW_ARROW.up}`;
  const down = leadingNumber(row.next) < leadingNumber(row.cur);
  return `${row.cur} ${TIER_ARROW} ${row.next} ${down ? PREVIEW_ARROW.down : PREVIEW_ARROW.up}`;
}

/** Pure: a hovered card's flyout (AC 36) — its change rows, amber; null for
 *  a card whose face moves no printed number (the tile outline and the amber
 *  slots carry the change). */
export function cardFlyout(name: string, rows: readonly CardStatRow[]): FlyoutModel | null {
  if (rows.length === 0) return null;
  return { title: name, lines: rows.map((r) => ({ label: r.label, value: changeText(r), amber: true })) };
}

/** Pure: the signature that decides a flyout re-render. */
export function flyoutSig(m: FlyoutModel): string {
  return `${m.title}|${m.lines.map((l) => `${l.label}=${l.value}${l.amber ? '!' : ''}`).join('|')}`;
}
