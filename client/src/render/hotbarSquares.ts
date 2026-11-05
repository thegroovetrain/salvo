// THE HOTBAR'S SQUARE INDEX SPACE (Story 10.5, 2026-11-05, epic-10 amendment
// 11). The bar draws one square per LOADOUT SLOT (shared `SLOT_COUNT` — gun,
// Shift, Q / E / R) and then one per COOLDOWN ABILITY that holds no slot:
// HULL REPAIR on `C` and SMOKE on `V` (shared sim/abilities.ts). A square index
// below `SLOT_COUNT` IS the loadout slot; the two after it are the abilities,
// in `ABILITY_SQUARES` order. Every per-square array the bar reads (denied /
// activated latches, the layout's squares and chips, the key glyphs) is indexed
// in this one space, so the slot squares keep the indices they always had.
//
// Pure, no Pixi.

import {
  SLOT_BOOST,
  SLOT_COUNT,
  slotFamilyAt,
  type AbilityId,
  type CooldownAbilityId,
  type EquipmentId,
  type SlotFamily,
} from '@salvo/shared';

/** The cooldown abilities, in bar order (left to right after `R`). */
export const ABILITY_SQUARES: readonly CooldownAbilityId[] = Object.freeze(['repair', 'smoke'] as const);

/** Every square on the bar: the loadout slots, then the two abilities. */
export const HOTBAR_SQUARE_COUNT = SLOT_COUNT + ABILITY_SQUARES.length;

/** The key chip each ability square spells (the keys input/keyboard.ts binds). */
export const ABILITY_KEY_GLYPHS: Readonly<Record<CooldownAbilityId, string>> = { repair: 'C', smoke: 'V' };

/** Pure: the square an ability is drawn in. */
export function abilitySquare(id: CooldownAbilityId): number {
  return SLOT_COUNT + ABILITY_SQUARES.indexOf(id);
}

/** Pure: the ability a square draws, or null for a loadout-slot square (or
 *  an index off the bar). */
export function abilityAtSquare(square: number): CooldownAbilityId | null {
  if (!Number.isInteger(square) || square < SLOT_COUNT) return null;
  return ABILITY_SQUARES[square - SLOT_COUNT] ?? null;
}

/** Pure: the square an ABILITY press's feedback lands on — the Shift's slot
 *  square, or a cooldown ability's own square. */
export function squareOfAbility(id: AbilityId): number {
  return id === 'shift' ? SLOT_BOOST : abilitySquare(id);
}

/** What a square draws: the equipment in its loadout slot, or its ability. */
export type SquareItemId = EquipmentId | CooldownAbilityId;

/** Pure: is a square's content one of the two cooldown abilities? */
export function isCooldownAbility(id: SquareItemId): id is CooldownAbilityId {
  return (ABILITY_SQUARES as readonly string[]).includes(id);
}

/**
 * THE EMPTY FAMILY SLOT'S GLYPH (Eric 2026-11-05: *"I want the empty, grayed
 * out slots to at least indicate what kind of slot they are"*). One existing
 * drawing per family, picked so the three read apart at 54 px: the heavy
 * torpedo's (the original family torpedo drawing), the naval mine's and the
 * star shell's burst (a generic shell, not FLASH's struck eye). Visual only —
 * the square still carries no word.
 */
export const EMPTY_FAMILY_GLYPHS: Readonly<Record<SlotFamily, EquipmentId>> = Object.freeze({
  torpedo: 'heavyTorpedo',
  mine: 'navalMines',
  shell: 'starShells',
});

/** Pure: the glyph an EMPTY square draws — its slot family's, or null (the
 *  bare `—`) for a square with no family. */
export function emptySlotGlyph(square: number): EquipmentId | null {
  const family = slotFamilyAt(square);
  return family === null ? null : EMPTY_FAMILY_GLYPHS[family];
}
