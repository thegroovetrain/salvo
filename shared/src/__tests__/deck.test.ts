// THE DECK MODEL engine (Story 2.8, amendment 38) — sim/deck.ts. Pins:
// (1) buildDeck composition per hull loadout (universal intel/ship/guns +
// carried-equipment subdecks + one acquisition per NOT-carried equipment,
// copies per catalog — the spec's TB 13/15/10 + 17 + 10 + 4 matrix);
// (2) drawOffer distinctness / weighting / determinism / rare escalation +
// reset / empty-and-thin-deck fail-safety; (3) returnCards / consume-
// Acquisition purge / scrubAcquisitions (amendment 43) semantics; (4) a
// full-economy replay property (no line ever exceeds its copy count, the
// deck visibly thins, same seed = same economy). This suite also absorbs the
// retired offers.test.ts (rollBoonOffer died with the category-first roll —
// only the BoonOffer type survives in sim/offers.ts).
//
// "Drones never get a deck" is a SERVER rule (wave 2): buildDeck is loadout-
// driven and hull-agnostic by design, so that pin lives server-side.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  buildDeck,
  consumeAcquisition,
  drawOffer,
  isAcquisitionDef,
  mulberry32,
  returnCards,
  scrubAcquisitions,
  type BoonCatalog,
  type BoonDef,
  type BoonId,
  type DeckState,
  type EquipmentId,
} from '../index.js';

/** The carried equipment per hull (the loadoutFor fits, sans empty slot). */
const CARRIED: Record<'torpedoBoat' | 'battleship' | 'mineLayer', readonly EquipmentId[]> = {
  torpedoBoat: ['gun', 'torpedo', 'speedBoost'],
  battleship: ['gun', 'cannon', 'starShells'],
  mineLayer: ['gun', 'mine', 'decoyBuoy'],
};

/** Count cards per line id. */
function tally(cards: readonly BoonId[]): Map<BoonId, number> {
  const out = new Map<BoonId, number>();
  for (const id of cards) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Total cards of a category in a deck. */
function categoryCount(cards: readonly BoonId[], category: string): number {
  return cards.filter((id) => BOON_CATALOG[id]?.category === category && !isAcquisitionDef(BOON_CATALOG[id])).length;
}

/** A small injectable catalog builder (rows keep insertion order). */
function catalogOf(defs: readonly BoonDef[]): BoonCatalog {
  const out: Record<string, BoonDef> = {};
  for (const d of defs) out[d.id] = d;
  return out;
}

const common = (id: string, copies = 5): BoonDef => ({
  id,
  category: 'alpha',
  rarity: 'common',
  copies,
  effects: [{ kind: 'stat', path: 'maxHp', add: 1 }],
});

describe('buildDeck — composition per hull loadout', () => {
  it('Torpedo Boat: universal (guns 13, intel 15, ship 10) + torpedo 17 + boost 10 + 4 acquisitions = 69', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    expect(categoryCount(deck.cards, 'guns')).toBe(13); // 5+5+2+1
    expect(categoryCount(deck.cards, 'intel')).toBe(15); // 5+5+5
    expect(categoryCount(deck.cards, 'ship')).toBe(10); // 5+5
    expect(categoryCount(deck.cards, 'torpedoes')).toBe(17); // 5+4+5+1+1+1
    expect(categoryCount(deck.cards, 'speedBoost')).toBe(10); // 5+5
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireCannon', 'acquireDecoy', 'acquireMine', 'acquireStarShells']);
    expect(deck.cards).toHaveLength(69);
    expect(deck.levelsSinceRare).toBe(0);
  });

  it('Battleship: cannon + starShells subdecks; torpedo/mine/decoy/boost acquisitions', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.battleship);
    expect(categoryCount(deck.cards, 'cannon')).toBe(17); // 5+5+5+1+1
    expect(categoryCount(deck.cards, 'starShells')).toBe(17); // 5+5+5+1+1
    expect(categoryCount(deck.cards, 'torpedoes')).toBe(0);
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBoost', 'acquireDecoy', 'acquireMine', 'acquireTorpedo']);
    expect(deck.cards).toHaveLength(13 + 15 + 10 + 17 + 17 + 4);
  });

  it('Mine Layer: mines + decoyBuoy subdecks; torpedo/cannon/star/boost acquisitions', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.mineLayer);
    expect(categoryCount(deck.cards, 'mines')).toBe(27); // 5×5 + 1 + 1
    expect(categoryCount(deck.cards, 'decoyBuoy')).toBe(10);
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBoost', 'acquireCannon', 'acquireStarShells', 'acquireTorpedo']);
    expect(deck.cards).toHaveLength(13 + 15 + 10 + 27 + 10 + 4);
  });

  it('every line appears exactly `copies` times; a CARRIED equipment never has an acquisition card', () => {
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const deck = buildDeck(BOON_CATALOG, CARRIED[cls]);
      const counts = tally(deck.cards);
      for (const [id, n] of counts) {
        expect(n, `${cls}:${id}`).toBe(BOON_CATALOG[id].copies);
      }
      for (const eq of CARRIED[cls]) {
        const acq = deck.cards.find((id) => {
          const d = BOON_CATALOG[id];
          return isAcquisitionDef(d) && d.effects[0].kind === 'slotFill' && d.effects[0].equipmentId === eq;
        });
        expect(acq, `${cls}:${eq}`).toBeUndefined();
      }
    }
  });
});

