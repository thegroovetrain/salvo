// THE DECK MODEL engine (Story 2.8, amendment 38) — sim/deck.ts. Pins:
// (1) buildDeck composition per hull loadout (universal intel/ship/guns +
// carried-equipment subdecks + one acquisition per NOT-carried equipment,
// copies per catalog — the TB 8/15/15 + 12 + 5 + 4 matrix after the
// 2026-08-04 global-cooldown thinning, with shipCooldown widened to ×5);
// (2) drawOffer distinctness / weighting / determinism / rare escalation +
// reset / empty-and-thin-deck fail-safety — and, since the lazy-draw bugfix,
// that a draw is NON-CONSUMING (the pool is only READ); (3) consumeCard (the
// fit — the deck's one and only outflow) / returnCards (the doctrine swap-out)
// / consumeAcquisition purge semantics; (4) a
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
  consumeCard,
  drawOffer,
  isAcquisitionDef,
  mulberry32,
  returnCards,
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
  it('Torpedo Boat: universal (guns 8, intel 9, ship 15) + torpedo 12 + boost 5 + 4 acquisitions = 53', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    expect(categoryCount(deck.cards, 'guns')).toBe(8); // 5+2+1 (the gunReload line died 2026-08-04)
    expect(categoryCount(deck.cards, 'intel')).toBe(9); // 4 intelRange + 5 intelSweep (was 5+5+5 before the merge)
    expect(categoryCount(deck.cards, 'ship')).toBe(15); // 5+5+5 (shipCooldown joined, widened to ×5)
    expect(categoryCount(deck.cards, 'torpedoes')).toBe(12); // 5+4+1+1+1
    expect(categoryCount(deck.cards, 'speedBoost')).toBe(5); // 5
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireCannon', 'acquireDecoy', 'acquireMine', 'acquireStarShells']);
    expect(deck.cards).toHaveLength(53);
    expect(deck.levelsSinceRare).toBe(0);
  });

  it('Battleship: cannon + starShells subdecks; torpedo/mine/decoy/boost acquisitions', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.battleship);
    expect(categoryCount(deck.cards, 'cannon')).toBe(7); // 5 damage + 2 exclusives (FRAGMENTATION CASING deleted, Eric 2026-08-16)
    expect(categoryCount(deck.cards, 'starShells')).toBe(12); // 5+5+1+1
    expect(categoryCount(deck.cards, 'torpedoes')).toBe(0);
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBoost', 'acquireDecoy', 'acquireMine', 'acquireTorpedo']);
    expect(deck.cards).toHaveLength(8 + 9 + 15 + 7 + 12 + 4); // 55
  });

  it('Mine Layer: mines + decoyBuoy subdecks; torpedo/cannon/star/boost acquisitions', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.mineLayer);
    expect(categoryCount(deck.cards, 'mines')).toBe(17); // 5x3 commons + 2 exclusives (the fuze line merged into BLAST CASING)
    expect(categoryCount(deck.cards, 'decoyBuoy')).toBe(5);
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBoost', 'acquireCannon', 'acquireStarShells', 'acquireTorpedo']);
    expect(deck.cards).toHaveLength(8 + 9 + 15 + 17 + 5 + 4); // 58
  });

  it('the 7 deleted reload lines are in NO hull deck; ship contributes 15 (Eric rulings 2026-08-04)', () => {
    const dead = ['gunReload', 'cannonReload', 'torpedoReload', 'mineReload', 'boostReload', 'starReload', 'decoyReload'];
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const deck = buildDeck(BOON_CATALOG, CARRIED[cls]);
      for (const id of dead) expect(deck.cards, `${cls}:${id}`).not.toContain(id);
      // The one global cooldown line replaces them, in the UNIVERSAL ship
      // subdeck — every hull draws it: 5 shipSpeed + 5 shipHull + 5 shipCooldown.
      expect(categoryCount(deck.cards, 'ship'), cls).toBe(15);
      expect(tally(deck.cards).get('shipCooldown'), cls).toBe(5);
    }
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

  it('draws CONFIG.offer.size DIFFERENT lines and takes NOTHING out of the pool', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const start = tbDeck();
      const { deck, offer } = drawOffer(start, mulberry32(seed));
      expect(offer).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer).size).toBe(offer.length); // distinct lines
      // THE ANTI-HOARDING PIN (the lazy-draw bugfix): a draw is a READ. Every
      // drawn line is still at full copies — banking a level costs no cards.
      expect(deck.cards).toHaveLength(start.cards.length);
      expect(tally(deck.cards)).toEqual(tally(start.cards));
      for (const id of new Set(offer)) {
        expect(tally(deck.cards).get(id)).toBe(BOON_CATALOG[id].copies);
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
      deck = r.deck; // nothing left the pool — just redraw off the same stream
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
    expect(deck.cards).toEqual(thin.cards); // ...and all 4 copies still in the pool
  });

  it('junk ids in the pool are never drawable (fail-closed) but stay in the cards', () => {
    const cat = catalogOf([common('a', 2)]);
    const junky: DeckState = { cards: ['ghost', 'a', 'ghost'], levelsSinceRare: 0 };
    const { deck, offer } = drawOffer(junky, mulberry32(2), cat);
    expect(offer).toEqual(['a']);
    expect(deck.cards.filter((id) => id === 'ghost')).toHaveLength(2);
  });
});

