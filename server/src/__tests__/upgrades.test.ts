// THE DECK ECONOMY (Story 2.8, amendment 38; re-cut for catalog v3 in Story
// 8.1). Server-side pins for the per-player card deck behind every offer: the
// INTERIM deck composition (Eric ruling 2026-09-15 — every NON-STUB line at
// its cap, identical for every hull; drones never get one), the LAZY
// bank→materialize→fit cycle over the REAL production CATALOG (a draw takes
// nothing; only the FIT thins the deck — the anti-hoarding pin below is the
// regression this model exists for), equipment lines whose copy 1 fits the
// weapon into the extra slot, heal-on-grant (ARMOR — the ONLY heal path),
// top-up on raised caps (amendment 41), the empty-deck no-bank rule (pinned
// unreachable in production via an injected tiny catalog),
// per-(seed, join-ordinal, draw sequence) determinism, and the intact
// 2.6/2.7 earn/queue/spend/lifecycle/privacy guarantees the deck slots into.

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  CATALOG,
  CONFIG,
  HEAL_CHOICE,
  LINE_IDS,
  boonStackCount,
  effectiveStats,
  isStubLine,
  tierTargetOf,
  type BallisticEvent,
  type Catalog,
  type CatalogLine,
  type BoonOffer,
  type FrameMsg,
  type GameEvent,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const SLOT_GUN = 0;
const SLOT_TORPEDO = 1;
/** Battleship fit [gun, broadside, starShells, empty]. */
const SLOT_BROADSIDE = 1;

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 1, opts?: WorldOptions): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  // PARK THE BEAM AT 0 — a teleporting fixture must script the beam too, now
  // that addShip anchors a fresh sweep to the hull's SPAWN-RING heading (Eric
  // ruling 2026-08-16) and this helper discards that placement. windowAround
  // already does it wherever a window is load-bearing; this is the default.
  rec.sweepAngle = 0;
  rec.prevSweepAngle = 0;
  return rec;
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = brg - halfWidth;
  me.sweepAngle = brg + halfWidth;
}

/** Park a complete InputMsg carrying ONE click on `slot` (fireSeq doubles as
 *  seq — a fresh fireSeq is what the world reads as a pending press). */
function fire(ship: ShipRecord, fireSeq: number, slot: number, aimDist: number, aim = 0): void {
  ship.input = { seq: fireSeq, throttle: 0, rudder: 0, aim, fireSeq, aimDist, slot, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
}

/** Stack `count` copies of one catalog line through the real grant seam. */
function stack(w: World, ship: ShipRecord, lineId: string, count: number): void {
  for (let i = 0; i < count; i++) w.applyCard(ship, lineId);
}

/** Bank `n` levels through the real XP seam (only the FRONT one draws a hand). */
function bank(w: World, ship: ShipRecord, n: number): void {
  for (let i = 0; i < n; i++) w.grantXp(ship, 1);
}

/** The materialized front offer, defensively copied (fails loudly if none). */
function front(ship: ShipRecord): string[] {
  expect(ship.offer).not.toBeNull();
  return [...ship.offer!];
}

/** Spend the front offer on its first card. Catalog v3 has no acquisition
 *  card and no subdeck, so EVERY pick moves the deck by exactly one card —
 *  the old "find a plain card" search has nothing left to skip past, and a
 *  card-count assertion means what it says for any index. Returns the fitted
 *  id. */
function spendPlainCard(w: World, ship: ShipRecord): string {
  const hand = front(ship);
  expect(w.spendPoint(ship.id, 0)).toBe(true);
  return hand[0];
}

/** Occurrences of `id` in a deck's card multiset. */
function copiesInDeck(ship: ShipRecord, id: string): number {
  return boonStackCount(ship.deck.cards, id);
}

const bnsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'bn');
const ptsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'pt');
// Radar paints — the identity-free coverage footprint (the one grammar).
const blipsOf = (f: FrameMsg) => f.events.filter((e) => e.k === 'blip');
const ballisticsOf = (f: FrameMsg) =>
  f.events.filter((e): e is BallisticEvent => e.k === 'shell' || e.k === 'torp');

// ---------- deck composition -------------------------------------------------

/** The seven per-equipment reload lines the 2026-08-04 global cooldown ruling
 *  deleted — no deck, offer, or catalog may ever hold one again. */
const DEAD_RELOAD_IDS = ['gunReload', 'cannonReload', 'torpedoReload', 'mineReload', 'boostReload', 'starReload', 'decoyReload'];

/** THE INTERIM DECK SIZE (Story 8.1, Eric ruling 2026-09-15): every NON-STUB
 *  line at its cap — 16 lines, 53 cards — and IDENTICAL for every hull until
 *  Story 8.2 authors real per-hull decks. Derived from the catalog rather than
 *  restated, so the number moves with the catalog and the PIN is the RULE. */
const INTERIM_DECK_SIZE = LINE_IDS.reduce((n, id) => (isStubLine(id) ? n : n + CATALOG[id].cap), 0);

describe('deck composition — the INTERIM buildDeck (Story 8.1)', () => {
  const HULLS: ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];

  for (const hull of HULLS) {
    it(`${hull}: every non-stub line at its cap, no stub, no hull variation (${INTERIM_DECK_SIZE} cards)`, () => {
      const w = bareWorld();
      const rec = place(w, 'a', 0, 0, 0, hull);
      expect(rec.deck.cards).toHaveLength(INTERIM_DECK_SIZE);
      expect(INTERIM_DECK_SIZE).toBe(53);
      for (const id of LINE_IDS) {
        // A STUB line is authored but unbuilt: it can never be dealt, which is
        // the single point at which "authored" becomes "unofferable".
        expect(copiesInDeck(rec, id), id).toBe(isStubLine(id) ? 0 : CATALOG[id].cap);
      }
      // The deck-gun family and the global RELOAD ladder are universal — every
      // hull's deck carries all their copies, and no per-equipment reload line
      // survives anywhere.
      expect(copiesInDeck(rec, 'deckGunBarrel')).toBe(2);
      expect(copiesInDeck(rec, 'deckGunTurret')).toBe(1);
      expect(copiesInDeck(rec, 'reload')).toBe(5);
      for (const dead of DEAD_RELOAD_IDS) {
        expect(Object.hasOwn(CATALOG, dead)).toBe(false);
        expect(copiesInDeck(rec, dead)).toBe(0);
      }
    });
  }

  it('the three hulls build the BYTE-IDENTICAL interim deck (no per-hull composition until 8.2)', () => {
    const decks = HULLS.map((hull) => {
      const w = bareWorld();
      return [...place(w, 'a', 0, 0, 0, hull).deck.cards];
    });
    expect(decks[1]).toEqual(decks[0]);
    expect(decks[2]).toEqual(decks[0]);
  });

  it('DRONES get NO deck and never draw (the frozen empty identity)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall');
    expect(d.deck.cards).toEqual([]);
    // Even a direct XP grant banks nothing for a drone (the addXpMs guard).
    w.grantXp(d, 5);
    expect(d.level).toBe(0);
    expect(d.bankedLevels).toBe(0);
    expect(d.offer).toBeNull();
    expect(d.deck.cards).toEqual([]);
  });
});

// ---------- earn: who banks one ----------------------------------------------

