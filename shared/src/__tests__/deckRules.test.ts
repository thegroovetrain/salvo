// DECK LEGALITY (Story 8.2) — sim/deckRules.ts. Pins the spec's I/O matrix
// row by row: exactly four rules, in a fixed order, and NOTHING ELSE — no heal
// requirement, no ladder requirement, no hull lock. A pure-gunboat deck, a
// zero-heal deck and the harness's pacifist posture are all legal.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_DECKS,
  DEFAULT_OWNED,
  LINE_IDS,
  SHIP_CLASS_IDS,
  checkDeck,
  equipmentLineCount,
  type LineId,
} from '../index.js';

/** A fresh, mutable copy of a default deck. */
const copyOf = (hull: keyof typeof DEFAULT_DECKS): LineId[] => [...DEFAULT_DECKS[hull]];

/** Swap the first occurrence of `from` for `to` — keeps the count at 40. */
function swap(deck: LineId[], from: LineId, to: LineId): LineId[] {
  const at = deck.indexOf(from);
  expect(at).toBeGreaterThanOrEqual(0);
  deck[at] = to;
  return deck;
}

describe('checkDeck — the default decks and the two legal extremes', () => {
  it.each(SHIP_CLASS_IDS)('%s default deck is legal against a fresh account', (hull) => {
    expect(checkDeck(DEFAULT_DECKS[hull], DEFAULT_OWNED)).toEqual({ ok: true });
  });

  it('a ZERO-HEAL deck is legal — there is no heal requirement', () => {
    // hullRepair ×3 → armor is at cap already (3 of 4)... so trade them for
    // reload copies (3 of 5 in the default; cap 5) — two fit, the third goes
    // to radarSweep (3 of 5).
    const deck = copyOf('torpedoBoat');
    swap(deck, 'hullRepair', 'reload');
    swap(deck, 'hullRepair', 'reload');
    swap(deck, 'hullRepair', 'radarSweep');
    expect(deck.includes('hullRepair')).toBe(false);
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual({ ok: true });
  });

  it('a PURE-GUNBOAT deck (zero equipment lines) is legal — there is no ladder or weapon requirement', () => {
    // Every owned non-equipment line at its cap, trimmed to 40 in LINE_IDS
    // order: the same construction as the harness's PACIFIST_DECK.
    const deck: LineId[] = [];
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      if (line.kind === 'equipment' || line.kind === 'addon' || !DEFAULT_OWNED.has(id)) continue;
      for (let i = 0; i < line.cap; i += 1) deck.push(id);
    }
    const forty = deck.slice(0, CONFIG.deck.size);
    expect(equipmentLineCount(forty)).toBe(0);
    expect(checkDeck(forty, DEFAULT_OWNED)).toEqual({ ok: true });
  });

  it('is pure: the same inputs give an equal verdict and the deck is untouched', () => {
    const deck = copyOf('mineLayer');
    const before = [...deck];
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual(checkDeck(deck, DEFAULT_OWNED));
    expect(deck).toEqual(before);
  });
});

