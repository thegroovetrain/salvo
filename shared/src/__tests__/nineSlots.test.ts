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
//   THE SEED TRIPWIRE IS RETIRED (Story 8.10): the interim spawn-seed table is
//   deleted, so a hull's weapon row holds nothing but the cards it is dealt and
//   the legal-deck property above is the whole claim.
//
// Pure, zero I/O. Seeded PRNG (mulberry32), so a failure is reproducible.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
  DEFAULT_DECKS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_GUN,
  applySlotEffect,
  canStock,
  checkDeck,
  effectiveStats,
  hullEnvelope,
  isStubLine,
  loadoutFor,
  mulberry32,
  slotsWithCards,
  type Catalog,
  type CatalogLine,
  type ConsumableId,
  type EquipmentId,
  type LineId,
  type LoadoutSlot,
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
      expect(loadout[SLOT_BOOST].equipmentId, label).toBe('boost');
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

// ---------------------------------------------------------------------------
// THE RACK PROPERTY (Story 8.7). The belt's fill rule is the weapon row's
// sibling — held-line-first, then first-empty — and it has to hold over any
// legal deck taken in any order. The production catalog cannot exercise it on
// its own (HULL REPAIR is the one live line since Story 8.8; the other four are
// still stubs, epic-8 amendment 41), so the property runs on the production
// catalog with all five UN-STUBBED: exactly the catalog the remaining
// consumable stories ship, one flag at a time.
// ---------------------------------------------------------------------------

/** The production catalog, consumables un-stubbed — nothing else changed. */
const LIVE_BELT: Catalog = (() => {
  const rows: Record<string, CatalogLine> = { ...CATALOG };
  for (const id of CONSUMABLE_IDS) {
    const { stub: _stub, ...rest } = CATALOG[id];
    rows[id] = rest;
  }
  return rows;
})();

/** The consumable lines of a hand, in FIT ORDER, first occurrence only. */
function consumableOrder(cards: readonly LineId[]): ConsumableId[] {
  const out: ConsumableId[] = [];
  for (const id of cards) {
    if (!(CONSUMABLE_IDS as readonly string[]).includes(id)) continue;
    if (!out.includes(id as ConsumableId)) out.push(id as ConsumableId);
  }
  return out;
}

/** `[id:n, ...]` for the four belt slots, sorted — the permutation-invariant
 *  shape (WHICH slot a line lands in is a fact about pick order, the multiset
 *  of stacks is not). */
const beltMultiset = (loadout: readonly LoadoutSlot[]): string[] =>
  CONSUMABLE_SLOTS.map((i) => `${String(loadout[i].equipmentId)}:${loadout[i].state?.n ?? 0}`).sort();

describe('THE RACK PROPERTY — the belt over random legal decks and random pick orders', () => {
  it('over 200 random legal decks: one slot per line, n = copies held, canStock ≡ held ∨ empty, and the multiset is permutation-invariant', () => {
    const rng = mulberry32(0x8_7_be17);
    const stats = effectiveStats(hullEnvelope('torpedoBoat'));
    for (let trial = 0; trial < 200; trial += 1) {
      const { cards } = randomLegalDeck(rng);
      const label = `trial ${trial}`;
      const loadout = slotsWithCards(stats, cards, LIVE_BELT);
      const belt = CONSUMABLE_SLOTS.map((i) => loadout[i]);
      const held = belt.map((s) => s.equipmentId).filter((id) => id !== null);

      // 1. THE BELT NEVER HOLDS TWO SLOTS OF ONE LINE.
      expect(new Set(held).size, label).toBe(held.length);

      // 2. The belt holds the FIRST FOUR DISTINCT consumable lines, in fit
      //    order — the fifth and beyond are silent no-ops.
      const order = consumableOrder(cards);
      expect(held, label).toEqual(order.slice(0, CONSUMABLE_SLOTS.length));

      // 3. n PER SLOT IS COPIES HELD (capped by the line), and a stack never
      //    carries a reload.
      const copies = new Map<string, number>();
      for (const id of cards) copies.set(id, (copies.get(id) ?? 0) + 1);
      for (const slot of belt) {
        if (slot.equipmentId === null) {
          expect(slot.state, label).toBeNull();
          continue;
        }
        const id = slot.equipmentId;
        const n = Math.min(copies.get(id) ?? 0, LIVE_BELT[id].cap);
        expect(slot.state, `${label}:${id}`).toEqual({ n, reloadMsLeft: 0 });
      }

      // 4. canStock IS EXACTLY "held ∨ an empty belt slot".
      const slotIds = loadout.map((s) => s.equipmentId);
      const hasEmpty = held.length < CONSUMABLE_SLOTS.length;
      for (const id of CONSUMABLE_IDS) {
        expect(canStock(slotIds, id), `${label}:${id}`).toBe(held.includes(id) || hasEmpty);
      }

      // 5. THE WEAPON ROW IS UNTOUCHED BY THE RACK: slots 0–4 are byte-identical
      //    to the same hand folded through the production catalog, whose belt
      //    takes the hand's LIVE consumable lines only — today HULL REPAIR
      //    alone (Story 8.8; the other four are still stubs, amendment 41).
      const production = slotsWithCards(stats, cards, CATALOG);
      expect(loadout.slice(0, CONSUMABLE_SLOTS[0]), label).toEqual(production.slice(0, CONSUMABLE_SLOTS[0]));
      const live = order.filter((id) => CATALOG[id].stub !== true).slice(0, CONSUMABLE_SLOTS.length);
      const productionBelt = CONSUMABLE_SLOTS.map((i) => production[i].equipmentId);
      expect(productionBelt, `${label}:production belt`)
        .toEqual([...live, ...new Array<null>(CONSUMABLE_SLOTS.length - live.length).fill(null)]);

      // 6. PERMUTATION INVARIANCE. Re-taking the same cards in another order
      //    moves WHICH slot holds what only while the belt has room to spare;
      //    the multiset of stacks is invariant whenever the hand's consumable
      //    lines fit the belt, and a full belt stays full either way.
      const other = slotsWithCards(stats, shuffled(rng, cards), LIVE_BELT);
      if (order.length <= CONSUMABLE_SLOTS.length) {
        expect(beltMultiset(other), label).toEqual(beltMultiset(loadout));
      } else {
        const otherHeld = CONSUMABLE_SLOTS.map((i) => other[i].equipmentId).filter((id) => id !== null);
        expect(otherHeld, label).toHaveLength(CONSUMABLE_SLOTS.length);
        for (const id of otherHeld) expect(order, label).toContain(id);
      }
    }
  });

  it('the belt is exactly as wide as the number of lines a hand can stock at once (4 == 4)', () => {
    expect(CONSUMABLE_SLOTS).toHaveLength(4);
    expect(CONSUMABLE_IDS.length).toBeGreaterThan(CONSUMABLE_SLOTS.length); // five lines, four slots: refusals are real
  });
});