describe('returnCards — the doctrine swap-out give-back', () => {
  it('appends the ids and leaves levelsSinceRare untouched', () => {
    const deck: DeckState = { cards: ['a', 'b'], levelsSinceRare: 4 };
    const out = returnCards(deck, ['c', 'a']);
    expect(out.cards).toEqual(['a', 'b', 'c', 'a']);
    expect(out.levelsSinceRare).toBe(4);
    expect(returnCards(deck, [])).toBe(deck); // empty return: same state reference
  });

  it('consume → return round-trips the multiset (a doctrine can ping-pong)', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const fitted = consumeCard(start, 'torpedoHoming');
    expect(tally(returnCards(fitted, ['torpedoHoming']).cards)).toEqual(tally(start.cards));
  });
});

describe('consumeCard — the FIT, the deck\'s one and only outflow', () => {
  it('removes exactly ONE copy and leaves levelsSinceRare untouched', () => {
    const deck: DeckState = { cards: ['a', 'b', 'a', 'a'], levelsSinceRare: 4 };
    const out = consumeCard(deck, 'a');
    expect(out.cards).toEqual(['b', 'a', 'a']); // one copy, order preserved
    expect(out.levelsSinceRare).toBe(4);
  });

  it('an id with no copy left is a NO-OP (fail-closed, same state reference)', () => {
    const deck: DeckState = { cards: ['a'], levelsSinceRare: 1 };
    const once = consumeCard(deck, 'a');
    expect(once.cards).toEqual([]);
    expect(consumeCard(once, 'a')).toBe(once); // nothing to take: untouched
    expect(consumeCard(deck, 'ghost')).toBe(deck);
  });

  it('N fits remove exactly N cards — the deck thins by what was FITTED, nothing else', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const rng = mulberry32(4);
    let deck = start;
    const fitted: BoonId[] = [];
    for (let i = 0; i < 12; i += 1) {
      const { deck: after, offer } = drawOffer(deck, rng);
      deck = consumeCard(after, offer[0]); // draw took nothing; the FIT takes one
      fitted.push(offer[0]);
      expect(deck.cards).toHaveLength(start.cards.length - (i + 1));
    }
    // ...and every card removed is exactly one of the fitted lines.
    const before = tally(start.cards);
    for (const [id, n] of tally(deck.cards)) {
      expect(n, id).toBe((before.get(id) ?? 0) - fitted.filter((f) => f === id).length);
    }
  });

  it('a single-copy line, once fitted, can NEVER be drawn again (the cap is exact)', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    expect(BOON_CATALOG.torpedoHoming.copies).toBe(1);
    let deck = consumeCard(start, 'torpedoHoming');
    const rng = mulberry32(77);
    for (let i = 0; i < 200; i += 1) {
      const r = drawOffer(deck, rng);
      expect(r.offer).not.toContain('torpedoHoming');
      deck = r.deck;
    }
  });
});