describe('drawOffer — distinct weighted lines, determinism, escalation', () => {
  const tbDeck = (): DeckState => buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);

  it('draws CONFIG.offer.size DIFFERENT lines and removes exactly those copies', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const start = tbDeck();
      const { deck, offer } = drawOffer(start, mulberry32(seed));
      expect(offer).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer).size).toBe(offer.length); // distinct lines
      expect(deck.cards).toHaveLength(start.cards.length - offer.length);
      const before = tally(start.cards);
      const after = tally(deck.cards);
      for (const id of new Set(offer)) {
        const drawn = offer.filter((x) => x === id).length;
        expect(after.get(id) ?? 0).toBe((before.get(id) ?? 0) - drawn);
      }
    }
  });

  it('is deterministic: the same rng seed yields the same offer and deck', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const a = drawOffer(tbDeck(), mulberry32(seed));
      const b = drawOffer(tbDeck(), mulberry32(seed));
      expect(a.offer).toEqual(b.offer);
      expect(a.deck).toEqual(b.deck);
    }
  });

  it('advances the stream: consecutive draws off ONE rng are not all identical', () => {
    const rng = mulberry32(7);
    let deck = tbDeck();
    const offers: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const r = drawOffer(deck, rng);
      deck = returnCards(r.deck, r.offer); // return everything, redraw
      offers.push(r.offer.join(','));
    }
    expect(new Set(offers).size).toBeGreaterThan(1);
  });

  it('levelsSinceRare resets to 0 when any rare/exclusive lands, else increments', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const start = { ...tbDeck(), levelsSinceRare: 3 };
      const { deck, offer } = drawOffer(start, mulberry32(seed));
      const drewRare = offer.some((id) => BOON_CATALOG[id].rarity !== 'common');
      expect(deck.levelsSinceRare).toBe(drewRare ? 0 : 4);
    }
  });

  it('rare weight ESCALATES: dry levels raise the odds of a rare landing (soft pity)', () => {
    const rareRate = (levelsSinceRare: number): number => {
      let hits = 0;
      for (let seed = 0; seed < 400; seed += 1) {
        const start = { ...tbDeck(), levelsSinceRare };
        const { offer } = drawOffer(start, mulberry32(seed));
        if (offer.some((id) => BOON_CATALOG[id].rarity !== 'common')) hits += 1;
      }
      return hits / 400;
    };
    const dry0 = rareRate(0);
    const dry20 = rareRate(20);
    expect(dry20).toBeGreaterThan(dry0);
  });

  it('an EMPTY deck draws an empty offer and never throws (level banks no offer)', () => {
    const empty: DeckState = { cards: [], levelsSinceRare: 2 };
    const { deck, offer } = drawOffer(empty, mulberry32(1));
    expect(offer).toEqual([]);
    expect(deck.cards).toEqual([]);
    expect(deck.levelsSinceRare).toBe(3); // still a dry level
  });

  it('a THIN deck (fewer distinct lines than offer size) draws exactly what exists', () => {
    const cat = catalogOf([common('a', 3), common('b', 1)]);
    const thin: DeckState = { cards: ['a', 'a', 'a', 'b'], levelsSinceRare: 0 };
    const { deck, offer } = drawOffer(thin, mulberry32(5), cat);
    expect([...offer].sort()).toEqual(['a', 'b']); // 2 distinct lines only
    expect(deck.cards).toHaveLength(2); // two 'a' copies left
  });

  it('junk ids in the pool are never drawable (fail-closed) but stay in the cards', () => {
    const cat = catalogOf([common('a', 2)]);
    const junky: DeckState = { cards: ['ghost', 'a', 'ghost'], levelsSinceRare: 0 };
    const { deck, offer } = drawOffer(junky, mulberry32(2), cat);
    expect(offer).toEqual(['a']);
    expect(deck.cards.filter((id) => id === 'ghost')).toHaveLength(2);
  });
});