describe('point earn — who banks one (deck-drawn offers)', () => {
  it('an attributed kill banks ONE deck-drawn offer (stats untouched) + a self-private pt event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step(); // flush joins
    const deckBefore = a.deck.cards.length;
    w.sinkShip('b', 'a');
    w.step();
    expect(a.bankedLevels).toBe(1);
    expect(front(a)).toHaveLength(CONFIG.offer.size); // 4 lines from a healthy deck
    expect(new Set(front(a)).size).toBe(CONFIG.offer.size); // all DIFFERENT lines
    expect(a.deck.cards).toHaveLength(deckBefore); // the DRAW takes nothing out
    expect(a.level).toBe(1);
    // Earning applies NOTHING: the build and cached stats are the zero-card identity.
    expect(a.cards).toEqual([]);
    expect(a.stats).toEqual(effectiveStats(a.cls));
    // Exactly one pt event, visible ONLY to the killer.
    expect(ptsOf(buildFrame(w, 'a').events)).toEqual([{ k: 'pt', id: 'a' }]);
    expect(ptsOf(buildFrame(w, 'b').events)).toEqual([]);
  });

  it('a storm death (no killer) banks nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step();
    w.sinkShip('b'); // by=undefined — the storm has no killer
    w.step();
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a self-kill banks nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    w.sinkShip('a', 'a');
    w.step();
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a killer who already left the room banks nothing and does not crash', () => {
    const w = bareWorld();
    place(w, 'b', 100, 0);
    w.step();
    expect(() => w.sinkShip('b', 'gone')).not.toThrow();
    w.step();
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a DEAD killer (mutual destruction) still banks the point', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step();
    w.sinkShip('a', 'b'); // a dies first — and this crowns b (Story 4.6: 1 captain kill, unique max)
    w.sinkShip('b', 'a'); // ...but its torpedo still lands, now on the BOUNTY HOLDER
    w.step();
    // TWO banked points since Story 4.6: the standard captain level plus
    // CONFIG.bounty.killLevels for sinking the holder — both to a corpse.
    expect(a.bankedLevels).toBe(2);
    expect(a.level).toBe(2); // kill XP is NOT alive-gated (Story 2.6)
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(a.hp).toBe(0); // earning is inert — a corpse banks, nothing heals
  });
});

// ---------- determinism ------------------------------------------------------

describe('deck determinism — (mapSeed, join ordinal, draw sequence)', () => {
  it('same seed + same join order + same draws ⇒ identical offers', () => {
    // Three levels now materialize ONE hand at a time, so the run has to SPEND
    // to reach the second and third draws — which is exactly the sequence the
    // determinism guarantee is about.
    const run = (): string[][] => {
      const w = bareWorld(42);
      const a = place(w, 'a', 0, 0);
      place(w, 'b', 100, 0);
      bank(w, a, 3);
      const seen: string[][] = [front(a)];
      for (let i = 0; i < 2; i++) {
        expect(w.spendPoint('a', 0)).toBe(true);
        seen.push(front(a));
      }
      return seen;
    };
    expect(run()).toEqual(run());
  });

  it('join/leave churn ELSEWHERE never shifts a player’s draws (the stable ordinal)', () => {
    const quiet = bareWorld(42);
    const a1 = place(quiet, 'a', 0, 0);
    place(quiet, 'b', 100, 0);
    bank(quiet, a1, 2);

    const churn = bareWorld(42);
    const a2 = place(churn, 'a', 0, 0);
    place(churn, 'b', 100, 0);
    churn.removeShip('b'); // leave...
    place(churn, 'c', 200, 0); // ...and a later join — ordinals elsewhere move on
    bank(churn, a2, 2);

    expect(a2.offer).toEqual(a1.offer); // a's stream is its own
  });

  it('redeployShip rebuilds the deck but NOT the stream: post-redeploy draws continue the same rng sequence', () => {
    // Twin worlds, neither drew before the redeploy: the rng sits at position
    // 0 in both and the redeployed deck is an identical fresh build, so the
    // post-redeploy offer must equal the never-redeployed one — the stream was
    // NOT reseeded, merely never consumed.
    const plain = bareWorld(7);
    const a1 = place(plain, 'a', 0, 0);
    bank(plain, a1, 1);

    const redeployed = bareWorld(7);
    const a2 = place(redeployed, 'a', 0, 0);
    redeployed.resetForMatchStart(); // fresh deck, SAME stream position
    bank(redeployed, a2, 1);

    expect(a2.offer).toEqual(a1.offer);
  });
});

// ---------- the queue + spend cycle ------------------------------------------

