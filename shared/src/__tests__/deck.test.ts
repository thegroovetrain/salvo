// THE DECK MODEL engine (Story 2.8, amendment 38) — sim/deck.ts. Pins:
// (1) buildDeck composition per hull loadout (universal intel/ship/guns +
// carried-equipment subdecks + one acquisition per NOT-carried equipment,
// copies per catalog — the TB 8/15/15 + 12 + 5 + 4 matrix after the
// 2026-08-04 global-cooldown thinning, with shipCooldown widened to ×5);
// (2) drawOffer distinctness / weighting / determinism / rare escalation +
// reset / empty-and-thin-deck fail-safety — and, since the lazy-draw bugfix,
// that a draw is NON-CONSUMING (the pool is only READ); (3) consumeCard (the
// fit — the deck's ONLY outflow, and since Story 7-5 wave 2 the only flow at
// all) / consumeAcquisition purge semantics; (4) a
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
  type BoonCatalog,
  type BoonDef,
  type BoonId,
  type DeckState,
  type EquipmentId,
} from '../index.js';

/** The carried equipment per hull (the loadoutFor fits, sans empty slot). */
const CARRIED: Record<'torpedoBoat' | 'battleship' | 'mineLayer', readonly EquipmentId[]> = {
  torpedoBoat: ['gun', 'torpedo', 'speedBoost'],
  battleship: ['gun', 'broadside', 'starShells'],
  mineLayer: ['gun', 'mine', 'radarBuoy'],
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
  // EVERY DECK GOT SMALLER (Story 7-5 wave 1): Eric's rewrite trades long
  // ladders of small steps for short ladders of big ones, so a hull now draws
  // 40-42 cards rather than 53-58. The composition RULE is unchanged — three
  // universal subdecks + the carried equipment's subdecks + one acquisition per
  // un-carried equipment — and these pins are the same pins at the new counts.
  it('Torpedo Boat: universal (guns 3, intel 9, ship 13) + torpedo 6 + boost 6 + 4 acquisitions = 41', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    expect(categoryCount(deck.cards, 'guns')).toBe(3); // 2 barrel + 1 turret (HEAVY SHELLS deleted)
    expect(categoryCount(deck.cards, 'intel')).toBe(9); // 4 intelRange + 5 intelSweep
    expect(categoryCount(deck.cards, 'ship')).toBe(13); // 4 speed + 4 hull + 5 cooldown
    expect(categoryCount(deck.cards, 'torpedoes')).toBe(6); // 4 speed + 1 tube + 1 homing
    expect(categoryCount(deck.cards, 'speedBoost')).toBe(6); // 4 duration + 2 speed (boostMax split)
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBroadside', 'acquireMine', 'acquireRadarBuoy', 'acquireStarShells']);
    expect(deck.cards).toHaveLength(41);
    expect(deck.levelsSinceRare).toBe(0);
  });

  it('Battleship: broadside + starShells subdecks; torpedo/mine/buoy/boost acquisitions', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.battleship);
    expect(categoryCount(deck.cards, 'broadside')).toBe(6); // 4 spread + 2 turrets
    expect(categoryCount(deck.cards, 'starShells')).toBe(6); // 4 duration + phosphor + dazzle
    expect(categoryCount(deck.cards, 'torpedoes')).toBe(0);
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBoost', 'acquireMine', 'acquireRadarBuoy', 'acquireTorpedo']);
    expect(deck.cards).toHaveLength(3 + 9 + 13 + 6 + 6 + 4); // 41
  });

  it('Mine Layer: mines + radarBuoy subdecks; torpedo/broadside/star/boost acquisitions', () => {
    const deck = buildDeck(BOON_CATALOG, CARRIED.mineLayer);
    expect(categoryCount(deck.cards, 'mines')).toBe(6); // 4 blast + propFouling + captive
    expect(categoryCount(deck.cards, 'radarBuoy')).toBe(6); // 4 sweep + gun + jamming
    const acquisitions = deck.cards.filter((id) => isAcquisitionDef(BOON_CATALOG[id]));
    expect(acquisitions.sort()).toEqual(['acquireBoost', 'acquireBroadside', 'acquireStarShells', 'acquireTorpedo']);
    expect(deck.cards).toHaveLength(3 + 9 + 13 + 6 + 6 + 4); // 41
  });

  // THE FINAL DECK ARITHMETIC (Story 7-5 wave 2), asserted BY EXECUTION over
  // every hull rather than by three hand-written sums: 25 universal + 6 + 6
  // subdeck + 4 acquisitions = 41, the same on all three. Wave 2 is the first
  // time the three decks are the SAME SIZE — the cannon's 7 and the decoy's 5
  // were the two odd ones out.
  it('EVERY hull deck is exactly 41 cards, and the three are now equal', () => {
    const sizes = (['torpedoBoat', 'battleship', 'mineLayer'] as const).map(
      (cls) => buildDeck(BOON_CATALOG, CARRIED[cls]).cards.length,
    );
    expect(sizes).toEqual([41, 41, 41]);
  });

  it('the 7 deleted reload lines are in NO hull deck; ship contributes 13 (Eric rulings 2026-08-04)', () => {
    const dead = ['gunReload', 'cannonReload', 'torpedoReload', 'mineReload', 'boostReload', 'starReload', 'decoyReload'];
    const wave2Gone = ['cannonDamage', 'cannonArcing', 'cannonAp', 'decoyDuration', 'mineSelfPropelled'];
    for (const id of wave2Gone) expect(BOON_CATALOG[id], id).toBeUndefined();
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const deck = buildDeck(BOON_CATALOG, CARRIED[cls]);
      for (const id of dead) expect(deck.cards, `${cls}:${id}`).not.toContain(id);
      // The one global cooldown line replaces them, in the UNIVERSAL ship
      // subdeck — every hull draws it: 4 shipSpeed + 4 shipHull + 5 shipCooldown
      // (the two hull/speed ladders went ×5 → ×4 in Story 7-5 wave 1).
      expect(categoryCount(deck.cards, 'ship'), cls).toBe(13);
      expect(tally(deck.cards).get('shipCooldown'), cls).toBe(5);
    }
  });

  // Wave 1 deleted SEVEN lines outright. Their ids ride the wire, so proving
  // they are unreachable in every deck is the deck-side half of the fail-closed
  // guarantee the PV bump exists to back up.
  it('the 7 lines Story 7-5 wave 1 DELETED are in no hull deck and not in the catalog', () => {
    const gone = ['gunDamage', 'torpedoDamage', 'torpedoCommand', 'mineDamage', 'mineMax', 'starRadius', 'boostMax'];
    for (const id of gone) expect(BOON_CATALOG[id], id).toBeUndefined();
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const deck = buildDeck(BOON_CATALOG, CARRIED[cls]);
      for (const id of gone) expect(deck.cards, `${cls}:${id}`).not.toContain(id);
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

// RETIRED, the whole describe block (Story 7-5 wave 2, R2.6): 'returnCards —
// the doctrine swap-out give-back' (2 tests). `returnCards` existed for exactly
// one caller — the exclusive-doctrine SWAP-OUT, which handed the rival card back
// to the deck — and the exclusivity mechanism died with the cannon pair that was
// its last user. The deck now has NO inflow at all, which is a stronger property
// than the round-trip these tests pinned, and it is pinned in its place below.

describe('the deck has no inflow — cards only ever LEAVE (Story 7-5 wave 2)', () => {
  it('no exported deck function grows a deck: draw reads, fit removes, acquire swaps a purge for a subdeck', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    // A draw is READ-ONLY (the lazy-draw law).
    expect(drawOffer(start, mulberry32(7)).deck.cards).toEqual(start.cards);
    // A fit is the one and only outflow, and it is strictly monotone.
    const fitted = consumeCard(start, 'torpedoHoming');
    expect(fitted.cards).toHaveLength(start.cards.length - 1);
    expect(tally(fitted.cards).get('torpedoHoming') ?? 0).toBe(0);
    // ...and nothing puts it back: there is no give-back path to call.
    expect(consumeCard(fitted, 'torpedoHoming')).toBe(fitted); // no copy left: same reference
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
    expect(categoryCount(after.cards, 'mines')).toBe(6); // the full mine subdeck
    expect(after.cards.some((id) => isAcquisitionDef(BOON_CATALOG[id]))).toBe(false); // R is permanent
    // Everything else untouched.
    expect(categoryCount(after.cards, 'torpedoes')).toBe(6);
    expect(categoryCount(after.cards, 'guns')).toBe(3);
    expect(after.levelsSinceRare).toBe(start.levelsSinceRare);
  });

  it('the acquired equipment can never be acquired again (its card purged with the rest)', () => {
    const start = buildDeck(BOON_CATALOG, CARRIED.torpedoBoat);
    const after = consumeAcquisition(start, BOON_CATALOG, 'broadside');
    expect(after.cards).not.toContain('acquireBroadside');
    expect(after.cards).not.toContain('acquireMine');
    expect(categoryCount(after.cards, 'broadside')).toBe(6); // 4 spread + 2 turrets
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

  // NO PAIRS LEFT (Story 7-5 wave 2). The cannon pair was the last one and it
  // died with the weapon, so "rivals" is not a category any more. The two
  // properties below were never about rivalry though — they are about DECK
  // behaviour around 1-COPY DOCTRINE LINES — so they are kept and re-pointed at
  // the ones a Torpedo Boat's deck actually holds.
  const DOCTRINE_LINES = ['torpedoHoming'] as const;

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
  // construction and unfalsifiable. What the ENGINE owes is copy scarcity per
  // doctrine line, and since Story 7-5 wave 2 that is the WHOLE story: mutual
  // exclusion used to be the SERVER's job (the applyBoon doctrine swap) and no
  // longer exists anywhere, because every doctrine card is a stackable verb.
  it('a doctrine line may be OFFERED many times but PICKED at most `copies` (=1) — the only cap is scarcity', () => {
    for (const seed of [1, 42, 1337]) {
      const { picks, drawn } = playEconomy(seed);
      const pickCounts = tally(picks);
      const drawnCounts = tally(drawn);
      for (const id of DOCTRINE_LINES) {
        expect(BOON_CATALOG[id].copies, id).toBe(1); // the scarcity the pin rests on
        // Consuming a card is the ONLY thing that removes it for good: an
        // unchosen doctrine stays in the pool and can be offered again...
        expect(drawnCounts.get(id) ?? 0).toBeGreaterThanOrEqual(pickCounts.get(id) ?? 0);
        // ...but a PICKED one is gone — never a second copy in one replay.
        expect(pickCounts.get(id) ?? 0, `seed ${seed}: ${id}`).toBeLessThanOrEqual(BOON_CATALOG[id].copies);
      }
    }
  });

  it('every 1-copy doctrine line is genuinely reachable across replays (the engine imposes no exclusion)', () => {
    const seen = new Set<BoonId>();
    for (let seed = 0; seed < 40; seed += 1) for (const id of playEconomy(seed).drawn) seen.add(id);
    for (const id of DOCTRINE_LINES) expect(seen.has(id), `${id} never drawable`).toBe(true);
  });

  it('the same seed replays the identical economy (server-side reproducibility)', () => {
    expect(playEconomy(99)).toEqual(playEconomy(99));
  });
});
