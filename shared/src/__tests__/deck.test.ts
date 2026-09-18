// THE DECK MODEL engine (Story 2.8, amendment 38; re-cut for catalog v3 in
// Story 8.1; fed by the frozen default decks since Story 8.2) — sim/deck.ts.
// Pins:
//   (1) buildDeckState (Story 8.2, Eric rulings 2026-09-15, amendments 10-11):
//       the frozen 40-card list MINUS every stub line MINUS one copy per
//       carried line — 27 drawable cards for each of the three default decks
//       now that NOTHING is carried (Story 8.10 deleted the spawn seed, so the
//       server builds every pool with `carried = []`), and NO STUB EVER DEALT,
//       so no stub id can reach an offer;
//   (2) drawOffer distinctness / weight-by-copies-remaining / determinism /
//       empty-and-thin-deck fail-safety, and that a draw is NON-CONSUMING;
//   (3) consumeCard — the FIT, the deck's one and only outflow;
//   (4) a full-economy replay property with NO PITY anywhere in it: no line
//       ever exceeds its copy count, the deck visibly thins, same seed = same
//       economy;
//   (5) the AT-CAP GUARD (Story 8.3): `drawOffer(..., { held })` never offers a
//       line the SHIP already holds at `cap`, spends no rng value on it, and is
//       byte-identical to the unguarded draw when `held` is absent or empty —
//       plus the STRUCTURAL PIN that the AUTHORED deck alone can never trip the
//       guard at spawn, where the captain holds no cards at all, AND (Story
//       8.11) that the appended match pool DOES: authored + pool copies run a
//       line past its cap, and the copies beyond it are dead by design (R44) —
//       a ship holding `cap` copies is never offered the line again;
//   (6) THE LEVEL-ZERO GUARANTEE (Story 8.10, FR48): `{ guarantee: true }` puts
//       a USABLE card (a consumable, or the tier I of an equipment line the
//       ship has none of) in slot 0, costs exactly one rng.next() like any
//       other offered line, is deterministic, and is VACUOUS — byte-identical
//       to the plain draw, stream position included — when the pool holds
//       nothing usable. That last pin is what keeps the guarantee from ever
//       becoming a reroll.
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
  mulberry32,
  usableLines,
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

/** A hull's drawable pool AS THE SERVER BUILDS IT since Story 8.10: its default
 *  deck less stubs, and nothing carried — every hull spawns with the gun and
 *  the Shift boost only, so no copy is owed to a weapon already aboard. */