describe('level bank — lazy front offer, front on the wire, reroll-proof', () => {
  // THE WHOLE SPEND FLOW IN ONE PASS (Story 8.1 acceptance): a level is
  // banked, ONE hand of four DISTINCT non-stub lines materializes, the pick is
  // fitted through the real spendPoint -> settleSpend -> applyCard path, the
  // fitted line's TIER shows up in the effective stats, and reopening the
  // refit does not reroll the frozen hand behind it.
  it('bank -> four distinct non-stub ids -> pick -> applyCard -> the tier lands -> no reroll', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2); // one hand up, one level behind it
    const hand = front(a);
    expect(hand).toHaveLength(CONFIG.offer.size);
    expect(new Set(hand).size).toBe(CONFIG.offer.size); // four DIFFERENT lines
    for (const id of hand) {
      expect(Object.hasOwn(CATALOG, id), id).toBe(true);
      expect(isStubLine(id), id).toBe(false); // a stub can never be dealt
    }
    // Spend it through the public wire entry point, exactly as a client does.
    const pick = hand[2];
    expect(w.spendPoint('a', 2)).toBe(true);
    expect(a.cards).toEqual([pick]);
    // THE TIER LANDS: the fold is the whole build, so the cached stats equal a
    // fresh effectiveStats over the id list — and the picked line's own tier
    // target (where it has one) has advanced off its base rung.
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards));
    const target = tierTargetOf(CATALOG[pick]);
    if (target !== undefined) {
      const base = effectiveStats(a.cls).equipment[target].tier;
      expect(a.stats.equipment[target].tier).toBe(base + 1);
    } else {
      expect(a.stats).not.toEqual(effectiveStats(a.cls)); // a ladder still moved something
    }
    // NO REROLL: the next level's hand is drawn once and frozen — reopening
    // the refit (rebuilding the frame) reads the identical four ids.
    const next = front(a);
    expect(next).toHaveLength(CONFIG.offer.size);
    w.step();
    w.step();
    expect([...buildFrame(w, 'a').you!.offer]).toEqual(next);
    expect(front(a)).toEqual(next);
  });

  it('3 banked levels bank 3 LEVELS and materialize ONE hand; a spend surfaces the next', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 3);
    expect(a.bankedLevels).toBe(3);
    const first = front(a);
    const pick = first[2];
    expect(w.spendPoint('a', 2)).toBe(true);
    expect(a.cards).toEqual([pick]);
    expect(a.bankedLevels).toBe(2);
    const second = front(a); // a FRESH hand, drawn now that this level reached the front
    expect(second).toHaveLength(CONFIG.offer.size);
    const f = buildFrame(w, 'a');
    expect(f.you!.pts).toBe(2);
    expect(f.you!.offer).toEqual(second);
  });

  it('the front offer is reroll-proof: identical across consecutive frames with no spend', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const before = [...buildFrame(w, 'a').you!.offer];
    w.step();
    w.step();
    expect([...buildFrame(w, 'a').you!.offer]).toEqual(before);
    expect(a.bankedLevels).toBe(1);
    expect(front(a)).toEqual(before); // ...and the server-side hand is the frozen one
  });

  // THE ANTI-REGRESSION PIN (the lazy-draw bugfix). Under the old model each
  // level DREW four cards out of the deck and only gave three back on a spend,
  // so a player who banked levels drained their own deck: a 59-card TB hit zero
  // by ~L15 and started banking 3-card, then 1-card, then zero-card levels. The
  // whole point of the lazy model is that banking is FREE.
  it('20 levels banked WITHOUT a single spend: every hand is full size and the deck never shrinks', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const buildSize = a.deck.cards.length;
    expect(buildSize).toBe(INTERIM_DECK_SIZE); // the interim build (suite above)
    const hands: string[][] = [];
    for (let i = 0; i < 20; i++) {
      bank(w, a, 1);
      expect(a.bankedLevels).toBe(i + 1);
      hands.push(front(a));
      expect(a.deck.cards).toHaveLength(buildSize); // NOTHING left the deck
    }
    for (const hand of hands) {
      expect(hand).toHaveLength(CONFIG.offer.size);
      expect(new Set(hand).size).toBe(CONFIG.offer.size);
    }
    // ...and the whole queue is still spendable, 4 cards at a time, all the way
    // down: 20 spends, 20 full hands, 20 cards fitted.
    for (let i = 20; i > 0; i--) {
      expect(front(a)).toHaveLength(CONFIG.offer.size);
      spendPlainCard(w, a);
      expect(a.bankedLevels).toBe(i - 1);
    }
    expect(a.cards).toHaveLength(20);
    expect(a.deck.cards).toHaveLength(buildSize - 20); // exactly the 20 FITTED cards
  });

  it('a passed-on line stays at FULL copies and is drawable by the very next level', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    const hand = front(a);
    const passed = hand[1]; // fit slot 0, pass on the rest
    const copiesBefore = copiesInDeck(a, passed);
    expect(copiesBefore).toBe(CATALOG[passed].cap); // never left the deck at all
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(copiesInDeck(a, passed)).toBe(copiesBefore); // ...and still hasn't
    // It is eligible for the very next draw: hammer the stream from this state
    // and it does come back up.
    let seen = false;
    for (let i = 0; i < 200 && !seen; i++) {
      const twin = bareWorld(1000 + i);
      const t = place(twin, 'a', 0, 0);
      bank(twin, t, 1);
      seen = front(t).includes(passed);
    }
    expect(seen, `${passed} never drawable again`).toBe(true);
  });

  it('spend consumes ONLY the chosen card; the unchosen never left the deck', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const offer = front(a);
    const deckBefore = a.deck.cards.length;
    expect(w.spendPoint('a', 0)).toBe(true);
    // Exactly ONE card left the pool — the fitted one.
    expect(a.deck.cards).toHaveLength(deckBefore - 1);
    const chosen = offer[0];
    expect(copiesInDeck(a, chosen)).toBe(CATALOG[chosen].cap - 1); // one copy consumed
    for (const id of offer.slice(1)) {
      expect(copiesInDeck(a, id)).toBe(CATALOG[id].cap - boonStackCount(a.cards, id));
    }
  });

  it('N fits remove exactly N cards, however the levels are banked and spent', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const buildSize = a.deck.cards.length;
    let fits = 0;
    // Interleave: bank 3, spend 1, bank 1, spend 2, ... over many rounds.
    for (let round = 0; round < 6; round++) {
      bank(w, a, 3);
      spendPlainCard(w, a);
      fits += 1;
      bank(w, a, 1);
      spendPlainCard(w, a);
      spendPlainCard(w, a);
      fits += 2;
      expect(a.deck.cards).toHaveLength(buildSize - fits);
    }
    expect(a.cards).toHaveLength(fits);
  });

  // SOFT PITY IS DELETED with rarity (Story 8.1), and `levelsSinceRare` with
  // it — so the "exactly one draw per level" rule needs a different witness.
  // The deck stream is it: a healthy draw consumes exactly CONFIG.offer.size
  // rng values (one weighted pick per offered line), so counting the stream's
  // consumption counts draws, whatever the catalog holds.
  it('exactly ONE draw per level across grant/spend/heal interleavings (the deck stream counts them)', () => {
    const line = (id: string): CatalogLine =>
      ({ id, kind: 'ladder', cap: 9, tiers: new Array(9).fill([{ kind: 'stat', path: 'equipment.gun.damage', add: 1 }]) }) as unknown as CatalogLine;
    const catalog: Catalog = { c1: line('c1'), c2: line('c2'), c3: line('c3'), c4: line('c4'), c5: line('c5'), c6: line('c6') };
    const w = bareWorld(3, { catalog });
    const a = place(w, 'a', 0, 0);
    // Count the stream instead of a deleted counter: wrap this ship's own rng.
    let rolls = 0;
    const inner = a.deckRng;
    a.deckRng = {
      next: () => { rolls += 1; return inner.next(); },
      int: (lo: number, hi: number) => inner.int(lo, hi),
      float: (lo: number, hi: number) => inner.float(lo, hi),
      pick: <T>(xs: readonly T[]) => inner.pick(xs),
    };
    const draws = (): number => rolls / CONFIG.offer.size;
    let levels = 0;
    const grant = (n: number): void => { bank(w, a, n); levels += n; };
    grant(4); // one draw now, three deferred
    expect(draws()).toBe(1);
    expect(w.spendPoint('a', 0)).toBe(true); // consumes a level, draws the next
    expect(draws()).toBe(2);
    a.hp -= 40;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true); // a heal draws the next too
    expect(draws()).toBe(3);
    grant(2); // both deferred behind the live hand
    expect(draws()).toBe(3);
    // Drain the bank: each spend materializes the next, until the last one.
    while (a.bankedLevels > 0) expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.offer).toBeNull();
    expect(draws()).toBe(levels); // one draw per level, no more, no fewer
  });
});

describe('spendPoint — validation table', () => {
  it('rejects an unknown ship and an empty bank', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    expect(w.spendPoint('ghost', 0)).toBe(false);
    expect(w.spendPoint('a', 0)).toBe(false); // no banked levels
  });

  it('rejects every malformed choice, leaving the queue untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp -= 40; // DAMAGE gone, so a -1 rejection can only be the SENTINEL check
    bank(w, a, 1);
    const before = front(a);
    // -1 left this list on 2026-08-04: it is now HEAL_CHOICE, the one reserved
    // negative. EVERY other negative stays malformed — that is the whole point
    // of a reserved sentinel over "any negative means heal".
    for (const junk of [-2, -99, 4, 99, 1.5, NaN, Infinity, '0', 'heal', null, undefined, {}]) {
      expect(w.spendPoint('a', junk)).toBe(false);
    }
    expect(a.bankedLevels).toBe(1);
    expect(front(a)).toEqual(before);
    expect(a.cards).toEqual([]);
    expect(a.repairHp).toBe(0); // no near-miss ever primed the pool
  });

  it('a valid slot FITS the card, recomputes stats, and emits a self-private bn', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    bank(w, a, 1);
    const pick = front(a)[1];
    expect(w.spendPoint('a', 1)).toBe(true);
    w.step();
    expect(a.cards).toEqual([pick]);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards));
    expect(bnsOf(buildFrame(w, 'a').events)).toEqual([{ k: 'bn', id: 'a', boon: pick }]);
    expect(bnsOf(buildFrame(w, 'b').events)).toEqual([]); // spender-private
  });

  it('digit 4 (choice 3) is LIVE against the four-card production offer', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    expect(front(a)).toHaveLength(4);
    const pick = front(a)[3];
    expect(w.spendPoint('a', 3)).toBe(true);
    expect(a.cards).toEqual([pick]);
  });

  it('levels ARE spendable while dead (builds persist across respawn)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10): the refit is closed while SINKING — dead
    // spending resumes only once the hull founders. Cross the window first.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(a.lifecycle)).toBe(false);
    const pick = front(a)[0];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.cards).toEqual([pick]);
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
  });
});

