// THE DECK MODEL engine (Story 2.8, amendment 38; re-cut for catalog v3 in
// Story 8.1; fed by the frozen default decks since Story 8.2) — sim/deck.ts.
// Pins:
//   (1) buildDeckState (Story 8.2, Eric rulings 2026-09-15, amendments 10-11):
//       the frozen 40-card list MINUS every stub line MINUS one copy per
//       carried line — 23 drawable cards for each of the three default decks
//       with its spawn seed, and NO STUB EVER DEALT, so no stub id can reach
//       an offer;
//   (2) drawOffer distinctness / weight-by-copies-remaining / determinism /
//       empty-and-thin-deck fail-safety, and that a draw is NON-CONSUMING;
//   (3) consumeCard — the FIT, the deck's one and only outflow;
//   (4) a full-economy replay property with NO PITY anywhere in it: no line
//       ever exceeds its copy count, the deck visibly thins, same seed = same
//       economy;
//   (5) the AT-CAP GUARD (Story 8.3): `drawOffer(..., { held })` never offers a
//       line the SHIP already holds at `cap`, spends no rng value on it, and is
//       byte-identical to the unguarded draw when `held` is absent or empty —
//       plus the STRUCTURAL PIN that a legal default deck and its spawn seed
//       can never trip the guard in the first place.
//
// RETIRED with rarity (Story 8.1): the per-hull subdeck composition matrix,
// `consumeAcquisition` and the acquisition purge, and the soft-pity escalation
// (`levelsSinceRare`, CONFIG.deck.rareWeight*). Catalog v3 has no rarity tier
// to escalate and no acquisition card to purge. RETIRED in Story 8.2: the
// interim all-lines-at-cap builder — the pool is now built from whatever list
// the door froze.
//
// "Drones never get a deck" is a SERVER rule: buildDeckState is hull-agnostic
// by design (it takes whatever list the door froze), so that pin lives
// server-side.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_DECKS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  buildDeckState,
  catalogCardCount,
  consumeCard,
  drawOffer,
  effectiveStats,
  hullEnvelope,
  isStubLine,
  SPAWN_SEED,
  mulberry32,
  type Catalog,
  type CatalogLine,
  type DeckState,
  type LineId,
  type Rng,
  type ShipClassId,
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

/** THE SPAWN SEED per hull (Story 8.1 review gate): copy 1 of every equipment
 *  line whose weapon the hull already carries. The Battleship's `broadside` is
 *  carried but NOT in its default deck, so it removes nothing. */
const CARRIED: Record<ShipClassId, readonly LineId[]> = {
  torpedoBoat: ['heavyTorpedo'],
  battleship: ['broadside', 'starShells'],
  mineLayer: ['navalMines'],
};

/** A hull's drawable pool: its default deck less stubs less its seed. */
const poolFor = (hull: ShipClassId): DeckState => buildDeckState(DEFAULT_DECKS[hull], CARRIED[hull]);

/** The Torpedo Boat's pool — the fixture the draw/consume/replay pins use. */
const tbPool = (): DeckState => poolFor('torpedoBoat');