const poolFor = (hull: ShipClassId): DeckState => buildDeckState(DEFAULT_DECKS[hull]);

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
    expect(NON_STUB).toHaveLength(17); // 16 until Story 8.8 flipped hullRepair live
  });

  // THE DRAWABLE-SIZE TABLE (spec Design Notes): each default holds 13 stub
  // cards (shieldBlock 3 + smokeScreen 2 + chaff 2 + two stub weapon lines × 3)
  // and NOTHING is carried out of it → 40 − 13 = 27. It was 26 while the
  // interim spawn seed took one equipment copy out at spawn (Story 8.10
  // deleted that table), and 23 until Story 8.8 flipped HULL REPAIR live.
  it.each([
    ['torpedoBoat', 13, 27],
    ['mineLayer', 13, 27],
    ['battleship', 13, 27],
  ] as const)('%s: 40 cards − %i stub cards − 0 carried copies = %i drawable', (hull, stubs, drawable) => {
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

describe('drawOffer — THE LEVEL-ZERO GUARANTEE (Story 8.10): the opening hand can be sailed', () => {
  /** Is this line something a BARE hull could actually put to sea with? */
  const isUsableKind = (id: LineId, held: readonly LineId[]): boolean =>
    CATALOG[id].kind === 'consumable'
    || (CATALOG[id].kind === 'equipment' && !held.includes(id));

  it('usableLines is exactly the consumables + the UNFITTED equipment lines of the pool, in CATALOG order', () => {
    const deck = tbPool();
    const usable = usableLines(deck, []);
    expect(usable.length).toBeGreaterThan(0);
    for (const id of usable) expect(isUsableKind(id, []), id).toBe(true);
    // Distinct, and in CATALOG key order — that order is what makes the
    // uniform first pick reproducible.
    expect([...new Set(usable)]).toEqual(usable);
    expect(usable).toEqual(LINE_IDS.filter((id) => usable.includes(id)));
    // ...and it leaves nothing out: every consumable/equipment line in the pool.
    const inPool = LINE_IDS.filter((id) => deck.cards.includes(id) && isUsableKind(id, []));
    expect(usable).toEqual(inPool);
    // A ladder or an add-on is never usable — a stat step is not a first weapon.
    for (const id of LINE_IDS) {
      if (CATALOG[id].kind === 'ladder' || CATALOG[id].kind === 'addon') expect(usable).not.toContain(id);
    }
  });

  it('a line held AT CAP is never usable (it is not offerable at all)', () => {
    const deck = tbPool();
    const held = new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair');
    expect(usableLines(deck, [])).toContain('hullRepair'); // the consumable IS usable bare...
    expect(usableLines(deck, held)).not.toContain('hullRepair'); // ...and gone once the rack is capped
  });

  it('the FIRST card of a guaranteed draw is USABLE, over 200 seeds — four distinct lines, none at cap', () => {
    const deck = tbPool();
    const usable = usableLines(deck, []);
    for (let seed = 0; seed < 200; seed += 1) {
      const { offer } = drawOffer(deck, mulberry32(seed), CATALOG, { guarantee: true, held: [] });
      expect(usable, `seed ${seed}`).toContain(offer[0]);
      expect(offer, `seed ${seed}`).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer).size, `seed ${seed}`).toBe(offer.length);
      for (const id of offer) expect(CATALOG[id].cap, `seed ${seed}:${id}`).toBeGreaterThan(0);
    }
    // ...and the guarantee is doing real work: UNGUARDED, a ladder-only hand happens.
    const plain = Array.from({ length: 200 }, (_, s) => drawOffer(deck, mulberry32(s), CATALOG).offer);
    expect(plain.some((offer) => !usable.includes(offer[0]))).toBe(true);
  });

  it('never guarantees an equipment line the ship ALREADY HOLDS (its next copy is a tier bump, not a weapon)', () => {
    const deck = tbPool();
    const held: LineId[] = ['heavyTorpedo']; // one live equipment line of the TB deck, fitted
    const usable = usableLines(deck, held);
    expect(usable).not.toContain('heavyTorpedo');
    expect(usableLines(deck, [])).toContain('heavyTorpedo'); // ...it WAS usable while unfitted
    for (let seed = 0; seed < 200; seed += 1) {
      const { offer } = drawOffer(deck, mulberry32(seed), CATALOG, { guarantee: true, held });
      expect(offer[0], `seed ${seed}`).not.toBe('heavyTorpedo');
      expect(usable, `seed ${seed}`).toContain(offer[0]);
    }
  });

  it('IS VACUOUS on a ladders-only deck — same offer AND same stream position as the plain draw (never a reroll)', () => {
    const cat = catalogOf([testLine('l1'), testLine('l2'), testLine('l3'), testLine('l4'), testLine('l5')]);
    const ladders: DeckState = { cards: ['l1', 'l1', 'l2', 'l2', 'l3', 'l4', 'l5'] as unknown as LineId[] };
    expect(usableLines(ladders, [], cat)).toEqual([]);
    for (let seed = 0; seed < 50; seed += 1) {
      const guaranteed = countingRng(seed);
      const plain = countingRng(seed);
      const a = drawOffer(ladders, guaranteed.rng, cat, { guarantee: true });
      const b = drawOffer(ladders, plain.rng, cat);
      expect(a.offer, `seed ${seed}`).toEqual(b.offer);
      expect(guaranteed.calls(), `seed ${seed}`).toBe(plain.calls());
    }
  });

  it('is DETERMINISTIC: the same seed gives the same guaranteed offer', () => {
    const deck = tbPool();
    const once = drawOffer(deck, mulberry32(4242), CATALOG, { guarantee: true }).offer;
    expect(drawOffer(deck, mulberry32(4242), CATALOG, { guarantee: true }).offer).toEqual(once);
    // ...and it is NOT the plain draw off the same seed (the first card moved).
    expect(drawOffer(deck, mulberry32(4242), CATALOG).offer).not.toEqual(once);
  });

  it('costs exactly ONE rng.next() per OFFERED line — the guaranteed card included', () => {
    const deck = tbPool();
    const counted = countingRng(9);
    const { offer } = drawOffer(deck, counted.rng, CATALOG, { guarantee: true });
    expect(offer).toHaveLength(CONFIG.offer.size);
    expect(counted.calls()).toBe(offer.length);
    // A THIN pool spends one per line it could fill, and no more.
    const cat = catalogOf([
      { id: 'w' as unknown as LineId, kind: 'equipment', cap: 5, tiers: [[], [], [], [], []] },
      testLine('l', 2),
    ]);
    const thin: DeckState = { cards: ['w', 'l', 'l'] as unknown as LineId[] };
    const thinCount = countingRng(3);
    const thinOffer = drawOffer(thin, thinCount.rng, cat, { guarantee: true }).offer;
    expect(thinOffer).toHaveLength(2);
    expect(thinOffer[0]).toBe('w' as unknown as LineId); // the only usable line
    expect(thinCount.calls()).toBe(2);
  });

  it('a draw is still a READ: the guaranteed draw takes nothing out of the pool', () => {
    const deck = tbPool();
    const { deck: after } = drawOffer(deck, mulberry32(77), CATALOG, { guarantee: true });
    expect(after).toBe(deck);
  });

  it('the guarantee RESPECTS the at-cap guard: a capped line is neither guaranteed nor offered', () => {
    const held = [...new Array<LineId>(CATALOG.armor.cap).fill('armor'), 'heavyTorpedo' as LineId];
    const deck = tbPool();
    for (let seed = 0; seed < 100; seed += 1) {
      const { offer } = drawOffer(deck, mulberry32(seed), CATALOG, { guarantee: true, held });
      expect(offer, `seed ${seed}`).not.toContain('armor');
    }
  });
});

