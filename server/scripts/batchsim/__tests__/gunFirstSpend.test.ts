// THE GUN-FIRST SPEND MODE (balance campaign, 2026-10-01) — `--bot-spend gun`:
// a rolled in-game profile keeps its whole temperament, but whenever the hand
// deals its MOUNTED gun's ladder card it takes it; otherwise the shipped
// weighted scorer decides. Exists so a campaign can measure tier V guns
// (bots on the weighted policy reach tier V in ~1-2% of bot-matches).
//
// Harness-only by construction: BotController.spend is set only by the
// batch-sim runner, and no shipped profile row is 'gunFirst'.

import { describe, it, expect } from 'vitest';
import { CATALOG, CONSUMABLE_SLOTS, WEAPON_SLOTS, type EquipmentId, type SlotItemId } from '@salvo/shared';
import { parseArgs } from '../args.js';
import { chooseSpend, type BotSpendState } from '../../../src/game/ai/spending.js';
import { BOT_PROFILES, profileOf } from '../../../src/game/ai/profiles.js';
import { profileRowOf } from '../../../src/game/ai/tactics.js';
import type { BotMind } from '../../../src/game/ai/types.js';

function slotsOf(gun: EquipmentId): (SlotItemId | null)[] {
  const out: (SlotItemId | null)[] = [gun, 'boost'];
  for (let i = 0; i < WEAPON_SLOTS.length; i += 1) out.push(null);
  for (let i = 0; i < CONSUMABLE_SLOTS.length; i += 1) out.push(null);
  return out;
}

function state(over: Partial<BotSpendState>): BotSpendState {
  return { bankedLevels: 1, offer: null, cards: [], hp: 100, maxHp: 100, ...over };
}

const weighted = profileOf('raider');
const gunFirst = { ...weighted, spend: 'gunFirst' as const };

describe('args — --bot-spend gun', () => {
  it('parses gun; still needs --bots', () => {
    expect(parseArgs(['--bots', '3', '--bot-spend', 'gun']).botSpend).toBe('gun');
    expect(() => parseArgs(['--bot-spend', 'gun'])).toThrow(/needs --bots/);
  });
});

describe('chooseSpend — gunFirst', () => {
  it('gun ladder card present -> taken, even where the weighted scorer picks otherwise', () => {
    // The raider favors heavy torpedoes: weighted takes the weapon (index 1).
    const s = state({ offer: ['deckGun', 'heavyTorpedo'], slotIds: slotsOf('gun') });
    expect(chooseSpend(weighted, s, CATALOG)).toBe(1);
    expect(chooseSpend(gunFirst, s, CATALOG)).toBe(0);
  });

  it('takes the MOUNTED gun ladder (machine gun / flak), never another gun line', () => {
    const mg = state({ offer: ['heavyTorpedo', 'deckGun', 'machineGun'], slotIds: slotsOf('machineGun') });
    expect(chooseSpend(gunFirst, mg, CATALOG)).toBe(2);
    const flak = state({ offer: ['flak', 'heavyTorpedo'], slotIds: slotsOf('flak') });
    expect(chooseSpend(gunFirst, flak, CATALOG)).toBe(0);
  });

  it('gun ladder card absent -> exactly the weighted profile choice', () => {
    const hands: (readonly string[])[] = [
      ['armor', 'heavyTorpedo', 'hullRepair'],
      ['speed', 'reload', 'smokeScreen'],
      ['machineGun', 'flak', 'turning'], // other guns' ladders while the cannon is mounted
    ];
    for (const offer of hands) {
      const s = state({ offer, slotIds: slotsOf('gun') });
      expect(chooseSpend(gunFirst, s, CATALOG)).toBe(chooseSpend(weighted, s, CATALOG));
    }
  });

  it('a capped gun ladder is not spendable -> falls through to the weighted choice', () => {
    const cards = ['deckGun', 'deckGun', 'deckGun', 'deckGun'];
    const s = state({ offer: ['deckGun', 'armor'], cards, slotIds: slotsOf('gun') });
    expect(chooseSpend(gunFirst, s, CATALOG)).toBe(chooseSpend(weighted, s, CATALOG));
    expect(chooseSpend(gunFirst, s, CATALOG)).toBe(1);
  });
});

describe('profileRowOf — the spendGunFirst override', () => {
  const mind = (over: Partial<BotMind>): BotMind => ({ profile: 'raider', ...over }) as BotMind;

  it('flips only spend on a weighted row; absent = the frozen shipped row', () => {
    expect(profileRowOf(mind({}))).toBe(BOT_PROFILES.raider);
    const row = profileRowOf(mind({ spendGunFirst: true }));
    expect(row.spend).toBe('gunFirst');
    expect({ ...row, spend: 'weighted' }).toEqual(BOT_PROFILES.raider);
  });

  it('leaves a random test row random', () => {
    expect(profileRowOf(mind({ profile: 'randomBattleship', spendGunFirst: true })).spend).toBe('random');
  });
});
