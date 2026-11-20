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
//     the arrow of the move.
//   • A hovered SHIP-stat card (ARMOR / POWER / ENGINES / RELOAD / INTEL):
//     its ship row changes in place AND every fitted weapon / ability whose
//     SHOWN stats it moves opens its own box beside its own row, with the
//     moved lines amber `old → new ▲` (Eric 2026-11-20: *"those weapon side
//     boxes with the stats need to open up and show the upgrade"*). Which rows
//     is read off the data — the same stat lines the box prints, under the
//     current fold vs the card's re-fold — never a per-stat table.

import type { EffectiveStats, EquipmentId, ShiftId } from '@salvo/shared';
import { abilityStatRows, equipmentStatRows, statValueText, TIER_ARROW, type CardStatRow } from '../../ui/boonCopy.js';
import { ABILITY_KINDS, WEAPON_ROW_KINDS, type AbilityKind, type WeaponRowKind } from './layout.js';
import { PREVIEW_ARROW } from './skins.js';
import type { AbilityModel, PreviewMarks, WeaponRowModel } from './readouts.js';

/** One open box: its model and the tile it sits beside (an index into the
 *  weapon tiles, or into the ability tiles when `ability`). */
export interface FlyoutBox {
  model: FlyoutModel;
  row: number;
  ability: boolean;
}

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
 *  ship rows (which change in place; the weapon / ability tiles whose shown
 *  stats they move open their boxes via `shipCardFlyouts`). */
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

/** Pure: a weapon tile's box under a ship-stat card — exactly its printed
 *  stat lines the card's marks move (the readouts `rowStatFields` picks over
 *  `effectiveStats`, re-folded with the card), amber `old → new ▲`; null when
 *  the card moves none of them. */
export function rowChangeFlyout(row: WeaponRowModel, marks: PreviewMarks): FlyoutModel | null {
  const lines: FlyoutLine[] = [];
  for (const r of row.stats) {
    const m = marks.get(r.key);
    if (m !== undefined) lines.push({ label: r.label, value: changeText({ label: r.label, cur: r.value, next: m.value }), amber: true });
  }
  return lines.length === 0 ? null : { title: row.name, lines };
}

/** Pure: an ability tile's box under a ship-stat card — the lines of its
 *  table (`abilityFlyout`) whose printed value differs between the fold
 *  before and after the card, amber `old → new ▲`; null when none does. */
export function abilityChangeFlyout(ab: AbilityModel, before: EffectiveStats, after: EffectiveStats, shift: ShiftId): FlyoutModel | null {
  const was = abilityFlyout(ab, before, shift).lines;
  const now = abilityFlyout(ab, after, shift).lines;
  const lines: FlyoutLine[] = [];
  now.forEach((l, i) => {
    const old = was[i]?.value ?? null;
    if (old !== l.value) lines.push({ label: l.label, value: changeText({ label: l.label, cur: old, next: l.value }), amber: true });
  });
  return lines.length === 0 ? null : { title: ab.name, lines };
}

/** The before / after folds a ship-stat card's ability boxes compare. */
export interface FoldPair {
  before: EffectiveStats;
  after: EffectiveStats;
}

/** Pure: EVERY box a hovered ship-stat card opens — one per weapon tile
 *  (`rowChangeFlyout`) and per ability tile (`abilityChangeFlyout`) whose
 *  shown stats it moves, in bar order (weapons top to bottom, then the
 *  abilities). An empty list when it moves none. */
export function shipCardFlyouts(
  rows: readonly WeaponRowModel[],
  abilities: readonly AbilityModel[],
  marks: PreviewMarks,
  folds: FoldPair | null,
  shift: ShiftId,
): FlyoutBox[] {
  const out: FlyoutBox[] = [];
  rows.forEach((row, i) => {
    const model = rowChangeFlyout(row, marks);
    if (model !== null) out.push({ model, row: i, ability: false });
  });
  if (folds === null) return out;
  abilities.forEach((ab, i) => {
    const model = abilityChangeFlyout(ab, folds.before, folds.after, shift);
    if (model !== null) out.push({ model, row: i, ability: true });
  });
  return out;
}

/**
 * Pure: the tops (px) of boxes stacked beside one bar so none overlaps the
 * next — each wants the top of its own row (`wants`, ascending), sits at
 * least `gap` below the box above it, and the stack stays above
 * `bottom − gap` (pushed up from the bottom when it would overrun) and below
 * 0. A single box is today's placement: its row's top, kept on screen.
 */
export function stackTops(wants: readonly number[], heights: readonly number[], gap: number, bottom: number): number[] {
  const tops: number[] = [];
  let floor = -Infinity;
  for (let i = 0; i < wants.length; i++) {
    tops.push(Math.max(wants[i], floor));
    floor = tops[i] + heights[i] + gap;
  }
  let limit = bottom - gap;
  for (let i = tops.length - 1; i >= 0; i--) {
    tops[i] = Math.max(0, Math.min(tops[i], limit - heights[i]));
    limit = tops[i] - gap;
  }
  return tops;
}
