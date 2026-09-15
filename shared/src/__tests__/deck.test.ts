// THE DECK MODEL engine (Story 2.8, amendment 38; re-cut for catalog v3 in
// Story 8.1) — sim/deck.ts. Pins:
//   (1) THE INTERIM DECK (Eric ruling 2026-09-15, amendment 5): every NON-STUB
//       line at its cap, identical for every hull, and NO STUB EVER DEALT — so
//       no stub id can reach an offer;
//   (2) drawOffer distinctness / weight-by-copies-remaining / determinism /
//       empty-and-thin-deck fail-safety, and that a draw is NON-CONSUMING;
//   (3) consumeCard — the FIT, the deck's one and only outflow;
//   (4) a full-economy replay property with NO PITY anywhere in it: no line
//       ever exceeds its copy count, the deck visibly thins, same seed = same
//       economy.
//
// RETIRED with rarity (Story 8.1): the per-hull subdeck composition matrix,
// `consumeAcquisition` and the acquisition purge, and the soft-pity escalation
// (`levelsSinceRare`, CONFIG.deck.rareWeight*). Catalog v3 has no rarity tier
// to escalate and no acquisition card to purge.
//
// "Drones never get a deck" is a SERVER rule: buildDeck is hull-agnostic by
// design, so that pin lives server-side.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  LINE_IDS,
  buildDeck,
  catalogCardCount,
  consumeCard,
  drawOffer,
  isStubLine,
  mulberry32,
  type Catalog,
  type CatalogLine,
  type DeckState,
  type LineId,
} from '../index.js';

