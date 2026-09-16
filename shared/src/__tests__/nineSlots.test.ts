// NINE SLOTS (Story 8.5) — the two properties that tie the three moving parts
// of the slot re-cut together: the DECK RULE (a deck holds at most
// CONFIG.deck.maxEquipmentLines equipment lines), the FILL RULE (a `slotFill`
// takes the first empty WEAPON_SLOT), and the WIDTH of the weapon row (three).
//
//   1. THE LEGAL-DECK PROPERTY. For any deck `checkDeck` calls legal, fitting
//      every equipment copy it holds — in ANY order — never hits the full-row
//      refusal, and the weapon row ends up holding exactly the deck's non-stub
//      equipment lines. That is the load-bearing claim of the whole story: no
//      legal build can ever be dealt a card it has no slot for. It holds
//      because 3 ≤ 3 — if either number ever moves alone, this fails LOUDLY
//      rather than dropping a card silently in play.
//
//   2. THE SEED TRIPWIRE. The interim SPAWN_SEED (amendment 21) is fitted
//      BEFORE any drawn card, so a hull's seed and its deck's drawable
//      equipment lines share the same three-wide row. Their union must stay
//      within it.
//
// Pure, zero I/O. Seeded PRNG (mulberry32), so a failure is reproducible.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_DECKS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  SPAWN_SEED,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_GUN,
  applySlotEffect,
  checkDeck,
  effectiveStats,
  hullEnvelope,
  isStubLine,
  loadoutFor,
  mulberry32,
  type EquipmentId,
  type LineId,
  type Rng,
} from '../index.js';

/** Every line is owned: the ownership rules are not what this suite probes. */
const OWNED_ALL: ReadonlySet<string> = new Set<string>(LINE_IDS);

/** The eleven `equipment` lines — STUBS INCLUDED, because the DECK RULE counts
 *  them and a legal deck may be built entirely out of them. */
const EQUIPMENT_LINES: readonly LineId[] = LINE_IDS.filter((id) => CATALOG[id].kind === 'equipment');

/** Everything a deck can be padded out with: ladders, consumables, add-ons. */
const FILLER_LINES: readonly LineId[] = LINE_IDS.filter((id) => CATALOG[id].kind !== 'equipment');

/** A Fisher-Yates shuffle off the seeded stream. */
function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A random LEGAL deck: up to `maxEquipmentLines` distinct equipment lines at
 * random counts, padded to exactly `CONFIG.deck.size` with non-equipment lines
 * at or under their caps (two passes — a random one, then a greedy one that
 * always closes the gap, since the filler capacity is 59 against a 40-card
 * deck). Returns the cards in a RANDOM order, plus the equipment lines it used.
 */
function randomLegalDeck(rng: Rng): { cards: LineId[]; equipment: LineId[] } {
  const equipment = shuffled(rng, EQUIPMENT_LINES).slice(0, rng.int(0, CONFIG.deck.maxEquipmentLines));
  const cards: LineId[] = [];
  for (const id of equipment) {
    for (let i = rng.int(1, CATALOG[id].cap); i > 0; i -= 1) cards.push(id);
  }
  const filler = shuffled(rng, FILLER_LINES);
  const taken = new Map<LineId, number>();
  for (const greedy of [false, true]) {
    for (const id of filler) {
      const room = Math.min(CONFIG.deck.size - cards.length, CATALOG[id].cap - (taken.get(id) ?? 0));
      if (room <= 0) continue;
      const n = greedy ? room : rng.int(0, room);
      taken.set(id, (taken.get(id) ?? 0) + n);
      for (let i = n; i > 0; i -= 1) cards.push(id);
    }
  }
  return { cards: shuffled(rng, cards), equipment };
}

describe('THE LEGAL-DECK PROPERTY — a legal deck can never out-card the weapon row', () => {
  it('over 250 random legal decks: every one passes checkDeck, no fill is refused, and the row holds exactly the non-stub equipment', () => {
    const rng = mulberry32(0x9510_75);
    const stats = effectiveStats(hullEnvelope('torpedoBoat'));
    let illegal = 0;
    for (let trial = 0; trial < 250; trial += 1) {
      const { cards, equipment } = randomLegalDeck(rng);
      const label = `trial ${trial}`;
      expect(cards, label).toHaveLength(CONFIG.deck.size);
      const verdict = checkDeck(cards, OWNED_ALL, CATALOG);
      if (!verdict.ok) {
        illegal += 1;
        continue; // the generator is wrong, not the fill rule — counted below
      }

      // Fit every copy in the deck's RANDOM order, exactly as slotsWithCards
      // replays it, and watch each individual fill land.
      const loadout = loadoutFor(stats);
      const copies = new Map<LineId, number>();
      for (const id of cards) {
        const line = CATALOG[id];
        const copy = (copies.get(id) ?? 0) + 1;
        copies.set(id, copy);
        expect(copy, `${label}:${id}`).toBeLessThanOrEqual(line.cap);
        for (const e of line.tiers[copy - 1] ?? []) {
          if (e.kind !== 'slotFill') continue;
          applySlotEffect(loadout, e, stats, CATALOG);
          // THE FULL-ROW REFUSAL IS NEVER REACHED: a non-stub fill always ends
          // up fitted somewhere (this same copy, or an earlier one).
          if (isStubLine(id)) continue;
          expect(loadout.some((s) => s.equipmentId === e.equipmentId), `${label}:${id}`).toBe(true);
        }
      }

      const expected = equipment.filter((id) => !isStubLine(id));
      const fitted = WEAPON_SLOTS.map((i) => loadout[i].equipmentId).filter((id) => id !== null);
      expect([...fitted].sort(), label).toEqual([...(expected as unknown as EquipmentId[])].sort());
      // ...and the fill never left the weapon row: gun, boost and the belt are
      // exactly as loadoutFor built them.
      expect(loadout[SLOT_GUN].equipmentId, label).toBe('gun');
      expect(loadout[SLOT_BOOST].equipmentId, label).toBe('speedBoost');
      for (const i of CONSUMABLE_SLOTS) {
        expect(loadout[i], `${label}:belt ${i}`).toEqual({ equipmentId: null, state: null });
      }
    }
    expect(illegal, 'decks the generator built that checkDeck rejected').toBe(0);
  });

  it('the row is exactly as wide as the deck rule is deep (3 == 3) — the reason the property holds', () => {
    expect(WEAPON_SLOTS).toHaveLength(CONFIG.deck.maxEquipmentLines);
  });
});

describe('THE SEED TRIPWIRE — the spawn seed and a deck’s equipment share one three-wide row', () => {
  // THIS TEST IS MEANT TO FIRE. Story 8.14 un-stubs `missile` and `monitor`,
  // which are two of the Battleship's three deck equipment lines; with its
  // `broadside` + `starShells` seed that is a union of FOUR, one more than the
  // row holds, and the last card dealt would be silently unfittable. Story
  // 8.10 removes SPAWN_SEED entirely (the level-zero offer replaces it), which
  // is the intended fix — if 8.14 lands first, this is the conversation to
  // have with Eric, not a number to edit.
  it.each([...SHIP_CLASS_IDS])('%s: |seed ∪ drawable equipment lines| <= the weapon row', (hull) => {
    const seed = SPAWN_SEED[hull] ?? [];
    const drawable = DEFAULT_DECKS[hull].filter((id) => CATALOG[id].kind === 'equipment' && !isStubLine(id));
    const union = new Set<LineId>([...seed, ...drawable]);
    expect(union.size, `${hull}: ${[...union].join('+')}`).toBeLessThanOrEqual(WEAPON_SLOTS.length);
  });
});