describe('checkDeck — the four rules, one at a time', () => {
  it("'size': 41 cards (default + one armor)", () => {
    expect(checkDeck([...DEFAULT_DECKS.torpedoBoat, 'armor'], DEFAULT_OWNED)).toEqual({ ok: false, rule: 'size' });
  });

  it("'size': 39 cards, and an empty list", () => {
    expect(checkDeck(DEFAULT_DECKS.torpedoBoat.slice(1), DEFAULT_OWNED)).toEqual({ ok: false, rule: 'size' });
    expect(checkDeck([], DEFAULT_OWNED)).toEqual({ ok: false, rule: 'size' });
  });

  it("'equipmentLines': a fourth equipment line (TB default with broadside swapped in for a ladder copy, broadside owned)", () => {
    const deck = swap(copyOf('torpedoBoat'), 'armor', 'broadside');
    const owned = new Set<LineId>([...DEFAULT_OWNED, 'broadside']);
    expect(equipmentLineCount(deck)).toBe(4);
    expect(checkDeck(deck, owned)).toEqual({ ok: false, rule: 'equipmentLines' });
  });

  it("'unowned': one phosphorShells in a 40-card deck (count kept at 40)", () => {
    const deck = swap(copyOf('battleship'), 'armor', 'phosphorShells');
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual({ ok: false, rule: 'unowned' });
  });

  it("'unowned': an id the catalog does not know is unowned even if the owned set names it", () => {
    const deck = swap(copyOf('battleship'), 'armor', 'junk' as LineId);
    const owned = new Set<string>([...DEFAULT_OWNED, 'junk']);
    expect(checkDeck(deck, owned)).toEqual({ ok: false, rule: 'unowned' });
    // ...including a prototype key (Object.hasOwn is the fail-closed gate).
    const proto = swap(copyOf('battleship'), 'armor', 'constructor' as LineId);
    expect(checkDeck(proto, new Set([...DEFAULT_OWNED, 'constructor']))).toEqual({ ok: false, rule: 'unowned' });
  });

  it("'overCap': acousticHoming ×2 in a 40-card deck", () => {
    const deck = swap(copyOf('torpedoBoat'), 'armor', 'acousticHoming');
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual({ ok: false, rule: 'overCap' });
  });

  it("'overCap': a fifth armor (cap 4)", () => {
    const deck = copyOf('torpedoBoat');
    swap(deck, 'speed', 'armor');
    swap(deck, 'speed', 'armor');
    expect(deck.filter((id) => id === 'armor')).toHaveLength(5);
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual({ ok: false, rule: 'overCap' });
  });
});

describe('checkDeck — rule ORDER is the contract (first failure reported)', () => {
  it("size beats every other rule: a 41-card deck with four equipment lines, an unowned id and an over-cap line says 'size'", () => {
    const deck = [...DEFAULT_DECKS.torpedoBoat, 'broadside', 'phosphorShells', 'acousticHoming'] as LineId[];
    expect(checkDeck(deck.slice(0, 41), DEFAULT_OWNED)).toEqual({ ok: false, rule: 'size' });
  });

  it("equipmentLines beats unowned and overCap", () => {
    const deck = copyOf('torpedoBoat');
    swap(deck, 'armor', 'broadside'); // 4th equipment line AND unowned
    swap(deck, 'speed', 'acousticHoming'); // over cap
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual({ ok: false, rule: 'equipmentLines' });
  });

  it("unowned beats overCap", () => {
    const deck = copyOf('torpedoBoat');
    swap(deck, 'armor', 'phosphorShells'); // unowned
    swap(deck, 'speed', 'acousticHoming'); // over cap
    expect(checkDeck(deck, DEFAULT_OWNED)).toEqual({ ok: false, rule: 'unowned' });
  });
});

describe('equipmentLineCount', () => {
  it('counts DISTINCT equipment lines only — copies, add-ons, ladders and consumables never count', () => {
    expect(equipmentLineCount(DEFAULT_DECKS.torpedoBoat)).toBe(3);
    expect(equipmentLineCount(['heavyTorpedo', 'heavyTorpedo', 'heavyTorpedo'])).toBe(1);
    expect(equipmentLineCount(['armor', 'acousticHoming', 'hullRepair', 'deckGun'])).toBe(0);
    expect(equipmentLineCount(['junk', 'constructor'])).toBe(0);
    expect(equipmentLineCount([])).toBe(0);
  });

  it('reads the injected catalog', () => {
    const cat = { x: { ...CATALOG.heavyTorpedo, id: 'x' as LineId } };
    expect(equipmentLineCount(['x', 'x'], cat)).toBe(1);
    expect(equipmentLineCount(['heavyTorpedo'], cat)).toBe(0);
  });
});