describe('buildDeckState — the frozen list becomes the drawable pool (Story 8.2)', () => {
  it('deals every NON-STUB card of the list, in list order, and no stub', () => {
    const deck = buildDeckState(DEFAULT_DECKS.torpedoBoat);
    const counts = tally(deck.cards);
    const listed = tally(DEFAULT_DECKS.torpedoBoat);
    for (const id of LINE_IDS) {
      expect(counts.get(id) ?? 0, id).toBe(isStubLine(id) ? 0 : (listed.get(id) ?? 0));
    }
    // List order is preserved (the defaults are authored in LINE_IDS order).
    expect(deck.cards).toEqual(DEFAULT_DECKS.torpedoBoat.filter((id) => !isStubLine(id)));
  });

  it('NEVER deals a stub — the one place "authored but unbuilt" becomes "unofferable"', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const dealt = new Set(poolFor(hull).cards);
      for (const id of dealt) expect(isStubLine(id), `${hull}:${id}`).toBe(false);
    }
    expect(NON_STUB).toHaveLength(16);
  });

  // THE DRAWABLE-SIZE TABLE (spec Design Notes): each default holds 16 stub
  // cards (hullRepair 3 + shieldBlock 3 + smokeScreen 2 + chaff 2 + two stub
  // weapon lines × 3) and the seed removes one copy → 40 − 16 − 1 = 23.
  it.each([
    ['torpedoBoat', 16, 23],
    ['mineLayer', 16, 23],
    ['battleship', 16, 23],
  ] as const)('%s: 40 cards − %i stub cards − 1 carried copy = %i drawable', (hull, stubs, drawable) => {
    const list = DEFAULT_DECKS[hull];
    expect(list).toHaveLength(CONFIG.deck.size);
    expect(list.filter((id) => isStubLine(id))).toHaveLength(stubs);
    expect(poolFor(hull).cards).toHaveLength(drawable);
    // ...and the stubs are still IN THE FROZEN LIST (amendment 11): the deck
    // is the real deck; only the pool is short of them.
    expect(new Set(list).size).toBeGreaterThan(new Set(poolFor(hull).cards).size);
  });

  it('removes ONE copy of each CARRIED line (the hull already holds copy 1)', () => {
    const deck = buildDeckState(DEFAULT_DECKS.torpedoBoat, ['heavyTorpedo']);
    expect(tally(deck.cards).get('heavyTorpedo')).toBe(2); // 3 in the deck, 1 held
    // ...every OTHER line is untouched.
    const bare = tally(buildDeckState(DEFAULT_DECKS.torpedoBoat).cards);
    for (const [id, n] of tally(deck.cards)) {
      if (id === 'heavyTorpedo') continue;
      expect(n, id).toBe(bare.get(id));
    }
  });

  it('ignores a carried line the list holds no copy of (stub, absent, junk) and removes one per repeat', () => {
    const size = buildDeckState(DEFAULT_DECKS.torpedoBoat).cards.length;
    expect(buildDeckState(DEFAULT_DECKS.torpedoBoat, ['lightTorpedo']).cards).toHaveLength(size); // stub: never dealt
    expect(buildDeckState(DEFAULT_DECKS.torpedoBoat, ['broadside']).cards).toHaveLength(size); // not in the deck
    expect(buildDeckState(DEFAULT_DECKS.torpedoBoat, ['nope' as LineId]).cards).toHaveLength(size);
    expect(buildDeckState(DEFAULT_DECKS.torpedoBoat, ['heavyTorpedo', 'heavyTorpedo']).cards).toHaveLength(size - 2);
    // Never negative: more carried than dealt removes what there is.
    const four: LineId[] = ['heavyTorpedo', 'heavyTorpedo', 'heavyTorpedo', 'heavyTorpedo'];
    const over = buildDeckState(DEFAULT_DECKS.torpedoBoat, four);
    expect(tally(over.cards).get('heavyTorpedo')).toBeUndefined();
    expect(over.cards).toHaveLength(size - 3);
  });

  it('drops an id the catalog does not know (fail-closed: nothing drawable rides an unknown id)', () => {
    const deck = buildDeckState(['armor', 'junk', 'constructor', 'armor'] as unknown as LineId[]);
    expect(deck.cards).toEqual(['armor', 'armor']);
  });

  it('takes an injected catalog and honours `stub` in it', () => {
    const cat = catalogOf([testLine('a', 2), testLine('b', 3, true), testLine('c', 1)]);
    const deck = buildDeckState(['a', 'b', 'a', 'c', 'b'] as unknown as LineId[], [], cat);
    expect(deck.cards).toEqual(['a', 'a', 'c']);
  });

  it('is pure: the same inputs give an equal pool and the input list is untouched', () => {
    const list = [...DEFAULT_DECKS.mineLayer];
    expect(buildDeckState(list, ['navalMines'])).toEqual(buildDeckState(list, ['navalMines']));
    expect(list).toEqual([...DEFAULT_DECKS.mineLayer]);
    expect(Object.isFrozen(DEFAULT_DECKS.mineLayer)).toBe(true);
  });

  it('CONFIG.deck carries the AUTHORED-deck rules and nothing pity-shaped', () => {
    expect(CONFIG.deck).toEqual({ size: 40, maxEquipmentLines: 3 });
    expect('rareWeightBase' in CONFIG.deck).toBe(false);
    expect('rareWeightPerDryLevel' in CONFIG.deck).toBe(false);
    // The 114-card catalog is what the three 40-card decks draw on.
    expect(catalogCardCount()).toBe(114);
  });
});