// ---------- DAMAGE CONTROL (the always-available heal spend) ------------------
//
// The spec's I/O & Edge-Case Matrix, row for row. The strip is NOT a card: it
// is never drawn, never in the deck, never in OwnShip.offer — it is addressed
// by the reserved negative wire sentinel HEAL_CHOICE (-1) alone.

const HEALS_OF = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'heal');
const DC = CONFIG.damageControl;
/** hp per 50ms tick at the fixed regen rate (25hp / 5000ms = 5 hp/s). */
const REGEN_PER_TICK = (DC.regenHp / DC.regenMs) * DT;

describe('DAMAGE CONTROL — the heal spend (Eric rulings 2026-08-04)', () => {
  it('happy path: 25 instant + a 25hp pool, ONE level consumed, self-private heal event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // hull-to-hull neighbour: sighted, and told nothing
    bank(w, a, 1);
    a.hp = a.stats.maxHp - 75;
    const hpBefore = a.hp;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.hp).toBe(hpBefore + DC.instantHp);
    expect(a.repairHp).toBe(DC.regenHp);
    expect(a.bankedLevels).toBe(0); // exactly one level consumed
    expect(a.offer).toBeNull(); // ...and its hand is dropped, not stored
    w.step();
    expect(HEALS_OF(buildFrame(w, 'a').events)).toEqual([{ k: 'heal', id: 'a' }]);
    expect(HEALS_OF(buildFrame(w, 'b').events)).toEqual([]); // healer-private
  });

  it('the deck is not touched AT ALL by a heal — no card leaves it (unlike a card pick)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2); // a second level so the next hand materializes off the same deck
    a.hp -= 50;
    const offer = front(a);
    const deckBefore = [...a.deck.cards];
    const copiesBefore = offer.map((id) => copiesInDeck(a, id));
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    // Under the lazy model nothing ever left the pool, so a heal returns
    // nothing and the multiset is BYTE-IDENTICAL — the offer is just dropped.
    expect(a.deck.cards).toEqual(deckBefore);
    offer.forEach((id, i) => expect(copiesInDeck(a, id)).toBe(copiesBefore[i]));
    expect(a.cards).toEqual([]); // nothing was fitted
    expect(front(a)).toHaveLength(CONFIG.offer.size); // the next level's hand is up
  });

  it('the pool pays out exactly regenHp over regenMs at the FIXED rate, then stops', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    a.hp = a.stats.maxHp - 100;
    w.spendPoint('a', HEAL_CHOICE);
    const hpAfterInstant = a.hp;
    const ticks = DC.regenMs / DT;
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.hp).toBeCloseTo(hpAfterInstant + DC.regenHp, 6);
    expect(a.repairHp).toBeCloseTo(0, 9);
    const settled = a.hp;
    for (let i = 0; i < 20; i++) w.step(); // a drained pool never pays again
    expect(a.hp).toBe(settled);
  });

  it('POOLS ADD, the rate never changes: a second heal mid-drain extends, never steepens', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    a.hp = a.stats.maxHp - 150;
    w.spendPoint('a', HEAL_CHOICE);
    // Drain to exactly 15hp remaining (10hp paid = 2s), then heal again.
    const ticks = Math.round(10 / REGEN_PER_TICK);
    for (let i = 0; i < ticks; i++) w.step();
    // Pool after draining 10hp: regenHp - 10. DERIVED, not a literal, because
    // balance cycle 1 doubled regenHp 25 -> 50 (and with it the rate, 5 -> 10
    // hp/s) in step with hull hp — a hard-coded 15 pinned the old amount.
    expect(a.repairHp).toBeCloseTo(DC.regenHp - 10, 6);
    const hpAtSecondHeal = a.hp;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.repairHp).toBeCloseTo(DC.regenHp - 10 + DC.regenHp, 6);
    // THE RATE PIN: the very next tick pays ONE pool's worth of rate, NOT two.
    // This is the invariant the doubling did NOT touch — pools ADD, never
    // ACCELERATE — and it is why the rate change is safe.
    w.step();
    expect(a.hp).toBeCloseTo(hpAtSecondHeal + DC.instantHp + REGEN_PER_TICK, 9);
    expect(a.hp).not.toBeCloseTo(hpAtSecondHeal + DC.instantHp + 2 * REGEN_PER_TICK, 9);
  });

  it('FULL HP is rejected fail-closed: the level stays banked, the pool untouched, no event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    expect(a.hp).toBe(a.stats.maxHp);
    const offerBefore = front(a);
    const deckBefore = a.deck.cards.length;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.bankedLevels).toBe(1);
    expect(front(a)).toEqual(offerBefore); // the SAME hand, never rerolled
    expect(a.deck.cards).toHaveLength(deckBefore);
    expect(a.repairHp).toBe(0);
    w.step();
    expect(HEALS_OF(buildFrame(w, 'a').events)).toEqual([]);
  });

  it('a DEAD hull is rejected — the level stays banked for the next life', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    a.hp -= 50;
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.bankedLevels).toBe(1); // banked, unlike a CARD pick which is legal dead
    expect(a.repairHp).toBe(0);
    expect(a.hp).toBe(0);
  });

  it('NO banked levels is rejected by the existing empty-queue guard', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp -= 50; // damaged and alive — only the empty bank can refuse it
    expect(a.bankedLevels).toBe(0);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(w.spendPoint('ghost', HEAL_CHOICE)).toBe(false);
    expect(a.repairHp).toBe(0);
  });

  it('OVERFLOW IS LOST, not banked: healing at maxHp-1 wastes the instant AND the pool', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    a.hp = a.stats.maxHp - 1; // damaged enough to pass the guard, by exactly 1hp
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.hp).toBe(a.stats.maxHp); // 24 of the 25 instant clamped away
    expect(a.repairHp).toBe(DC.regenHp); // the pool still exists...
    // ...and drains on the WALL CLOCK against a full bar, delivering nothing.
    for (let i = 0; i < DC.regenMs / DT; i++) w.step();
    expect(a.repairHp).toBeCloseTo(0, 9);
    expect(a.hp).toBe(a.stats.maxHp);
  });

  it('STORM OVERLAP nets +1 hp/s: 5 hp/s regen against the 4 dps bite, both independent', () => {
    // A collapsed timeline (1ms beats) so the terminal ring is live in one step;
    // the hull sits far outside it and bleeds stormDps for the pool's whole life.
    const w = new World(3, CONFIG.match.fillTo, { beatMs: 1, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 1 });
    w.map.islands.length = 0;
    const a = place(w, 'a', w.map.radius * 0.8, 0);
    w.startZone();
    bank(w, a, 1);
    a.hp = a.stats.maxHp - 100;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    const hpAfterInstant = a.hp;
    const stormPerTick = CONFIG.zone.stormDps * (DT / 1000);
    const ticks = DC.regenMs / DT;
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.repairHp).toBeCloseTo(0, 9);
    // Net over the pool's life = regenHp - stormDps*regenMs: +25 - 20 = +5hp.
    expect(a.hp).toBeCloseTo(hpAfterInstant + DC.regenHp - stormPerTick * ticks, 6);
    expect(a.hp).toBeGreaterThan(hpAfterInstant); // the pool out-paces the storm
    // ...and once it drains, the storm has the hull to itself again.
    const afterPool = a.hp;
    w.step();
    expect(a.hp).toBeCloseTo(afterPool - stormPerTick, 6);
  });

  it('SINKING mid-drain zeroes the pool — nothing carries through the death gap', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    a.hp = a.stats.maxHp - 100;
    w.spendPoint('a', HEAL_CHOICE);
    for (let i = 0; i < 4; i++) w.step();
    expect(a.repairHp).toBeGreaterThan(0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(a.repairHp).toBe(0);
    const hp = a.hp;
    for (let i = 0; i < 10; i++) w.step(); // a wreck never trickles hp back
    expect(a.hp).toBe(hp);
  });

  it('a RESPAWN and a match-boundary REDEPLOY each clear the pool (the boostUntil sites)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    a.hp = a.stats.maxHp - 100;
    w.spendPoint('a', HEAL_CHOICE);
    expect(a.repairHp).toBe(DC.regenHp);
    w.sinkShip('a'); // respawnEnabled (waiting phase) — zeroed here...
    // Story 5.2: revive lands on the founder tick (window > respawn delay).
    const ticks = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2;
    for (let i = 0; i < ticks; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.repairHp).toBe(0); // ...and again on the way back
    a.hp = a.stats.maxHp - 100;
    w.spendPoint('a', HEAL_CHOICE);
    expect(a.repairHp).toBe(DC.regenHp);
    w.resetForMatchStart();
    expect(a.repairHp).toBe(0);
  });

  it('the heal NEVER routes through applyBoon: no fit, no stat recompute, no reload rescale', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    a.hp -= 50;
    const statsBefore = a.stats;
    const cardsBefore = a.cards;
    // Put a round in flight so a stray rescaleReloadTimers would be visible.
    fire(a, 1, SLOT_GUN, 300);
    w.step();
    const reloadBefore = a.loadout[SLOT_GUN].state!.reloadMsLeft;
    const ammoBefore = a.loadout[SLOT_GUN].state!.n;
    expect(reloadBefore).toBeGreaterThan(0);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.cards).toEqual([]);
    expect(a.stats).toBe(statsBefore); // the SAME object — never recomputed
    expect(a.cards).toBe(cardsBefore);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(reloadBefore); // byte-identical
    expect(a.loadout[SLOT_GUN].state!.n).toBe(ammoBefore); // no free round
  });

  it('wire: repairHp rides `you` alone — never a contact, an event, or a spectator frame', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // mutual sight
    bank(w, a, 1);
    a.hp -= 60;
    w.spendPoint('a', HEAL_CHOICE);
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.you!.repairHp).toBe(a.repairHp);
    expect(fa.you!.repairHp).toBeGreaterThan(0);
    // b sees a as a live contact and learns NOTHING about the repair.
    const fb = buildFrame(w, 'b');
    expect(fb.contacts.find((c) => c.id === 'a')).toBeDefined();
    expect(fb.you!.repairHp).toBe(0); // b's OWN pool, not a's
    expect(HEALS_OF(fb.events)).toEqual([]);
    expect(JSON.stringify({ ...fb, you: undefined })).not.toContain('repairHp');
    // ...and neither does a spectator, even in an UNFOGGED frame (pt/bn terms).
    const spec = buildFrame(w, 'b', 'finished');
    expect(spec.spec).toBe(true);
    expect(HEALS_OF(spec.events)).toEqual([]);
    expect(JSON.stringify(spec)).not.toContain('repairHp');
  });

  it('the strip is NOT a card: heal never appears in the deck, the catalog, or an offer', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 3);
    expect(CONFIG.offer.size).toBe(4); // untouched by DAMAGE CONTROL
    for (const id of a.deck.cards) expect(id).not.toMatch(/heal|repair|damageControl/i);
    const hand = front(a);
    expect(hand).toHaveLength(4);
    for (const id of hand) expect(Object.hasOwn(CATALOG, id)).toBe(true);
    expect(buildFrame(w, 'a').you!.offer).toHaveLength(4); // the strip never rides `offer`
  });
});