describe('returnCards — the unchosen give-back', () => {
  it('appends the ids and leaves levelsSinceRare untouched', () => {
    const deck: DeckState = { cards: ['a', 'b'], levelsSinceRare: 4 };
    const out = returnCards(deck, ['c', 'a']);
    expect(out.cards).toEqual(['a', 'b', 'c', 'a']);
    expect(out.levelsSinceRare).toBe(4);
    expect(returnCards(deck, [])).toBe(deck); // empty return: same state reference
  });

  it('draw → return round-trips the multiset (nothing lost, nothing invented)', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const { deck, offer } = drawOffer(start, mulberry32(11));
    const restored = returnCards(deck, offer);
    expect(tally(restored.cards)).toEqual(tally(start.cards));
  });
});

describe('consumeAcquisition — subdeck shuffle-in + total purge (amendment 38)', () => {
  it('R filled with mine: mine subdeck joins, EVERY acquisition card purges', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const after = consumeAcquisition(start, BOON_CATALOG, 'mine');
    expect(categoryCount(after.cards, 'mines')).toBe(27); // the full mine subdeck
    expect(after.cards.some((id) => isAcquisitionDef(BOON_CATALOG[id]))).toBe(false); // R is permanent
    // Everything else untouched.
    expect(categoryCount(after.cards, 'torpedoes')).toBe(17);
    expect(categoryCount(after.cards, 'guns')).toBe(13);
    expect(after.levelsSinceRare).toBe(start.levelsSinceRare);
  });

  it('the acquired equipment can never be acquired again (its card purged with the rest)', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const after = consumeAcquisition(start, BOON_CATALOG, 'cannon');
    expect(after.cards).not.toContain('acquireCannon');
    expect(after.cards).not.toContain('acquireMine');
    expect(categoryCount(after.cards, 'cannon')).toBe(17); // 5+5+5 commons + 2 exclusives
  });
});

describe('scrubAcquisitions — the stale-card rule (amendment 43)', () => {
  const purgedDeck = (): DeckState =>
    consumeAcquisition(buildDeck(BOON_CATALOG, CARRIED.torpedoBoat), BOON_CATALOG, 'mine');

  it('removes acquisition ids from each banked offer and refills to prior size with distinct fresh lines', () => {
    const deck = purgedDeck();
    const offers = [
      ['gunDamage', 'acquireCannon', 'intelSweep', 'shipHull'],
      ['torpedoSpeed', 'boostMax', 'acquireDecoy', 'acquireStarShells'],
    ];
    const out = scrubAcquisitions(deck, BOON_CATALOG, offers, mulberry32(9));
    expect(out.offers).toHaveLength(2);
    for (let i = 0; i < 2; i += 1) {
      const offer = out.offers[i];
      expect(offer).toHaveLength(4); // refilled to prior size
      expect(offer.some((id) => isAcquisitionDef(BOON_CATALOG[id]))).toBe(false);
      expect(new Set(offer).size).toBe(4); // still 4 DIFFERENT lines
      // Kept cards keep identity and order.
      expect(offer.slice(0, offers[i].filter((id) => !isAcquisitionDef(BOON_CATALOG[id])).length)).toEqual(
        offers[i].filter((id) => !isAcquisitionDef(BOON_CATALOG[id])),
      );
    }
    // Refill draws left the deck.
    expect(out.deck.cards).toHaveLength(deck.cards.length - 3);
    expect(out.deck.levelsSinceRare).toBe(deck.levelsSinceRare); // NOT a level draw
  });

  it('offers without acquisition cards pass through untouched, spending no draws', () => {
    const deck = purgedDeck();
    const offers = [['gunDamage', 'intelSweep', 'shipHull', 'boostMax']];
    const out = scrubAcquisitions(deck, BOON_CATALOG, offers, mulberry32(3));
    expect(out.offers).toEqual(offers);
    expect(out.deck.cards).toEqual([...deck.cards]);
  });

  it('is deterministic on the same stream (the own-pick-triggered, never-reroll guarantee)', () => {
    const offers = [['acquireCannon', 'gunDamage', 'intelRadar', 'torpedoReload']];
    const a = scrubAcquisitions(purgedDeck(), BOON_CATALOG, offers, mulberry32(21));
    const b = scrubAcquisitions(purgedDeck(), BOON_CATALOG, offers, mulberry32(21));
    expect(a.offers).toEqual(b.offers);
    expect(a.deck).toEqual(b.deck);
  });

  it('never refills an acquisition back in, even against an UN-purged deck (defensive)', () => {
    const unpurged = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat); // acquisitions still in the pool
    const offers = [['acquireCannon', 'acquireDecoy', 'acquireStarShells', 'gunDamage']];
    for (let seed = 0; seed < 40; seed += 1) {
      const out = scrubAcquisitions(unpurged, BOON_CATALOG, offers, mulberry32(seed));
      expect(out.offers[0]).toHaveLength(4);
      expect(out.offers[0].some((id) => isAcquisitionDef(BOON_CATALOG[id]))).toBe(false);
    }
  });
});