describe('drawOffer — distinct lines, weight by copies remaining, determinism', () => {
  const rng = () => mulberry32(12345);

  it('draws CONFIG.offer.size DIFFERENT lines and takes NOTHING out of the pool', () => {
    const deck = tbPool();
    const { deck: after, offer } = drawOffer(deck, rng());
    expect(offer).toHaveLength(CONFIG.offer.size);
    expect(new Set(offer).size).toBe(offer.length);
    expect(after.cards).toEqual(deck.cards); // a draw is a READ
  });

  it('never offers a STUB line, over many draws, from any default deck', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const deck = poolFor(hull);
      const stream = mulberry32(99);
      for (let i = 0; i < 400; i += 1) {
        for (const id of drawOffer(deck, stream).offer) expect(isStubLine(id), `${hull}:${id}`).toBe(false);
      }
    }
  });

  it('is deterministic: the same rng seed yields the same offer', () => {
    const deck = tbPool();
    expect(drawOffer(deck, rng()).offer).toEqual(drawOffer(deck, rng()).offer);
  });

  it('advances the stream: consecutive draws off ONE rng are not all identical', () => {
    const deck = tbPool();
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

// A POOL WITH ONE `armor` COPY LEFT and exactly four other lines — so a healthy
// hand is still four cards once `armor` is guarded out.
const ARMOR_POOL: DeckState = {
  cards: ['armor', 'speed', 'speed', 'turning', 'turning', 'reload', 'reload', 'radarSweep'],
};

/** `held` at `armor`'s REAL cap, read from the catalog rather than written as a
 *  literal (it is 4 today; the pin must not rot when a tier is added). */
const armorAtCap = (): LineId[] => new Array<LineId>(CATALOG.armor.cap).fill('armor');

/** A mulberry32 that counts how many times the draw reached for a value. */
function countingRng(seed: number): { rng: Rng; calls: () => number } {
  const inner = mulberry32(seed);
  let n = 0;
  const rng: Rng = {
    next: () => {
      n += 1;
      return inner.next();
    },
    float: (min, max) => inner.float(min, max),
    int: (min, max) => inner.int(min, max),
    pick: (arr) => inner.pick(arr),
  };
  return { rng, calls: () => n };
}

describe('drawOffer — the AT-CAP guard (Story 8.3): a dead pick is never offered', () => {
  it('never offers a line the SHIP holds at cap, over 200 seeds, and takes nothing out of the pool', () => {
    const held = armorAtCap();
    for (let seed = 0; seed < 200; seed += 1) {
      const { deck, offer } = drawOffer(ARMOR_POOL, mulberry32(seed), CATALOG, { held });
      expect(offer, `seed ${seed}`).not.toContain('armor');
      expect(offer, `seed ${seed}`).toHaveLength(CONFIG.offer.size); // the other lines still fill the hand
      expect(new Set(offer).size, `seed ${seed}`).toBe(offer.length);
      expect(deck, `seed ${seed}`).toBe(ARMOR_POOL); // a draw is a READ — same reference
    }
    expect(tally(ARMOR_POOL.cards).get('armor')).toBe(1); // the copy is still sitting in the pool
    // ...and the guard is doing real work: UNGUARDED, that copy does get offered.
    const unguarded = Array.from({ length: 200 }, (_, s) => drawOffer(ARMOR_POOL, mulberry32(s), CATALOG).offer);
    expect(unguarded.some((offer) => offer.includes('armor'))).toBe(true);
  });

  it('a line held BELOW its cap is still offered (the rule is ≥ cap, not "held at all")', () => {
    const held: LineId[] = new Array<LineId>(CATALOG.armor.cap - 1).fill('armor');
    const offers = Array.from(
      { length: 200 },
      (_, s) => drawOffer(ARMOR_POOL, mulberry32(s), CATALOG, { held }).offer,
    );
    expect(offers.some((offer) => offer.includes('armor'))).toBe(true);
  });

  it('an at-cap line costs ZERO rng values — exactly one next() per OFFERED line', () => {
    const two: DeckState = { cards: ['armor', 'speed', 'speed'] };
    const open = countingRng(5);
    expect(drawOffer(two, open.rng, CATALOG).offer).toHaveLength(2);
    expect(open.calls()).toBe(2);
    const guarded = countingRng(5);
    expect(drawOffer(two, guarded.rng, CATALOG, { held: armorAtCap() }).offer).toEqual(['speed']);
    expect(guarded.calls()).toBe(1); // the excluded line never reached the wheel
  });

  it('`held` ORDER is irrelevant, and the same seed gives the identical offer', () => {
    const pool: DeckState = { cards: ['armor', 'armor', 'speed', 'speed', 'turning', 'reload', 'reload'] };
    const held: LineId[] = ['speed', 'reload', 'speed', 'speed', 'reload', 'speed']; // speed ×4 = cap
    const shuffled: LineId[] = ['reload', 'speed', 'speed', 'reload', 'speed', 'speed'];
    const offer = drawOffer(pool, mulberry32(4242), CATALOG, { held }).offer;
    expect(offer).not.toContain('speed');
    expect(offer).toContain('reload'); // reload at 2 of cap 5 is untouched by the guard
    expect(drawOffer(pool, mulberry32(4242), CATALOG, { held: shuffled }).offer).toEqual(offer);
    expect(drawOffer(pool, mulberry32(4242), CATALOG, { held }).offer).toEqual(offer);
  });

  it('an id the catalog does not know is IGNORED in `held` — no throw, no effect', () => {
    const junk = ['nope', 'constructor', '__proto__'] as unknown as LineId[];
    const base = drawOffer(ARMOR_POOL, mulberry32(11), CATALOG).offer;
    expect(drawOffer(ARMOR_POOL, mulberry32(11), CATALOG, { held: junk }).offer).toEqual(base);
    expect(drawOffer(ARMOR_POOL, mulberry32(11), CATALOG, { held: [...junk, ...armorAtCap()] }).offer)
      .not.toContain('armor');
  });

  it('no `held` at all, `{}` and an EMPTY `held` draw byte-identically (every existing caller unchanged)', () => {
    const deck = tbPool();
    const base = drawOffer(deck, mulberry32(8), CATALOG).offer;
    expect(drawOffer(deck, mulberry32(8), CATALOG, {}).offer).toEqual(base);
    expect(drawOffer(deck, mulberry32(8), CATALOG, { held: [] }).offer).toEqual(base);
    // ...and so does the STREAM POSITION: one next() per offered line either way.
    const bare = countingRng(8);
    drawOffer(deck, bare.rng, CATALOG);
    const empty = countingRng(8);
    drawOffer(deck, empty.rng, CATALOG, { held: [] });
    expect(empty.calls()).toBe(bare.calls());
    expect(bare.calls()).toBe(CONFIG.offer.size);
  });
});

describe('the at-cap guard is structurally IDLE on a legal deck (Story 8.3 pin)', () => {
  /** The spawn seed the way the SERVER now derives it (Story 8.5): the AUTHORED
   *  `SPAWN_SEED` table, not a read-back of the fitted loadout. The loadout is
   *  hull-agnostic since 8.5 (gun + boost + seven empties), so there is no
   *  per-hull fit left to derive a seed from — World.carriedLines is gone and
   *  this table is the one source. Story 8.10 deletes it. */
  function carriedFor(hull: ShipClassId): readonly LineId[] {
    return SPAWN_SEED[hull] ?? [];
  }

  it('the CARRIED table above is the seed the server actually deals', () => {
    for (const hull of SHIP_CLASS_IDS) {
      expect([...carriedFor(hull)].sort(), hull).toEqual([...CARRIED[hull]].sort());
    }
  });

  it('the seed is STAT-NEUTRAL: holding it changes no effective stat on any hull', () => {
    // Why the seed needs no `applyCard`, no event and no toast: tier I of an
    // equipment line IS the bare weapon, so the seeded captain's numbers are
    // byte-identical to an unseeded one's.
    for (const hull of SHIP_CLASS_IDS) {
      expect(effectiveStats(hullEnvelope(hull), carriedFor(hull)), hull)
        .toEqual(effectiveStats(hullEnvelope(hull)));
    }
  });

  it('pool copies + held copies ≤ cap for EVERY line of EVERY hull at spawn — the guard can never bite', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const carried = carriedFor(hull);
      const pool = tally(buildDeckState(DEFAULT_DECKS[hull], carried).cards);
      const held = tally(carried);
      for (const id of LINE_IDS) {
        const total = (pool.get(id) ?? 0) + (held.get(id) ?? 0);
        expect(total, `${hull}:${id}`).toBeLessThanOrEqual(CATALOG[id].cap);
      }
    }
  });

  it('a spawn draw with `held = carried` is identical to one with no `held`, over 100 seeds and all three hulls', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const carried = carriedFor(hull);
      const deck = buildDeckState(DEFAULT_DECKS[hull], carried);
      for (let seed = 0; seed < 100; seed += 1) {
        const guarded = drawOffer(deck, mulberry32(seed), CATALOG, { held: carried }).offer;
        expect(guarded, `${hull}:${seed}`).toEqual(drawOffer(deck, mulberry32(seed), CATALOG).offer);
      }
    }
  });
});

describe('the deck has no inflow — cards only ever LEAVE', () => {
  it('a draw never grows the pool and a fit shrinks it by exactly one', () => {
    let deck = tbPool();
    const start = deck.cards.length;
    deck = drawOffer(deck, mulberry32(1)).deck;
    expect(deck.cards).toHaveLength(start);
    deck = consumeCard(deck, 'armor');
    expect(deck.cards).toHaveLength(start - 1);
  });
});

describe("consumeCard — the FIT, the deck's one and only outflow", () => {
  it('removes exactly ONE copy', () => {
    const deck = tbPool();
    const before = tally(deck.cards).get('armor') ?? 0;
    expect(before).toBe(3); // amendment 10: armor ×3 in every default
    const after = consumeCard(deck, 'armor');
    expect(tally(after.cards).get('armor')).toBe(before - 1);
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
    let deck = tbPool();
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
    let deck = tbPool();
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
      expect(picks.length, `${seed}`).toBe(23); // the whole drawable pool plays out
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