// ---------- equipment lines --------------------------------------------------
//
// ACQUISITION CARDS ARE DELETED (Story 8.1). Catalog v3 has no acquire* line
// and no per-equipment subdeck: an EQUIPMENT line's COPY 1 *is* the fit (its
// only effect is the `slotFill`), and copies 2–5 are its upgrade tiers. So the
// old purge/subdeck pins have no mechanism left to assert about; what replaces
// them is the fit itself, and the guarantee that an UNBUILT weapon can never
// take the slot.

describe('equipment lines — copy 1 fits the weapon into the extra slot', () => {
  /** A TB holding `extraLevels` more banked levels behind a directed
   *  navalMines front offer (the TB carries no mine, so its extra slot is the
   *  one this fit lands in). */
  function fitBoard(extraLevels = 0): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.bankedLevels = 1 + extraLevels;
    a.offer = ['navalMines', 'deckGunBarrel', 'armor', 'radarSweep'];
    return { w, a };
  }

  it('the pick installs the equipment LOADED in the extra slot (full pool)', () => {
    const { w, a } = fitBoard();
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'heavyTorpedo', 'speedBoost', 'navalMines']);
    expect(a.loadout[3].state).toEqual({ n: a.stats.equipment.navalMines.maxAmmo, reloadMsLeft: 0 });
  });

  it('the line stays in the deck at cap − 1 and its later copies are its TIERS, not another fit', () => {
    const { w, a } = fitBoard();
    const before = copiesInDeck(a, 'navalMines');
    expect(before).toBe(CATALOG['navalMines'].cap);
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(copiesInDeck(a, 'navalMines')).toBe(before - 1);
    // Copy 2 is tier II — EMPTY until Story 8.13 authors it — and above all it
    // does NOT fit a second mine anywhere.
    const slotsBefore = a.loadout.map((s) => s.equipmentId);
    w.applyCard(a, 'navalMines');
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(slotsBefore);
    expect(a.stats.equipment.navalMines.tier).toBe(2);
  });

  it('a STUB line never fits: applyCard is a silent no-op and the stats row stays at its base numbers', () => {
    const { w, a } = fitBoard();
    const before = effectiveStats(a.cls);
    // Forced past the deck (a stub is never dealt) — the last line of defence.
    expect(isStubLine('machineGun')).toBe(true);
    expect(() => w.applyCard(a, 'machineGun')).not.toThrow();
    expect(a.loadout[3].equipmentId).toBeNull(); // the extra slot is untouched
    expect(a.stats.equipment.machineGun).toEqual(before.equipment.machineGun);
  });

  it('the post-fit draw is deterministic on the player’s own stream (twin worlds agree)', () => {
    const run = (): string[][] => {
      const { w, a } = fitBoard(1);
      w.spendPoint('a', 0);
      return [front(a)];
    };
    expect(run()).toEqual(run());
  });
});

// ---------- doctrine swaps: RETIRED (Story 7-5 wave 2, R2.6) -----------------
//
// THE WHOLE EXCLUSIVITY MECHANISM IS DELETED, not just its last subject.
// `exclusiveWith`, the symmetry validation, `boonReplacesLine`, the doctrine
// swap-out and `returnCards` all died with the cannon pair (PLUNGING FIRE ⚔
// ARMOR-PIERCING was the last exclusive pair in the game), so the three cases
// here — the free replace, the rival's card returning to the deck, and
// ping-pong across a match — have no mechanism left to assert about.
//
// The surviving half of the third case ("fitting both verbs keeps both, and
// returns nothing") is now the ONLY behaviour there is: every doctrine in the
// game is an independent boolean that stacks. It is pinned per weapon in
// doctrines.test.ts rather than here, where it only ever existed as the
// counterexample to a swap.