describe('consumeAcquisition — subdeck shuffle-in + total purge (amendment 38)', () => {
  it('R filled with mine: mine subdeck joins, EVERY acquisition card purges', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const after = consumeAcquisition(start, BOON_CATALOG, 'mine');
    expect(categoryCount(after.cards, 'mines')).toBe(17); // the full mine subdeck
    expect(after.cards.some((id) => isAcquisitionDef(BOON_CATALOG[id]))).toBe(false); // R is permanent
    // Everything else untouched.
    expect(categoryCount(after.cards, 'torpedoes')).toBe(12);
    expect(categoryCount(after.cards, 'guns')).toBe(8);
    expect(after.levelsSinceRare).toBe(start.levelsSinceRare);
  });

  it('the acquired equipment can never be acquired again (its card purged with the rest)', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const after = consumeAcquisition(start, BOON_CATALOG, 'cannon');
    expect(after.cards).not.toContain('acquireCannon');
    expect(after.cards).not.toContain('acquireMine');
    expect(categoryCount(after.cards, 'cannon')).toBe(7); // 5 commons + 2 exclusives (FRAGMENTATION CASING deleted)
  });
});

// scrubAcquisitions (amendment 43) and its four pins were RETIRED by the
// lazy-draw bugfix, not adapted: the function cleaned dead acquisition cards
// out of OTHER banked offers, and only the FRONT offer is ever materialized
// now — a stale acquisition card is unreachable by construction. The surviving
// obligation (a purged deck never OFFERS an acquisition again) is a
// consumeAcquisition + drawOffer property, pinned here.
describe('after an acquisition pick the deck never offers another one', () => {
  it('drawOffer against a purged deck never yields an acquisition line', () => {
    const purged = consumeAcquisition(buildDeck(BOON_CATALOG, CARRIED.torpedoBoat), BOON_CATALOG, 'mine');
    for (let seed = 0; seed < 40; seed += 1) {
      const { offer } = drawOffer(purged, mulberry32(seed));
      expect(offer.some((id: BoonId) => isAcquisitionDef(BOON_CATALOG[id]))).toBe(false);
    }
  });
});

describe('full-economy replay — the deck plays out clean (property)', () => {
  /** Play a whole match economy the way the server now does: draw (taking
   *  nothing), consume ONLY the picked card; on an acquisition pick, purge. */
  function playEconomy(seed: number): { picks: BoonId[]; drawn: BoonId[]; drawsUntilEmpty: number } {
    const rng = mulberry32(seed);
    let deck = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const picks: BoonId[] = [];
    const drawn: BoonId[] = [];
    let draws = 0;
    for (; draws < 500; draws += 1) {
      const r = drawOffer(deck, rng);
      if (r.offer.length === 0) break; // empty deck: level materializes nothing
      drawn.push(...r.offer);
      const chosen = r.offer[0];
      picks.push(chosen);
      deck = consumeCard(r.deck, chosen); // ONLY the fitted card leaves
      const chosenDef = BOON_CATALOG[chosen];
      if (isAcquisitionDef(chosenDef) && chosenDef.effects[0].kind === 'slotFill') {
        deck = consumeAcquisition(deck, BOON_CATALOG, chosenDef.effects[0].equipmentId);
      }
    }
    expect(deck.cards).toHaveLength(0); // fully played out
    // One card left the deck per pick — the deck thins by exactly the fits.
    expect(picks).toHaveLength(draws);
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