describe('the at-cap guard: IDLE on the AUTHORED deck (8.3), LIVE once the pool is appended (8.11)', () => {
  /** WHAT A CAPTAIN HOLDS AT SPAWN, since Story 8.10 deleted the interim
   *  spawn-seed table: nothing. The loadout is hull-agnostic (gun + boost +
   *  seven
   *  empties) and the first weapon arrives as a CARD from the level-zero offer,
   *  so there is no seed left to guard against. */
  const SPAWN_HELD: readonly LineId[] = [];

  it('a fresh captain holds NO cards, so spawn stats are the bare hull envelope', () => {
    // What the deleted seed used to have to prove by being stat-neutral: with
    // nothing fitted there is nothing to be neutral about.
    for (const hull of SHIP_CLASS_IDS) {
      expect(effectiveStats(hullEnvelope(hull), SPAWN_HELD), hull)
        .toEqual(effectiveStats(hullEnvelope(hull)));
    }
  });

  it('AUTHORED-DECK pool copies + held copies ≤ cap for EVERY line of EVERY hull at spawn', () => {
    // True of the door-admitted 40 ALONE — and only of them. Story 8.11's match
    // pool is appended AFTER this and deliberately breaks it (next pin).
    for (const hull of SHIP_CLASS_IDS) {
      const pool = tally(buildDeckState(DEFAULT_DECKS[hull], SPAWN_HELD).cards);
      const held = tally(SPAWN_HELD);
      for (const id of LINE_IDS) {
        const total = (pool.get(id) ?? 0) + (held.get(id) ?? 0);
        expect(total, `${hull}:${id}`).toBeLessThanOrEqual(CATALOG[id].cap);
      }
    }
  });

  /** A MATCH POOL as Story 8.11 rolls one — five HULL REPAIR copies is a legal
   *  roll (each line ≤ its own cap WITHIN the pool, R44). */
  const HEAVY_POOL: readonly LineId[] = new Array<LineId>(5).fill('hullRepair');

  it('THE GUARD IS LIVE FROM 8.11: the appended pool pushes a line PAST its cap in the deck', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const deck = buildDeckState([...DEFAULT_DECKS[hull], ...HEAVY_POOL]);
      const copies = tally(deck.cards).get('hullRepair') ?? 0;
      expect(copies, hull).toBe(3 + 5); // 3 authored (amendment 10) + 5 pooled
      expect(copies, hull).toBeGreaterThan(CATALOG.hullRepair.cap); // 8 > 5
      expect(deck.cards).toHaveLength(27 + 5); // every pool copy is dealable (hullRepair is live)
    }
  });

  it('...and the copies beyond the cap are DEAD BY DESIGN: a ship at cap is never offered the line', () => {
    const atCap: readonly LineId[] = new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair');
    for (const hull of SHIP_CLASS_IDS) {
      const deck = buildDeckState([...DEFAULT_DECKS[hull], ...HEAVY_POOL]);
      let drewSomethingElse = false;
      for (let seed = 0; seed < 100; seed += 1) {
        const { offer } = drawOffer(deck, mulberry32(seed), CATALOG, { held: atCap });
        expect(offer, `${hull}:${seed}`).not.toContain('hullRepair');
        if (offer.length > 0) drewSomethingElse = true;
      }
      expect(drewSomethingElse, hull).toBe(true); // the deck still deals — only that line is closed
    }
  });

  it('a spawn draw with `held = what the hull holds` is identical to one with no `held`, over 100 seeds and all three hulls', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const deck = buildDeckState(DEFAULT_DECKS[hull], SPAWN_HELD);
      for (let seed = 0; seed < 100; seed += 1) {
        const guarded = drawOffer(deck, mulberry32(seed), CATALOG, { held: SPAWN_HELD }).offer;
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
      expect(picks.length, `${seed}`).toBe(27); // the whole drawable pool plays out
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