// ---------- heal-on-grant + capacity raises ----------------------------------

describe('grant-time effects — healOnGrant and raised-cap top-ups', () => {
  it('ARMOR heals exactly the granted maxHp delta, clamped to the new cap (spec matrix row)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const baseMax = a.stats.maxHp;
    a.hp = baseMax - 50;
    w.applyCard(a, 'armor'); // +25 maxHp, healOnGrant
    expect(a.stats.maxHp).toBe(baseMax + 25);
    expect(a.hp).toBe(baseMax - 50 + 25); // healed by the delta, not to full
    // Near-full: the heal is still exactly the delta (the raise moves the cap
    // by the same amount, so the defensive clamp can never bind for shipHull —
    // hp tracks the same distance below the new cap).
    a.hp = a.stats.maxHp - 5;
    w.applyCard(a, 'armor');
    expect(a.hp).toBe(a.stats.maxHp - 5);
    expect(a.hp).toBeLessThanOrEqual(a.stats.maxHp); // never above the cap
  });

  it('a DEAD hull does not heal on an ARMOR fit (respawn restores full effective hp anyway)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.applyCard(a, 'armor');
    expect(a.hp).toBe(0);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 25); // the cap still moved
  });

  it('a NON-heal fit never heals (ARMOR is the only line carrying healOnGrant)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = 40;
    w.applyCard(a, 'deckGunBarrel');
    expect(a.hp).toBe(40);
  });

  it('DECK GUN TURRET: the gun pool cap rises to 2 AND fills immediately (amendment 41)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
    w.applyCard(a, 'deckGunTurret');
    expect(a.stats.equipment.gun.maxAmmo).toBe(2); // the single-shot pin is deliberately retired
    expect(a.loadout[SLOT_GUN].state!.n).toBe(2); // topped to the new cap — arrives loaded
  });

  // SECOND TUBE is gone with the v2 torpedo ladder (Story 8.13 authors the
  // heavy torpedo's tiers II–V). The DECK GUN's own pool raise carries the
  // amendment-41 rule above; what is pinned here instead is that a mid-reload
  // slot fills the moment its cap moves, which is the half that had a tube of
  // its own only by accident of which card happened to raise a cap.
  it('a mid-reload slot fills to a raised cap immediately (amendment 41, gun pool)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: 3000 };
    w.applyCard(a, 'deckGunTurret');
    expect(a.stats.equipment.gun.maxAmmo).toBe(2);
    expect(a.loadout[SLOT_GUN].state!.n).toBe(2); // everything arrives loaded
  });
});

// ---------- empty deck -------------------------------------------------------

describe('empty deck — level banks, NO offer materializes (pinned unreachable in production)', () => {
  it('with a one-card injected catalog: the level materializes the last card, and only FITTING it empties the deck', () => {
    // The interim deck is 53 cards and, since the lazy-draw bugfix, banking
    // costs none of them — a match can never exhaust one. The rule is still
    // DEFINED: reach it with a tiny catalog (one universal line, one copy).
    const tiny: WorldOptions = {
      catalog: {
        lastShell: { id: 'lastShell', kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'equipment.gun.damage', add: 1 }]] } as unknown as CatalogLine,
      },
    };
    const w = bareWorld(1, tiny);
    const a = place(w, 'a', 0, 0);
    expect(a.deck.cards).toEqual(['lastShell']);
    w.grantXp(a, 1);
    w.step();
    expect(a.level).toBe(1);
    expect(front(a)).toEqual(['lastShell']); // a thin deck draws a short offer
    expect(a.deck.cards).toEqual(['lastShell']); // ...and the draw took nothing
    expect(ptsOf(w.tickEvents)).toEqual([{ k: 'pt', id: 'a' }]);
    // A second level materializes NOTHING new (the hand is already up) but is
    // banked, and it emits pt: there IS something to spend.
    w.grantXp(a, 1);
    w.step();
    expect(a.level).toBe(2);
    expect(a.bankedLevels).toBe(2);
    expect(front(a)).toEqual(['lastShell']);
    expect(ptsOf(w.tickEvents)).toEqual([{ k: 'pt', id: 'a' }]);
    // FITTING it is what empties the deck — and the level behind it now has
    // nothing to draw: banked, offer-less, and NOT advertising TAB-to-refit.
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.deck.cards).toEqual([]);
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBeNull();
    const f = buildFrame(w, 'a');
    expect(f.you!.pts).toBe(1); // the level is still banked...
    expect(f.you!.offer).toEqual([]); // ...with no hand behind it
    // The offer-less level refuses a CARD pick and never deadlocks: it is still
    // spendable as a heal, and a later level simply retries the draw.
    expect(w.spendPoint('a', 0)).toBe(false);
    a.hp -= 40;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.bankedLevels).toBe(0);
    // ...and a fresh level against the empty deck emits NO pt (the ratified
    // offer-less-level rule).
    w.grantXp(a, 1);
    w.step();
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });
});

// ---------- lifecycle --------------------------------------------------------

describe('economy lifecycle — respawn preserves, redeploy wipes', () => {
  it('respawn (waiting phase) PRESERVES the build: boons, stats, effective hp + pools, deck, bank, XP', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'armor', 2);
    bank(w, a, 2);
    w.grantXp(a, 0.5); // partial progress toward the next level
    const deckBefore = [...a.deck.cards];
    const bankBefore = a.bankedLevels;
    const offerBefore = front(a);
    const xpBefore = a.xpMs;
    w.sinkShip('a');
    // Story 5.2: the revive waits on the founder tick (window > respawn delay).
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.cards).toEqual(['armor', 'armor']);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 50);
    expect(a.hp).toBe(a.stats.maxHp); // full EFFECTIVE hp
    expect(a.deck.cards).toEqual(deckBefore);
    expect(a.bankedLevels).toBe(bankBefore);
    expect(front(a)).toEqual(offerBefore);
    expect(a.level).toBe(2);
    // Passive XP kept ticking through the respawn steps — never reset.
    expect(a.xpMs).toBeGreaterThanOrEqual(xpBefore);
  });

  it('redeployShip (match start) WIPES the build AND rebuilds the deck over the fresh fit', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // Fit an equipment line so the live deck and the live FIT both diverge
    // hard from a fresh build.
    a.bankedLevels = 1;
    a.offer = ['navalMines', 'deckGunBarrel', 'armor', 'radarSweep'];
    w.spendPoint('a', 0);
    bank(w, a, 2);
    expect(copiesInDeck(a, 'navalMines')).toBe(CATALOG['navalMines'].cap - 1);
    w.resetForMatchStart();
    expect(a.cards).toEqual([]);
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
    expect(a.stats).toEqual(effectiveStats(a.cls));
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'heavyTorpedo', 'speedBoost', null]);
    // The fresh deck is the fresh interim build: every non-stub line back at
    // its full cap.
    expect(copiesInDeck(a, 'navalMines')).toBe(CATALOG['navalMines'].cap);
    expect(a.deck.cards).toHaveLength(INTERIM_DECK_SIZE);
  });
});

// ---------- wire privacy -----------------------------------------------------