describe('full-economy replay — the deck plays out clean (property)', () => {
  /** Play a whole match economy: draw, pick the first card, return the rest;
   *  on an acquisition pick, consume + scrub (no banked offers held). */
  function playEconomy(seed: number): { picks: BoonId[]; drawn: BoonId[]; drawsUntilEmpty: number } {
    const rng = mulberry32(seed);
    let deck = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const picks: BoonId[] = [];
    const drawn: BoonId[] = [];
    let draws = 0;
    for (; draws < 500; draws += 1) {
      const r = drawOffer(deck, rng);
      if (r.offer.length === 0) break; // empty deck: level banks nothing
      drawn.push(...r.offer);
      const [chosen, ...unchosen] = r.offer;
      picks.push(chosen);
      deck = returnCards(r.deck, unchosen);
      const chosenDef = BOON_CATALOG[chosen];
      if (isAcquisitionDef(chosenDef) && chosenDef.effects[0].kind === 'slotFill') {
        deck = consumeAcquisition(deck, BOON_CATALOG, chosenDef.effects[0].equipmentId);
        deck = scrubAcquisitions(deck, BOON_CATALOG, [], rng).deck;
      }
    }
    expect(deck.cards).toHaveLength(0); // fully played out
    return { picks, drawn, drawsUntilEmpty: draws };
  }

  const DOCTRINE_PAIRS = [
    ['cannonArcing', 'cannonAp'],
    ['torpedoHoming', 'torpedoCommand'],
  ] as const;

  it('no line is EVER picked beyond its copy count — caps self-enforce physically', () => {
    for (const seed of [1, 42, 1337]) {
      const { picks } = playEconomy(seed);
      const counts = tally(picks);
      for (const [id, n] of counts) {
        expect(n, `seed ${seed}: ${id}`).toBeLessThanOrEqual(BOON_CATALOG[id].copies);
      }
      // At most ONE acquisition can ever be picked (the purge).
      const acquisitionPicks = picks.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
      expect(acquisitionPicks.length).toBeLessThanOrEqual(1);
    }
  });

  // The retired pin here asserted (a + b) <= 2 for two 1-copy lines — true by
  // construction and unfalsifiable. What the ENGINE actually owes is copy
  // scarcity per doctrine line; MUTUAL exclusion is the SERVER's job (the
  // applyBoon doctrine swap, exercised in server/doctrines.test), and the deck
  // deliberately does NOT impose it — that division of labor is what lets a
  // swapped-out rival's card return to the pool and ping-pong.
  it('a doctrine line may be OFFERED many times but PICKED at most `copies` (=1) — the only cap is scarcity', () => {
    for (const seed of [1, 42, 1337]) {
      const { picks, drawn } = playEconomy(seed);
      const pickCounts = tally(picks);
      const drawnCounts = tally(drawn);
      for (const pair of DOCTRINE_PAIRS) {
        for (const id of pair) {
          expect(BOON_CATALOG[id].copies, id).toBe(1); // the scarcity the pin rests on
          // Consuming a card is the ONLY thing that removes it for good: an
          // unchosen doctrine returns to the pool and can be offered again...
          expect(drawnCounts.get(id) ?? 0).toBeGreaterThanOrEqual(pickCounts.get(id) ?? 0);
          // ...but a PICKED one is gone — never a second copy in one replay.
          expect(pickCounts.get(id) ?? 0, `seed ${seed}: ${id}`).toBeLessThanOrEqual(BOON_CATALOG[id].copies);
        }
      }
    }
  });

  it('BOTH rivals of a pair can appear across replays — the engine imposes no exclusion', () => {
    const seen = new Set<BoonId>();
    for (let seed = 0; seed < 40; seed += 1) for (const id of playEconomy(seed).drawn) seen.add(id);
    for (const pair of DOCTRINE_PAIRS) {
      for (const id of pair) expect(seen.has(id), `${id} never drawable`).toBe(true);
    }
  });

  it('the same seed replays the identical economy (server-side reproducibility)', () => {
    expect(playEconomy(99)).toEqual(playEconomy(99));
  });
});
