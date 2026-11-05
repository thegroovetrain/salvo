// The hotbar's square index space (Story 10.5, 2026-11-05, epic-10 amendment
// 10): the loadout slots keep their indices, and the two cooldown abilities
// (`C` HULL REPAIR, `V` SMOKE) take the squares right after them.

import { describe, it, expect } from 'vitest';
import { SLOT_BOOST, SLOT_COUNT, SLOT_GUN, WEAPON_SLOTS } from '@salvo/shared';
import {
  ABILITY_SQUARES,
  HOTBAR_SQUARE_COUNT,
  abilityAtSquare,
  abilitySquare,
  isCooldownAbility,
  squareOfAbility,
} from '../render/hotbarSquares.js';

describe('the hotbar square index space', () => {
  it('is every loadout slot, then one square per cooldown ability', () => {
    expect(HOTBAR_SQUARE_COUNT).toBe(SLOT_COUNT + ABILITY_SQUARES.length);
    expect(ABILITY_SQUARES).toEqual(['repair', 'smoke']); // C before V, left to right
  });

  it('abilitySquare and abilityAtSquare are inverses past the loadout, and null on it', () => {
    for (const id of ABILITY_SQUARES) {
      expect(abilitySquare(id), id).toBeGreaterThanOrEqual(SLOT_COUNT);
      expect(abilityAtSquare(abilitySquare(id)), id).toBe(id);
    }
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) expect(abilityAtSquare(slot), String(slot)).toBeNull();
    expect(abilityAtSquare(HOTBAR_SQUARE_COUNT)).toBeNull();
    expect(abilityAtSquare(-1)).toBeNull();
    expect(abilityAtSquare(Number.NaN)).toBeNull();
  });

  it('squareOfAbility: the Shift lands on its slot square, C / V on their own', () => {
    expect(squareOfAbility('shift')).toBe(SLOT_BOOST);
    expect(squareOfAbility('repair')).toBe(abilitySquare('repair'));
    expect(squareOfAbility('smoke')).toBe(abilitySquare('smoke'));
  });

  it('isCooldownAbility tells an ability from slot equipment', () => {
    expect(isCooldownAbility('repair')).toBe(true);
    expect(isCooldownAbility('smoke')).toBe(true);
    expect(isCooldownAbility('boost')).toBe(false);
    expect(isCooldownAbility('heavyTorpedo')).toBe(false);
    expect([SLOT_GUN, ...WEAPON_SLOTS].every((s) => abilityAtSquare(s) === null)).toBe(true);
  });
});