describe('wire privacy — banked levels and the deck never leak', () => {
  it('own frame: pts counts the BANK, offer is the materialized FRONT hand as resolvable LINE IDS; the DECK never rides the wire', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    const f = buildFrame(w, 'a');
    expect(f.you!.pts).toBe(2);
    expect(f.you!.offer).toEqual(front(a));
    for (const id of f.you!.offer) expect(Object.hasOwn(CATALOG, id)).toBe(true);
    expect('deck' in f.you!).toBe(false);
    expect(JSON.stringify(f)).not.toContain('deck');
  });

  it("another ship's frame carries no pt/bn events, and its contacts carry no pts/offer/deck", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // inside mutual sight
    bank(w, a, 1);
    w.spendPoint('a', 0);
    w.step();
    const fb = buildFrame(w, 'b');
    expect(ptsOf(fb.events)).toEqual([]);
    expect(bnsOf(fb.events)).toEqual([]);
    const contact = fb.contacts.find((c) => c.id === 'a')!;
    expect(contact).toBeDefined();
    for (const key of ['pts', 'offer', 'deck', 'boons', 'lvl', 'xp']) {
      expect(key in contact).toBe(false);
    }
  });
});

// ---------- per-observer vision boons (the intel ladder consumers) -----------

// THE INTEL RANGE LINE IS GONE (Eric ruling 2026-08-20). `intelRange` was the
// only card that wrote `stats.radarRange`, so it was the only thing that could
// move the eighths ladder; its whole describe block RETIRED with it rather
// than being adapted, in the deletion style of cycle 93 (`cannonBlast`) and
// cycle 95 (`mineTrigger`). No coverage was lost — every rung it exercised is
// pinned at BASE elsewhere in perception.test.ts: the mine DETECT gate at 3/8
// ("mine visibility (owner-always, else DETECT+LOS)", boundary-inclusive and a
// hair beyond), the mz/sm 5/8 halo ("the mz/sm halo is TIGHT at SIGHT*1.25"),
// and the contact / ballistic-reveal / blip-annulus gates throughout. What
// follows is the one surviving intel line: SWEEP RATE, a rate and not a range.

describe('per-observer sweep (intelSweep)', () => {
  it('a booned sweep completes a revolution proportionally faster', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    stack(w, up, 'radarSweep', 1); // +3 rpm
    const ticks = 20; // 1s — well inside the first (shorter) revolution
    for (let i = 0; i < ticks; i++) w.step();
    // Expected values read the effectiveStats contract (the desync firewall)
    // rather than re-deriving the rpm math — retunes/clamps can't split them.
    const factor = base.stats.sweepPeriodMs / up.stats.sweepPeriodMs; // 18/15 today
    expect(base.sweepAngle).toBeCloseTo((2 * Math.PI * ticks * DT) / base.stats.sweepPeriodMs, 9);
    expect(up.sweepAngle).toBeCloseTo(base.sweepAngle * factor, 9);
  });
});

// ---------- effective weapon stats in the fire path --------------------------