/** Count cards per line id. */
function tally(cards: readonly LineId[]): Map<LineId, number> {
  const out = new Map<LineId, number>();
  for (const id of cards) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** A small injectable catalog builder (rows keep insertion order). */
function catalogOf(lines: readonly CatalogLine[]): Catalog {
  const out: Record<string, CatalogLine> = {};
  for (const l of lines) out[l.id] = l;
  return out;
}

const testLine = (id: string, cap = 5, stub?: true): CatalogLine => ({
  id: id as unknown as LineId,
  kind: 'ladder',
  cap,
  tiers: new Array<readonly never[]>(cap).fill([]),
  ...(stub === undefined ? {} : { stub }),
});

const NON_STUB = LINE_IDS.filter((id) => !isStubLine(id));

describe('buildDeck — THE INTERIM DECK (Eric ruling 2026-09-15)', () => {
  it('deals every NON-STUB line at its cap, in CATALOG order', () => {
    const deck = buildDeck();
    const counts = tally(deck.cards);
    for (const id of LINE_IDS) {
      expect(counts.get(id) ?? 0, id).toBe(isStubLine(id) ? 0 : CATALOG[id].cap);
    }
    // Composition order is the catalog's, which is what makes the deck itself
    // deterministic rather than merely the draw off it.
    expect([...new Set(deck.cards)]).toEqual(NON_STUB);
  });

  it('NEVER deals a stub — the one place "authored but unbuilt" becomes "unofferable"', () => {
    const dealt = new Set(buildDeck().cards);
    for (const id of LINE_IDS) expect(dealt.has(id), id).toBe(!isStubLine(id));
    expect(NON_STUB).toHaveLength(16);
  });

  it('is 53 cards and IDENTICAL for every hull (interim: no per-hull composition yet)', () => {
    const size = NON_STUB.reduce((n, id) => n + CATALOG[id].cap, 0);
    expect(size).toBe(53);
    expect(buildDeck().cards).toHaveLength(53);
    // ...and it is a strict SUBSET of the 114-card catalog — the 61 stub cards
    // are exactly what is missing.
    expect(catalogCardCount() - size).toBe(61);
    // buildDeck takes no hull argument at all, so "identical for every hull" is
    // structural rather than asserted over three calls.
    expect(buildDeck()).toEqual(buildDeck());
  });

  it('takes an injected catalog (the Story 8.2 seam) and honours `stub` in it', () => {
    const deck = buildDeck(catalogOf([testLine('a', 2), testLine('b', 3, true), testLine('c', 1)]));
    expect(deck.cards).toEqual(['a', 'a', 'c']);
  });

  it('CONFIG.deck carries the AUTHORED-deck rules and nothing pity-shaped', () => {
    expect(CONFIG.deck).toEqual({ size: 40, maxEquipmentLines: 3 });
    expect('rareWeightBase' in CONFIG.deck).toBe(false);
    expect('rareWeightPerDryLevel' in CONFIG.deck).toBe(false);
  });
});

describe('drawOffer — distinct lines, weight by copies remaining, determinism', () => {
  const rng = () => mulberry32(12345);

  it('draws CONFIG.offer.size DIFFERENT lines and takes NOTHING out of the pool', () => {
    const deck = buildDeck();
    const { deck: after, offer } = drawOffer(deck, rng());
    expect(offer).toHaveLength(CONFIG.offer.size);
    expect(new Set(offer).size).toBe(offer.length);
    expect(after.cards).toEqual(deck.cards); // a draw is a READ
  });

  it('never offers a STUB line, over many draws', () => {
    const deck = buildDeck();
    const stream = mulberry32(99);
    for (let i = 0; i < 400; i += 1) {
      for (const id of drawOffer(deck, stream).offer) expect(isStubLine(id), id).toBe(false);
    }
  });

  it('is deterministic: the same rng seed yields the same offer', () => {
    const deck = buildDeck();
    expect(drawOffer(deck, rng()).offer).toEqual(drawOffer(deck, rng()).offer);
  });

  it('advances the stream: consecutive draws off ONE rng are not all identical', () => {
    const deck = buildDeck();
    const stream = mulberry32(7);
    const draws = [drawOffer(deck, stream).offer, drawOffer(deck, stream).offer, drawOffer(deck, stream).offer];
    expect(new Set(draws.map((d) => d.join(','))).size).toBeGreaterThan(1);
  });

  it('WEIGHT IS COPIES REMAINING — a 5-copy line outdraws a 1-copy line, with no rarity dial anywhere', () => {
    const cat = catalogOf([testLine('fat', 5), testLine('thin', 1)]);
    const deck: DeckState = { cards: [...new Array(5).fill('fat'), 'thin'] as unknown as LineId[] };
    const stream = mulberry32(2026);
    let fatFirst = 0;
    const n = 2000;
    for (let i = 0; i < n; i += 1) if (drawOffer(deck, stream, cat).offer[0] === ('fat' as unknown as LineId)) fatFirst += 1;
    // 5:1 weighting — well away from the 50 % a flat weight would give.
    expect(fatFirst / n).toBeGreaterThan(0.78);
    expect(fatFirst / n).toBeLessThan(0.89);
  });

  it('an EMPTY deck draws an empty offer and never throws (the level banks no offer)', () => {
    expect(drawOffer({ cards: [] }, rng()).offer).toEqual([]);
  });

  it('a THIN deck (fewer distinct lines than offer size) draws exactly what exists', () => {
    const cat = catalogOf([testLine('a'), testLine('b')]);
    const offer = drawOffer({ cards: ['a', 'b'] as unknown as LineId[] }, rng(), cat).offer;
    expect(offer.sort()).toEqual(['a', 'b']);
  });

  it('junk ids in the pool are never drawable (fail-closed) but stay in the cards', () => {
    const cat = catalogOf([testLine('a')]);
    const deck: DeckState = { cards: ['a', 'junk', 'constructor'] as unknown as LineId[] };
    for (let i = 0; i < 50; i += 1) expect(drawOffer(deck, mulberry32(i), cat).offer).toEqual(['a']);
    expect(deck.cards).toHaveLength(3);
  });
});

describe('the deck has no inflow — cards only ever LEAVE', () => {
  it('a draw never grows the pool and a fit shrinks it by exactly one', () => {
    let deck = buildDeck();
    const start = deck.cards.length;
    deck = drawOffer(deck, mulberry32(1)).deck;
    expect(deck.cards).toHaveLength(start);
    deck = consumeCard(deck, 'armor');
    expect(deck.cards).toHaveLength(start - 1);
  });
});

describe("consumeCard — the FIT, the deck's one and only outflow", () => {
  it('removes exactly ONE copy', () => {
    const deck = buildDeck();
    const after = consumeCard(deck, 'armor');
    expect(tally(after.cards).get('armor')).toBe(CATALOG.armor.cap - 1);
    expect(after.cards).toHaveLength(deck.cards.length - 1);
  });

  it('an id with no copy left is a NO-OP (fail-closed, the same state reference)', () => {
    const deck: DeckState = { cards: ['armor'] };
    const once = consumeCard(deck, 'armor');
    expect(once.cards).toEqual([]);
    expect(consumeCard(once, 'armor')).toBe(once);
    expect(consumeCard(deck, 'nope' as LineId)).toBe(deck);
  });

  it('a single-copy line, once fitted, can NEVER be drawn again (the cap is exact)', () => {
    let deck = buildDeck();
    expect(tally(deck.cards).get('deckGunTurret')).toBe(1);
    deck = consumeCard(deck, 'deckGunTurret');
    const stream = mulberry32(31337);
    for (let i = 0; i < 500; i += 1) expect(drawOffer(deck, stream).offer).not.toContain('deckGunTurret');
  });
});

describe('full-economy replay — the deck plays out clean (property)', () => {
  /** Play the whole deck out: draw, take the first card, fit it, repeat. */
  function replay(seed: number): { picks: LineId[]; deck: DeckState } {
    const stream = mulberry32(seed);
    let deck = buildDeck();
    const picks: LineId[] = [];
    for (let level = 0; level < 200; level += 1) {
      const drawn = drawOffer(deck, stream);
      deck = drawn.deck;
      const pick = drawn.offer[0];
      if (pick === undefined) break;
      picks.push(pick);
      deck = consumeCard(deck, pick);
    }
    return { picks, deck };
  }

  it('no line is EVER picked beyond its cap — caps self-enforce physically', () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const { picks, deck } = replay(seed);
      const counts = tally(picks);
      for (const [id, n] of counts) expect(n, `${seed}:${id}`).toBeLessThanOrEqual(CATALOG[id].cap);
      expect(picks.length, `${seed}`).toBe(53); // the whole deck plays out
      expect(deck.cards, `${seed}`).toEqual([]);
    }
  });

  it('the deck visibly thins: every pick removes one card, and no stub is ever picked', () => {
    const { picks } = replay(4242);
    for (const id of picks) expect(isStubLine(id), id).toBe(false);
  });

  it('the same seed replays the identical economy (server-side reproducibility)', () => {
    expect(replay(777).picks).toEqual(replay(777).picks);
    expect(replay(777).picks).not.toEqual(replay(778).picks);
  });
});