describe('effective weapon stats in the fire path (catalog ladders)', () => {
  it('RELOAD: ONE card shortens EVERY equipment — a consumed gun AND torpedo round both start the SCALED reload', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB fit: [gun, heavyTorpedo, speedBoost, empty]
    stack(w, a, 'reload', 5); // the 5-copy cap: additive −0.05/card => 0.75
    // Additive-linear, never 0.95^5 (=0.7738). clampStats rounds the
    // accumulated scale to 3 decimals before the multiplies (shared/src/sim/
    // stats.ts), so a 5-stack lands EXACTLY on 0.75 — strict, not close.
    expect(a.stats.cooldownScale).toBe(0.75);
    expect(a.stats.equipment.gun.reloadMs).toBe(3750); // 5000 base -> 3750
    expect(a.stats.equipment.heavyTorpedo.reloadMs).toBe(CONFIG.torpedo.reloadMs * 0.75);

    // The GUN's fire path reads the scaled reload, not raw CONFIG.
    fire(a, 1, SLOT_GUN, 300);
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(CONFIG.gun.reloadMs * 0.75);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeLessThan(CONFIG.gun.reloadMs); // strictly shorter than base

    // ...and so does the TORPEDO's — the SAME single card, a different weapon.
    fire(a, 2, SLOT_TORPEDO, 0);
    w.step();
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(0);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs * 0.75);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBeLessThan(CONFIG.torpedo.reloadMs);
  });

  it('RELOAD: the BROADSIDE reads the same global scale (18s -> 13.5s) off the Battleship fit', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 0, 0, 0, 'battleship'); // [gun, broadside, starShells, empty]
    stack(w, bb, 'reload', 5);
    expect(bb.stats.equipment.broadside.reloadMs).toBe(13500); // 18000 base -> 13500
    fire(bb, 1, SLOT_BROADSIDE, 300, Math.PI / 2); // abeam — inside the beam sector
    w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.n).toBe(0);
    expect(bb.loadout[SLOT_BROADSIDE].state!.reloadMsLeft).toBe(CONFIG.broadside.reloadMs * 0.75);
    expect(bb.loadout[SLOT_BROADSIDE].state!.reloadMsLeft).toBeLessThan(CONFIG.broadside.reloadMs);

    // ...and the authoritative tick really returns the barrage on the 13.5s
    // clock: still empty at 13 450ms, back at exactly 13 500ms — exactly 270
    // ticks (not 271 — the rounding fix's tick-count pin: reloadMsLeft is
    // exactly 13500, so it takes exactly 270 * 50ms decrements to cross zero,
    // never one tick of float-dust slop).
    bb.input = { ...bb.input!, fireSeq: 0, seq: 2 };
    for (let i = 0; i < 269; i++) w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.n).toBe(0);
    w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.n).toBe(1);
    expect(271 * DT).toBeLessThan(CONFIG.broadside.reloadMs); // 13 550 < 18 000
  });

  it('RELOAD: the AUTHORITATIVE ammo tick restores the round on the SCALED clock (exactly 3.75s), not the 5.0s base', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'reload', 5);
    fire(a, 1, SLOT_GUN, 300);
    w.step(); // the shot: pool 1 -> 0, the scaled reload starts
    a.input = { ...a.input!, fireSeq: 0, seq: 2 }; // stop clicking — just let the world tick
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);

    // 74 more ticks == 3700ms elapsed on the reload: still empty.
    for (let i = 0; i < 74; i++) w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    // ONE more (3750ms, EXACTLY — not 3800ms) and the round is BACK. Before
    // the clampStats rounding fix the accumulated scale carried float dust,
    // the scaled reload was a hair over its integer, and the refill took a
    // full extra 50ms tick to cross zero — the actual defect this pin
    // regresses. The base 5000ms clock would still be 25 ticks away, so
    // nothing but the global scale can explain it.
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(1);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(0);
    expect(75 * DT).toBe(CONFIG.gun.reloadMs * 0.75); // 3750 === 3750 — exact, no tick slop
    expect(75 * DT).toBeLessThan(CONFIG.gun.reloadMs); // 3750 < 5000 — the proof
  });

  // ---------- mid-reload renormalization (Eric ruling 2026-08-04) ------------
  // A grant that moves a fitted slot's effective reload rescales that slot's
  // IN-FLIGHT timer by the same ratio, so the progress FRACTION survives the
  // fit. Never a free round: `n` does not move and the scaled timer stays
  // positive. Driven through the real World tick, not effectiveStats.

  /** Fire the gun and let the world tick until the reload is exactly half
   *  spent (5000ms base: the shot tick sets the timer, 50 ticks burn 2500ms). */
  function gunAtHalfReload(w: World, a: ShipRecord): void {
    fire(a, 1, SLOT_GUN, 300);
    w.step(); // the shot: pool 1 -> 0, the full-length reload starts
    a.input = { ...a.input!, fireSeq: 0, seq: 2 }; // stop clicking
    for (let i = 0; i < 50; i++) w.step();
  }

  it('a mid-reload RELOAD grant PRESERVES the progress fraction (half of 5000 -> half of 4750)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(2500); // 50% of the 5000ms base

    w.applyCard(a, 'reload'); // 5000 -> 4750
    expect(a.stats.equipment.gun.reloadMs).toBe(4750);
    // 2500 * (4750/5000) = 2375 — still EXACTLY half remaining, on the new clock.
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(2375);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft / a.stats.equipment.gun.reloadMs).toBe(0.5);
  });

  it('the rescale is NEVER a free round — the pool is untouched and the timer stays positive', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    const nBefore = a.loadout[SLOT_GUN].state!.n;
    w.applyCard(a, 'reload');
    expect(a.loadout[SLOT_GUN].state!.n).toBe(nBefore); // 0 — no round handed out
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeGreaterThan(0);
    // ...and the very next tick does not conjure one either.
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
  });

  it('a mid-reload 5-stack lands the round on the RESCALED clock (~1875ms, not the 2500ms it had left)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    stack(w, a, 'reload', 5); // 5000 -> 3750; half remaining => ~1875ms
    expect(a.stats.equipment.gun.reloadMs).toBe(3750);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeCloseTo(1875, 6);

    // 37 ticks (1850ms): not yet. On the un-rescaled clock 2500ms remained, so
    // nothing but the renormalization can land the round inside 39 ticks.
    for (let i = 0; i < 37; i++) w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    w.step();
    w.step(); // 1950ms: past the rescaled 1875ms remainder
    expect(a.loadout[SLOT_GUN].state!.n).toBe(1);
  });

  it('a card that does not touch reloads leaves every in-flight timer BYTE-identical', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    const before = a.loadout[SLOT_GUN].state!.reloadMsLeft;
    w.applyCard(a, 'armor'); // +25 maxHp, heal-on-grant: ratio 1
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(before);
    w.applyCard(a, 'deckGunBarrel'); // a GUN card whose tier does not move: ratio 1
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(before);
    expect(a.stats.equipment.gun.reloadMs).toBe(CONFIG.gun.reloadMs); // untouched base
  });

  it('the DECK GUN tier step moves the gun clock, and the in-flight timer rescales with it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(2500);
    // The DECK GUN's −5 %/tier half is DERIVED from `equipment.gun.tier` in
    // clampStats, not authored as an effect — so the ladder moves the clock
    // exactly as the global RELOAD ladder does, through the one derivation.
    w.applyCard(a, 'deckGun'); // tier 1 -> 2: 5000 -> 4750
    expect(a.stats.equipment.gun.tier).toBe(2);
    expect(a.stats.equipment.gun.reloadMs).toBe(4750);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(2375); // the fraction survives
  });

  it('an IDLE slot (and a slot filled by this very grant) stays at reloadMsLeft 0', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // nothing fired: every fitted slot is full + idle
    w.applyCard(a, 'navalMines'); // fills the extra slot via freshSlotState
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    stack(w, a, 'reload', 5); // every reload moves; no timer is running
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    expect(a.loadout[SLOT_GUN].state!.n).toBe(a.stats.equipment.gun.maxAmmo);
  });

  // The fire path reads EFFECTIVE stats, never raw CONFIG. Catalog v3 gave the
  // gun a damage writer again (the DECK GUN ladder, +1.25/tier), so the pin
  // asserts BOTH ends of the seam: the base shell carries the CONFIG number,
  // and a laddered one carries the laddered number.
  it('gun damage rides the EFFECTIVE stat — base, and up the DECK GUN ladder', () => {
    const fireOne = (cards: number): { damage: number; contactDamage: number; burstRadius: number; effective: number } => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      stack(w, a, 'deckGun', cards);
      a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
      w.step();
      const [shell] = [...w.shells.values()];
      return { ...shell, effective: a.stats.equipment.gun.damage };
    };
    const base = fireOne(0);
    expect(base.damage).toBe(base.effective);
    expect(base.damage).toBe(CONFIG.gun.damage); // zero cards: effective === base
    expect(base.contactDamage).toBe(CONFIG.gun.contactDamage);
    expect(base.burstRadius).toBe(CONFIG.gun.burstRadius);
    const capped = fireOne(CATALOG['deckGun'].cap);
    expect(capped.damage).toBe(capped.effective);
    expect(capped.damage).toBe(CONFIG.gun.damage + 1.25 * CATALOG['deckGun'].cap); // 15 -> 20
  });

  // TORPEDO SPEED is gone with the v2 torpedo ladder (Story 8.13 authors the
  // heavy torpedo's tiers II–V from catalog-v3 §4). Nothing writes
  // `equipment.heavyTorpedo.speed` this cycle, so what survives is the seam
  // the old pin was really guarding: the launched fish rides the EFFECTIVE
  // speed, and the wire event says it with velocity and nothing else.
  it('the launched fish rides the EFFECTIVE torpedo speed, and ONLY vx/vy carry it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step(); // flush the join spawn
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
    w.step();
    const ev = w.tickEvents.find((e): e is BallisticEvent => e.k === 'torp');
    expect(ev).toBeDefined();
    expect(Math.hypot(ev!.vx, ev!.vy)).toBeCloseTo(a.stats.equipment.heavyTorpedo.speed, 6);
    expect(Math.hypot(ev!.vx, ev!.vy)).toBeCloseTo(CONFIG.torpedo.speed, 6);
    // Constant-free wire shape — the speed rides the velocity, nothing else.
    expect(Object.keys(ev!).sort()).toEqual(['id', 'k', 't', 'vx', 'vy', 'x', 'y']);
  });

  // `mineMax` is DELETED in wave 1, so the "a fit keeps one more mine live"
  // half of this pin is RETIRED. `mine.maxLive` is still a whitelisted stat
  // path with no card behind it (the established shape), so what survives is
  // that the cap is read off the OWNER'S EFFECTIVE STATS rather than CONFIG —
  // asserted against `a.stats.equipment.navalMines.maxLive`, not the constant.
  it("mine maxLive comes from the OWNER's effective stats (no card writes it any more)", () => {
    const SLOT_MINE_ML = 1; // ML fit: [gun, navalMines, radarBuoy, empty]
    const dropMines = (drops: number): number => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, 'mineLayer');
      expect(a.stats.equipment.navalMines.maxLive).toBe(CONFIG.mine.maxLive);
      w.step();
      for (let i = 0; i < drops; i++) {
        a.loadout[SLOT_MINE_ML].state = { n: 1, reloadMsLeft: 0 }; // skip the reload wait
        // Mines are an aimed WEAPON (Story 2.8): each placement is one rear-arc click.
        w.submitInput('a', {
          seq: i + 1, throttle: 0, rudder: 0, aim: Math.PI,
          fireSeq: i + 1, aimDist: 40 + i, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0,
        });
        w.step();
      }
      return w.mines.size;
    };
    const drops = CONFIG.mine.maxLive + 2; // enough to overflow the cap
    expect(dropMines(drops)).toBe(CONFIG.mine.maxLive); // cap holds: oldest evicted
    expect(Object.hasOwn(CATALOG, 'mineMax')).toBe(false);
  });

  it('SPEED: a card-fitted hull out-runs an identical base twin', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, -200);
    place(w, 'base', 0, 200);
    stack(w, up, 'speed', 2); // +2.5 each
    for (let tick = 1; tick <= 200; tick++) {
      w.submitInput('up', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
      w.submitInput('base', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
      w.step();
    }
    expect(w.ships.get('up')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed + 5, 6);
    expect(w.ships.get('base')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed, 6);
  });
});
