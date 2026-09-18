// THE DECK ECONOMY (Story 2.8, amendment 38; re-cut for catalog v3 in Story
// 8.1). Server-side pins for the per-player card deck behind every offer: the
// INTERIM deck composition (Eric ruling 2026-09-15 — every NON-STUB line at
// its cap, identical for every hull; drones never get one), the LAZY
// bank→materialize→fit cycle over the REAL production CATALOG (a draw takes
// nothing; only the FIT thins the deck — the anti-hoarding pin below is the
// regression this model exists for), equipment lines whose copy 1 fits the
// weapon into the first empty weapon slot, heal-on-grant (ARMOR — the ONLY heal path),
// top-up on raised caps (amendment 41), the EMPTY-DRAW rule (Story 8.3, epic-8
// amendment 14: the level still banks, no hand materializes, no `pt` is
// queued, and exhaustion is reported exactly once per record), the AT-CAP
// GUARD (a line the ship already holds at its cap is never offered),
// per-(seed, join-ordinal, draw sequence) determinism, and the intact
// 2.6/2.7 earn/queue/spend/lifecycle/privacy guarantees the deck slots into.

import { describe, it, expect, vi } from 'vitest';
import {
  isAfloat,
  CATALOG,
  CONFIG,
  MULLIGAN_CHOICE,
  CONSUMABLE_SLOTS,
  DEFAULT_DECKS,
  LINE_IDS,
  SLOT_BOOST,
  WEAPON_SLOTS,
  boonStackCount,
  effectiveStats,
  isStubLine,
  loadoutFor,
  slotsWithCards,
  tierTargetOf,
  type BallisticEvent,
  type Catalog,
  type CatalogLine,
  type BoonOffer,
  type ConsumableId,
  type FrameMsg,
  type InputMsg,
  type GameEvent,
  type LineId,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildConsumableRegistry, consumableRow, slotAmmo } from '../game/equipment/index.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';
import { fitClassWeapons } from './classWeapons.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
// NINE FIXED-ROLE SLOTS (Story 8.5): [gun, boost, weapon x3, consumable x4] on
// every captain. A class weapon arrives as a SPAWN SEED card and lands in the
// weapon row first-empty-first, so each hull's FIRST seeded weapon is slot 2.
const SLOT_GUN = 0;
const SLOT_TORPEDO = 2;
/** Battleship fit [gun, boost, broadside, starShells, empty x5]. */
const SLOT_BROADSIDE = 2;

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 1, opts?: WorldOptions): World {
  // 8.11: the MATCH CONSUMABLE POOL is tested in matchPool.test.ts (and by the
  // guard-live pin at the bottom of this file); every deck-DEPTH and offer pin
  // here is about the AUTHORED deck, so this factory deals an EMPTY pool
  // unless the test explicitly asks for one.
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, { pool: [], ...opts });
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  // The hull's DEFAULT deck (Story 8.2): what the door admits with no account
  // module — the frozen 40-id list the World deals the drawable pool from.
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, DEFAULT_DECKS[hull]);
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

/** NOTHING IS HELD AT SPAWN ANY MORE (Story 8.10, FR48, epic-8 amendment 62):
 *  the interim spawn seed — copy 1 of each of a hull's class weapons — is
 *  deleted, so every captain comes up with an EMPTY `cards` list, a gun and the
 *  Shift boost, and the whole list (less stubs) in its pool. The first weapon
 *  is the one taken from the level-zero offer the countdown grants. */
const NO_SEED: readonly string[] = [];
/** Copies of `id` in a fresh torpedoBoat POOL: its default-deck count, whole —
 *  nothing is withheld now that nothing is carried (Story 8.2 + 8.10). */
const poolCopies = (id: string): number =>
  DEFAULT_DECKS.torpedoBoat.filter((x) => x === id).length;
/** A DIRECTED board list for the extra-slot fits: the TB default plus every
 *  copy of NAVAL MINES. Not a legal deck (46 cards, four equipment lines) —
 *  the World checks no legality (the door does), and the TB's own default
 *  holds no unfitted, non-stub equipment line to fit, so the fixture adds
 *  one on purpose. */
const TB_WITH_MINES: readonly LineId[] = [...DEFAULT_DECKS.torpedoBoat, ...new Array<LineId>(CATALOG.navalMines.cap).fill('navalMines')];
/** THE DRAWABLE POOL SIZE for a hull (Story 8.2, amendment 11; Story 8.10):
 *  its 40-card DEFAULT deck less every stub card — and nothing else, now that
 *  the spawn holds no carried copy back. Derived from the ruling's list rather
 *  than restated, so the number moves with the stub flags (8.7–8.15 flip them)
 *  and the PIN is the RULE — and pinned at 27 for all three today. */
const deckSizeFor = (hull: ShipClassId = 'torpedoBoat'): number =>
  DEFAULT_DECKS[hull].filter((id) => !isStubLine(id)).length;

describe('deck composition — the DEFAULT deck through the World (Story 8.2)', () => {
  const HULLS: ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];

  for (const hull of HULLS) {
    it(`${hull}: the frozen default list, the drawable pool = list − stubs − carried (${deckSizeFor(hull)} cards)`, () => {
      const w = bareWorld();
      const rec = place(w, 'a', 0, 0, 0, hull);
      // The FROZEN LIST is stored as given — the shared default identity, 40
      // ids, stubs included (amendment 11) — and is immutable.
      expect(rec.deckList).toBe(DEFAULT_DECKS[hull]);
      expect(rec.deckList).toHaveLength(CONFIG.deck.size);
      expect(Object.isFrozen(rec.deckList)).toBe(true);
      // The POOL is the list less stubs: 27 today (Story 8.8 un-stubbed HULL
      // REPAIR, 3 copies per hull: 23 -> 26; Story 8.10 deleted the one
      // carried copy each hull used to hold back: 26 -> 27).
      expect(rec.deck.cards).toHaveLength(deckSizeFor(hull));
      expect(deckSizeFor(hull)).toBe(27);
      const listed = new Map<string, number>();
      for (const id of rec.deckList) listed.set(id, (listed.get(id) ?? 0) + 1);
      for (const id of LINE_IDS) {
        // A STUB line is authored but unbuilt: it can never be dealt, which is
        // the single point at which "authored" becomes "unofferable". Every
        // other line is dealt WHOLE — Story 8.10 deleted the carried copy.
        expect(copiesInDeck(rec, id), id).toBe(isStubLine(id) ? 0 : (listed.get(id) ?? 0));
      }
      // The deck-gun family and the global RELOAD ladder are universal
      // (amendment 10's 30 shared cards), and no per-equipment reload line
      // survives anywhere.
      expect(copiesInDeck(rec, 'deckGunBarrel')).toBe(2);
      expect(copiesInDeck(rec, 'deckGunTurret')).toBe(1);
      expect(copiesInDeck(rec, 'reload')).toBe(3);
      for (const dead of DEAD_RELOAD_IDS) {
        expect(Object.hasOwn(CATALOG, dead)).toBe(false);
        expect(copiesInDeck(rec, dead)).toBe(0);
      }
    });
  }

  it('the hulls spawn holding NOTHING, and the pool + the stubs is the whole list', () => {
    for (const hull of HULLS) {
      const w = bareWorld();
      const rec = place(w, 'a', 0, 0, 0, hull);
      expect(rec.cards).toEqual(NO_SEED);
      const stubs = rec.deckList.filter((id) => isStubLine(id)).length;
      expect(rec.deck.cards.length + stubs).toBe(CONFIG.deck.size);
    }
  });

  it('a World never chooses a deck: a captain added with NO list gets an EMPTY pool and an empty list', () => {
    const w = bareWorld();
    const bare = w.addShip('bare', 'BARE', 'captain', 'torpedoBoat', undefined, undefined, []);
    expect(bare.deckList).toEqual([]);
    expect(bare.deck.cards).toEqual([]);
    // ...and a level still banks — with no offer (deck exhaustion banks silently).
    w.grantXp(bare, 1);
    expect(bare.bankedLevels).toBe(1);
    expect(bare.offer).toBeNull();
  });

  it('a dev override arrives as a fresh array and is FROZEN on the record', () => {
    const w = bareWorld();
    const list = [...DEFAULT_DECKS.torpedoBoat];
    const rec = w.addShip('o', 'O', 'captain', 'torpedoBoat', undefined, undefined, list);
    expect(rec.deckList).toEqual(list);
    expect(rec.deckList).not.toBe(list);
    expect(Object.isFrozen(rec.deckList)).toBe(true);
    list.push('armor'); // the caller's array is not the record's
    expect(rec.deckList).toHaveLength(CONFIG.deck.size);
  });

  it('DRONES get NO deck and never draw (the frozen empty identity)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined, []);
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
    expect(a.cards).toEqual(NO_SEED);
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

  // THE ONE EXCEPTION IS THE COUNTDOWN MULLIGAN (Story 8.10, FR48, epic-8
  // amendment 60): a hand is drawn once and frozen for its whole life, and the
  // single thing that can ever replace it is the free redraw at the start
  // line — gated on `World.countdownOpen`, which only `Match` ever opens. The
  // sibling test below proves the gate, and mulligan.test.ts owns the matrix.
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

  it('...and the mulligan changes the hand ONLY while the countdown is open', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const before = front(a);
    const held = a.offer;
    // LIVE WATER (the default): the sentinel is refused and the hand is the
    // SAME ARRAY, not merely an equal one.
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBe(held);
    expect(a.mulliganed).toBe(false);
    // THE START LINE: the one legal reroll in the game.
    w.countdownOpen = true;
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    expect(a.offer).not.toBe(held);
    expect(front(a)).not.toEqual(before);
    expect(a.mulliganed).toBe(true);
    expect(a.bankedLevels).toBe(1); // a redraw spends no level
    // ...and it is the ONE redraw: a second press changes nothing at all.
    const second = a.offer;
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBe(second);
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
    expect(buildSize).toBe(deckSizeFor()); // the default build (suite above)
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
    expect(copiesBefore).toBe(poolCopies(passed)); // never left the deck at all
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
    expect(copiesInDeck(a, chosen)).toBe(poolCopies(chosen) - 1); // one copy consumed
    for (const id of offer.slice(1)) {
      expect(copiesInDeck(a, id)).toBe(poolCopies(id)); // untouched
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
    // The list must name the INJECTED lines (Story 8.2: the pool is dealt
    // from the list, and an id the catalog does not know is dropped).
    const list = Object.keys(catalog).flatMap((id) => new Array<LineId>(9).fill(id as LineId));
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, list);
    a.state.speed = 0;
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
    expect(w.spendPoint('a', 0)).toBe(true); // ...and so does the next pick
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
    a.hp -= 40; // damaged, so a -1 rejection is the BOUND and nothing else
    bank(w, a, 1);
    const before = front(a);
    // -1 IS BACK ON THIS LIST (Story 8.8). It was the reserved HEAL_CHOICE
    // sentinel from 2026-08-04 until healing became a card; now every negative
    // is out of the offer bound and malformed again, with no special case.
    for (const junk of [-1, -2, -99, 4, 99, 1.5, NaN, Infinity, '0', 'heal', null, undefined, {}]) {
      expect(w.spendPoint('a', junk)).toBe(false);
    }
    expect(a.bankedLevels).toBe(1);
    expect(front(a)).toEqual(before);
    expect(a.cards).toEqual(NO_SEED);
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

// ---------- HULL REPAIR (the paid heal, now a CARD) --------------------------
//
// The spec's I/O & Edge-Case Matrix, row for row. Since Story 8.8 the heal is
// NOT an always-available menu spend addressed by a reserved wire sentinel: it
// is a consumable LINE you draw, stock in a belt slot, and fire. The BODY is
// unchanged (instant + pool at a fixed rate), so every payout, overflow,
// stacking and lifecycle pin below is the shipped one under its new trigger.
// The card economy around it — the two guards, the one spend, the copy leaving
// `cards` — is pinned beside the row in equipment.test.ts.

const HEALS_OF = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'heal');
const HR = CONFIG.hullRepair;
/** The first belt slot — where a stocked HULL REPAIR lands. */
const SLOT_BELT = CONSUMABLE_SLOTS[0];
/** hp per 50ms tick at the fixed regen rate (50hp / 5000ms = 10 hp/s). */
const REGEN_PER_TICK = (HR.regenHp / HR.regenMs) * DT;

describe('HULL REPAIR — the paid heal as a card (Eric rulings 2026-08-04; Story 8.8)', () => {
  /** Stock `n` copies in the belt and hurt the hull by `missing`. */
  function stock(w: World, a: ShipRecord, n = 1, missing = 0): void {
    for (let i = 0; i < n; i += 1) w.applyCard(a, 'hullRepair');
    if (missing > 0) a.hp = a.stats.maxHp - missing;
  }
  /** Fire the belt slot through the ONE activation path. */
  const press = (w: World, a: ShipRecord): unknown => w.sinkingActivationGate(a, SLOT_BELT);

  it('happy path: instant hp + a pool, ONE copy consumed, self-private heal event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // hull-to-hull neighbour: sighted, and told nothing
    stock(w, a, 2, 75);
    const hpBefore = a.hp;
    expect(press(w, a)).toEqual({ ok: true });
    expect(a.hp).toBe(hpBefore + HR.instantHp);
    expect(a.repairHp).toBe(HR.regenHp);
    expect(a.loadout[SLOT_BELT].state).toEqual({ n: 1, reloadMsLeft: 0 }); // exactly one copy
    w.step();
    expect(HEALS_OF(buildFrame(w, 'a').events)).toEqual([{ k: 'heal', id: 'a' }]);
    expect(HEALS_OF(buildFrame(w, 'b').events)).toEqual([]); // healer-private
  });

  it('the LEVEL economy is untouched: a heal costs no banked level and drops no hand', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    stock(w, a, 1, 50);
    const offerBefore = front(a);
    const deckBefore = [...a.deck.cards];
    expect(press(w, a)).toEqual({ ok: true });
    // Firing a consumable is not a spend: the bank, the live hand and the pool
    // are all exactly where they were. (Buying the CARD cost the level, once.)
    expect(a.bankedLevels).toBe(2);
    expect(front(a)).toEqual(offerBefore);
    expect(a.deck.cards).toEqual(deckBefore);
  });

  it('the pool pays out exactly regenHp over regenMs at the FIXED rate, then stops', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1, 100);
    press(w, a);
    const hpAfterInstant = a.hp;
    const ticks = HR.regenMs / DT;
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.hp).toBeCloseTo(hpAfterInstant + HR.regenHp, 6);
    expect(a.repairHp).toBeCloseTo(0, 9);
    const settled = a.hp;
    for (let i = 0; i < 20; i++) w.step(); // a drained pool never pays again
    expect(a.hp).toBe(settled);
  });

  it('POOLS ADD, the rate never changes: a second copy mid-drain extends, never steepens', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 2, 150);
    press(w, a);
    // Drain 10hp of the pool (the rate's own units), then fire the second copy.
    const ticks = Math.round(10 / REGEN_PER_TICK);
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.repairHp).toBeCloseTo(HR.regenHp - 10, 6);
    const hpAtSecondHeal = a.hp;
    expect(press(w, a)).toEqual({ ok: true });
    expect(a.repairHp).toBeCloseTo(HR.regenHp - 10 + HR.regenHp, 6);
    // THE RATE PIN: the very next tick pays ONE pool's worth of rate, NOT two.
    // Pools ADD, never ACCELERATE — the ratified anti-flask rule.
    w.step();
    expect(a.hp).toBeCloseTo(hpAtSecondHeal + HR.instantHp + REGEN_PER_TICK, 9);
    expect(a.hp).not.toBeCloseTo(hpAtSecondHeal + HR.instantHp + 2 * REGEN_PER_TICK, 9);
  });

  it('FULL HP is rejected fail-closed: the copy stays stocked, the pool untouched, no event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(press(w, a)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.loadout[SLOT_BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(a.cards).toContain('hullRepair');
    expect(a.repairHp).toBe(0);
    w.step();
    expect(HEALS_OF(buildFrame(w, 'a').events)).toEqual([]);
  });

  it('a DEAD hull is rejected — the copy is still aboard for the next life', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1, 50);
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(press(w, a)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.cards).toContain('hullRepair');
    expect(a.repairHp).toBe(0);
    expect(a.hp).toBe(0);
  });

  it('NO stocked copy is refused by the gate before any row runs', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp -= 50; // damaged and alive — only the empty belt can refuse it
    expect(a.loadout[SLOT_BELT]).toEqual({ equipmentId: null, state: null });
    expect(press(w, a)).toEqual({ ok: false, reason: 'empty-slot' });
    expect(a.repairHp).toBe(0);
  });

  it('OVERFLOW IS LOST, not banked: healing at maxHp-1 wastes the instant AND the pool', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1, 1); // damaged enough to pass the guard, by exactly 1hp
    expect(press(w, a)).toEqual({ ok: true });
    expect(a.hp).toBe(a.stats.maxHp); // all but 1 of the instant clamped away
    expect(a.repairHp).toBe(HR.regenHp); // the pool still exists...
    // ...and drains on the WALL CLOCK against a full bar, delivering nothing.
    for (let i = 0; i < HR.regenMs / DT; i++) w.step();
    expect(a.repairHp).toBeCloseTo(0, 9);
    expect(a.hp).toBe(a.stats.maxHp);
  });

  it('STORM OVERLAP nets positive: the pool out-paces the bite, both independent', () => {
    // A collapsed timeline (1ms beats) so the terminal ring is live in one step;
    // the hull sits far outside it and bleeds stormDps for the pool's whole life.
    const w = new World(3, CONFIG.match.fillTo, { beatMs: 1, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 1 });
    w.map.islands.length = 0;
    const a = place(w, 'a', w.map.radius * 0.8, 0);
    w.startZone();
    stock(w, a, 1, 100);
    expect(press(w, a)).toEqual({ ok: true });
    const hpAfterInstant = a.hp;
    const stormPerTick = CONFIG.zone.stormDps * (DT / 1000);
    const ticks = HR.regenMs / DT;
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.repairHp).toBeCloseTo(0, 9);
    // Net over the pool's life = regenHp - stormDps*regenMs. The storm bite
    // also stamps `lastDamagedAt` every tick, so the OUT-OF-COMBAT regen
    // (amendment 47) contributes exactly nothing here — this is the paid pool
    // against the storm and nothing else.
    expect(a.hp).toBeCloseTo(hpAfterInstant + HR.regenHp - stormPerTick * ticks, 6);
    expect(a.hp).toBeGreaterThan(hpAfterInstant); // the pool out-paces the storm
    // ...and once it drains, the storm has the hull to itself again.
    const afterPool = a.hp;
    w.step();
    expect(a.hp).toBeCloseTo(afterPool - stormPerTick, 6);
  });

  it('SINKING mid-drain zeroes the pool — nothing carries through the death gap', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1, 100);
    press(w, a);
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
    stock(w, a, 2, 100);
    press(w, a);
    expect(a.repairHp).toBe(HR.regenHp);
    w.sinkShip('a'); // respawnEnabled (waiting phase) — zeroed here...
    // Story 5.2: revive lands on the founder tick (window > respawn delay).
    const ticks = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2;
    for (let i = 0; i < ticks; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.repairHp).toBe(0); // ...and again on the way back
    // The un-fired copy came back with the build (respawn replays `cards`).
    a.hp = a.stats.maxHp - 100;
    expect(press(w, a)).toEqual({ ok: true });
    expect(a.repairHp).toBe(HR.regenHp);
    w.resetForMatchStart();
    expect(a.repairHp).toBe(0);
  });

  it('the heal NEVER routes through applyBoon: no boon fit, no reload rescale, no free round', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1, 50);
    const statsBefore = a.stats;
    // Put a round in flight so a stray rescaleReloadTimers would be visible.
    fire(a, 1, SLOT_GUN, 300);
    w.step();
    const reloadBefore = a.loadout[SLOT_GUN].state!.reloadMsLeft;
    const ammoBefore = a.loadout[SLOT_GUN].state!.n;
    expect(reloadBefore).toBeGreaterThan(0);
    expect(press(w, a)).toEqual({ ok: true });
    // The spend re-FOLDS `cards` (the copy left the build), but a consumable
    // carries no stat effect, so every derived stat is byte-identical — an
    // EQUAL fold, not the same object, which is exactly the 8.7 contract.
    expect(a.stats).toEqual(statsBefore);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(reloadBefore); // byte-identical
    expect(a.loadout[SLOT_GUN].state!.n).toBe(ammoBefore); // no free round
  });

  it('wire: repairHp rides `you` alone — never a contact, an event, or a spectator frame', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // mutual sight
    stock(w, a, 1, 60);
    press(w, a);
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

  it('the heal IS a card now: `hullRepair` is drawable, and no OTHER repair line exists', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 3);
    expect(CONFIG.offer.size).toBe(4);
    // THE INVERSION OF THE OLD PIN. Until Story 8.8 this asserted that NO deck
    // card matched /heal|repair/ — the strip was addressed by a wire sentinel
    // and was never a card. Now `hullRepair` is exactly that card and must be
    // in the pool; what must still be absent is the retired RAIL, i.e. any
    // `damageControl`-shaped line.
    expect(a.deck.cards).toContain('hullRepair');
    for (const id of a.deck.cards) expect(id).not.toMatch(/damageControl/i);
    for (const id of a.deck.cards) expect(Object.hasOwn(CATALOG, id)).toBe(true);
    const hand = front(a);
    expect(hand).toHaveLength(4);
    for (const id of hand) expect(Object.hasOwn(CATALOG, id)).toBe(true);
    expect(buildFrame(w, 'a').you!.offer).toHaveLength(4);
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

describe('equipment lines — copy 1 fits the weapon into the first EMPTY weapon slot', () => {
  /** A TB holding `extraLevels` more banked levels behind a directed
   *  navalMines front offer (the TB carries no mine, so the fit lands in the
   *  first EMPTY weapon slot — 3, since the seed holds 2). Sails
   *  TB_WITH_MINES so the line is IN the pool. */
  function fitBoard(extraLevels = 0): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, TB_WITH_MINES);
    a.state.speed = 0;
    a.bankedLevels = 1 + extraLevels;
    a.offer = ['navalMines', 'deckGunBarrel', 'armor', 'radarSweep'];
    return { w, a };
  }

  it('the pick installs the equipment LOADED in the first EMPTY weapon slot (full pool)', () => {
    const { w, a } = fitBoard();
    expect(w.spendPoint('a', 0)).toBe(true);
    // Story 8.5 + 8.10: the weapon row starts EMPTY (no spawn seed), so the
    // pick takes slot 2 (Q) — first-empty-first across the row, never a fixed
    // 'extra' slot.
    expect(a.loadout.map((s) => s.equipmentId)).toEqual([
      'gun', 'boost', 'navalMines', null, null, null, null, null, null,
    ]);
    expect(a.loadout[2].state).toEqual({ n: a.stats.equipment.navalMines.maxAmmo, reloadMsLeft: 0 });
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
    expect(a.loadout[3].equipmentId).toBeNull(); // the first empty weapon slot is untouched
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

/** A plain universal ladder line for the injected-catalog boards below: `cap`
 *  identical +1-gun-damage tiers, so a board can say "cap 1" or "cap 9" and
 *  mean only that. */
function ladderLine(id: string, cap = 1): CatalogLine {
  const tier = [{ kind: 'stat', path: 'equipment.gun.damage', add: 1 }];
  return { id, kind: 'ladder', cap, tiers: new Array(cap).fill(tier) } as unknown as CatalogLine;
}

describe('empty deck — the level banks, no hand materializes, and exhaustion is reported ONCE (epic-8 amendment 14)', () => {
  // WHAT THE TITLE USED TO SAY — "pinned unreachable in production" — is no
  // longer true, and Story 8.3 re-derived why. A default deck deals 23 drawable
  // cards; since the lazy-draw bugfix BANKING costs none of them, so the
  // terminal offer-less level arrives after exactly 23 FITS (heals and passes
  // cost no cards). A long match yields roughly 25 levels, so a captain who
  // fits every single level and never heals CAN run dry: reachable, unlikely,
  // and no longer a degenerate case to be waved at. Eric ruling 2026-09-15
  // (epic-8 amendment 14) says what happens when it lands — the level still
  // BANKS, it presents no options, it queues no `pt`, and it stays spendable
  // on the menu heal. The boards below still reach the state with a tiny
  // injected catalog, because 23 real fits is a slow way to say it.
  it('with a one-card injected catalog: the level materializes the last card, and only FITTING it empties the deck', () => {
    const tiny: WorldOptions = { catalog: { lastShell: ladderLine('lastShell') } };
    const w = bareWorld(1, tiny);
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, ['lastShell' as LineId]);
    a.state.speed = 0;
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
    // The offer-less level refuses a CARD pick and simply STAYS BANKED: there
    // is nothing else to spend it on since Story 8.8 retired the heal strip,
    // and a later level retries the draw. That is a hold, not a deadlock.
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(a.bankedLevels).toBe(1);
    // ...and a fresh level against the empty deck emits NO pt (the ratified
    // offer-less-level rule) — it simply banks on top of the one already held.
    w.grantXp(a, 1);
    w.step();
    expect(a.bankedLevels).toBe(2);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('the FIRST empty draw banks the level, shows no hand, emits no pt — and reports exhaustion exactly ONCE however many levels follow', () => {
    const onDeckExhausted = vi.fn();
    // A deck LIST that names nothing: the drawable pool is empty from tick one,
    // which is the terminal state without 23 fits to get there.
    const w = bareWorld(1, { catalog: { dry: ladderLine('dry') }, onDeckExhausted });
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, []);
    a.state.speed = 0;
    expect(a.deck.cards).toEqual([]);
    expect(a.deckExhausted).toBe(false);
    expect(onDeckExhausted).not.toHaveBeenCalled();

    w.grantXp(a, 1);
    w.step();
    // The level BANKS (amendment 14) and the chip counts it...
    expect(a.bankedLevels).toBe(1);
    expect(buildFrame(w, 'a').you!.pts).toBe(1);
    // ...with no hand behind it and NO TAB cue.
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
    // The latch and its ONE report — the ship id, and nothing about the deck.
    expect(a.deckExhausted).toBe(true);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);
    expect(onDeckExhausted).toHaveBeenCalledWith('a');

    // The NEXT level retries the draw, finds the same nothing, banks anyway —
    // and is SILENT: the report is once per record, ever.
    w.grantXp(a, 1);
    w.step();
    expect(a.bankedLevels).toBe(2);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);

    // An offer-less banked level buys NOTHING (Story 8.8 retired the menu
    // heal): a card pick against an empty hand is refused and the bank holds.
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(w.spendPoint('a', 3)).toBe(false);
    expect(a.bankedLevels).toBe(2);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);
  });

  it('a THIN draw is not exhaustion: a one-card hand still materializes, still emits pt, and reports nothing', () => {
    const onDeckExhausted = vi.fn();
    const w = bareWorld(1, { catalog: { lastShell: ladderLine('lastShell') }, onDeckExhausted });
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, ['lastShell' as LineId]);
    a.state.speed = 0;
    w.grantXp(a, 1);
    w.step();
    expect(front(a)).toEqual(['lastShell']); // 1 of a possible CONFIG.offer.size
    expect(ptsOf(w.tickEvents)).toEqual([{ k: 'pt', id: 'a' }]);
    expect(a.deckExhausted).toBe(false);
    expect(onDeckExhausted).not.toHaveBeenCalled();
  });

  it('a REDEPLOY rebuilds the pool from the frozen list but never clears the latch — no second report, ever', () => {
    const onDeckExhausted = vi.fn();
    const w = bareWorld(1, { catalog: { lastShell: ladderLine('lastShell') }, onDeckExhausted });
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, ['lastShell' as LineId]);
    a.state.speed = 0;
    // Fit the only card — the FIT is what empties the pool — then bank a level
    // against the dry deck.
    w.grantXp(a, 1);
    w.step();
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.deck.cards).toEqual([]);
    w.grantXp(a, 1);
    w.step();
    expect(a.deckExhausted).toBe(true);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);

    // THE MATCH BOUNDARY NO LONGER REBUILDS THE POOL (Story 8.10 review, P1):
    // the whole card economy crosses it, so the dry deck stays dry and the
    // banked level stays banked. The LATCH was never part of any rebuild and
    // still is not — which is the thing this case exists to pin.
    w.resetForMatchStart();
    a.state.speed = 0;
    expect(a.deck.cards).toEqual([]);
    expect(a.bankedLevels).toBe(1);
    expect(a.deckExhausted).toBe(true);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);

    // ...so banking against the SAME dry record again is silent.
    w.grantXp(a, 1);
    w.step();
    expect(a.bankedLevels).toBe(2);
    expect(a.offer).toBeNull();
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);
  });

  it('a THROWING exhaustion callback never escapes the tick: the level still banks, the latch is set, no pt, and world.step() does not throw', () => {
    const onDeckExhausted = vi.fn(() => {
      throw new Error('boom');
    });
    const w = bareWorld(1, { catalog: { dry: ladderLine('dry') }, onDeckExhausted });
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, []);
    a.state.speed = 0;
    w.grantXp(a, 1);
    expect(() => w.step()).not.toThrow();
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
    expect(a.deckExhausted).toBe(true);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);
  });
});

// ---------- the at-cap guard -------------------------------------------------

describe('the at-cap guard — materializeOffer passes the ship\'s OWN cards as `held` (Story 8.3)', () => {
  it('a line the ship already holds at its cap is never offered, though the pool still lists a copy', () => {
    // cap 1, so ONE fitted copy is the whole cap. `spare` (cap 9) is the rest
    // of the hand's only other option, which makes the guard's bite visible:
    // unguarded, this draw would return TWO different lines.
    const catalog: Catalog = { hog: ladderLine('hog', 1), spare: ladderLine('spare', 9) };
    const w = bareWorld(5, { catalog });
    const list = ['hog', ...new Array<LineId>(9).fill('spare' as LineId)] as LineId[];
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, list);
    a.state.speed = 0;
    expect(copiesInDeck(a, 'hog')).toBe(1);
    // Reach the cap through the real grant seam. A GRANT is not a spend, so
    // the pool's own copy of `hog` is untouched — held 1, pool 1.
    w.applyCard(a, 'hog');
    expect(a.cards).toEqual(['hog']);
    expect(copiesInDeck(a, 'hog')).toBe(1);

    w.grantXp(a, 1);
    w.step();
    expect(front(a)).toEqual(['spare']); // `hog` is gone from the candidate set
    expect(copiesInDeck(a, 'hog')).toBe(1); // ...and still sitting in the pool
  });

  it('a line held BELOW its cap is untouched — the guard excludes only AT the cap', () => {
    const catalog: Catalog = { hog: ladderLine('hog', 2) };
    const w = bareWorld(5, { catalog });
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, ['hog' as LineId, 'hog' as LineId]);
    a.state.speed = 0;
    w.applyCard(a, 'hog'); // held 1 of 2 — below the cap
    w.grantXp(a, 1);
    w.step();
    expect(front(a)).toEqual(['hog']);
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

  // THE TRUTH FLIPPED (Story 8.10 review, P1): a redeploy is a fresh HULL over
  // the SAME build now, on every path — `hold` governs placement only, and the
  // countdown economy must reach live water in every room (the batch-sim
  // runner and the RL env build a Match without `expectedCaptains`).
  it('redeployShip (match start) PRESERVES the build, the bank, the hand and the deck', () => {
    const w = bareWorld();
    // TB_WITH_MINES: the TB default holds no unfitted non-stub equipment line,
    // so the board adds NAVAL MINES to have a fit that diverges the deck.
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, TB_WITH_MINES);
    a.state.speed = 0;
    // Fit an equipment line so the live deck and the live FIT both diverge
    // hard from a fresh build.
    a.bankedLevels = 1;
    a.offer = ['navalMines', 'deckGunBarrel', 'armor', 'radarSweep'];
    w.spendPoint('a', 0);
    bank(w, a, 2);
    expect(copiesInDeck(a, 'navalMines')).toBe(CATALOG['navalMines'].cap - 1);
    const bankBeforeReset = a.bankedLevels;
    const handBeforeReset = a.offer;
    const poolBeforeReset = [...a.deck.cards];
    w.resetForMatchStart();
    expect(a.cards).toEqual(['navalMines']);
    expect(a.bankedLevels).toBe(bankBeforeReset);
    expect(a.offer).toBe(handBeforeReset); // the same array, never redrawn
    // XP is the ONE thing that still dies at the boundary (Story 2.6).
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
    expect(a.stats).toEqual(effectiveStats(a.cls, ['navalMines']));
    expect(a.loadout.map((s) => s.equipmentId)).toEqual([
      'gun', 'boost', 'navalMines', null, null, null, null, null, null,
    ]);
    // ...on a FRESH clock: the loadout is REBUILT from the kept cards, so no
    // pool is short and nothing is reloading.
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    // The pool is NOT rebuilt: the copy the fit consumed stays consumed.
    expect(a.deckList).toEqual(TB_WITH_MINES);
    expect(a.deck.cards).toEqual(poolBeforeReset);
    expect(copiesInDeck(a, 'navalMines')).toBe(CATALOG['navalMines'].cap - 1);
    expect(a.deck.cards).toHaveLength(deckSizeFor() + CATALOG['navalMines'].cap - 1);
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
    // Key-shaped scan (Story 8.2): the deck-gun family's ids legitimately
    // ride `offer`/`cards`, so the pin is on KEYS — no `deck`, `deckList` or
    // `deckId` key anywhere in the frame (the perception invariant carries
    // the same pin over every random world).
    const text = JSON.stringify(f);
    for (const key of ['"deck"', '"deckList"', '"deckId"']) expect(text).not.toContain(key);
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
    const a = place(w, 'a', 0, 0);
    // THE TUBES ARE A CARD NOW (Story 8.10): the spawn seed is gone, so this
    // fire-path fixture fits the TB's torpedo explicitly — [gun, boost,
    // heavyTorpedo, empty x6], exactly the fit it used to come up with.
    fitClassWeapons(w, a);
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
    const bb = place(w, 'a', 0, 0, 0, 'battleship');
    fitClassWeapons(w, bb); // the class cards, fitted explicitly (Story 8.10)
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
    w.applyCard(a, 'navalMines'); // fills the first empty weapon slot via freshSlotState
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
    fitClassWeapons(w, a); // the tubes are a card (Story 8.10)
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

  // RETIRED AND REPURPOSED (Story 8.4, FR57/AR48). `mineMax` died in wave 1 and
  // `mine.maxLive` — the stat path this case last measured — is now DELETED
  // outright along with every mine cap. What the end-to-end drop loop still
  // earns its keep proving is the OPPOSITE fact: every drop stays on the water.
  it('NO CAP: every mine a Mine Layer drops stays live (no eviction, no ceiling)', () => {
    const SLOT_MINE_ML = 2; // ML fit: [gun, boost, navalMines, empty x6]
    const dropMines = (drops: number): number => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, 'mineLayer');
      fitClassWeapons(w, a); // the rack is a card (Story 8.10)
      expect('maxLive' in a.stats.equipment.navalMines).toBe(false);
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
    const drops = 12; // well past the retired per-player cap of 5
    expect(dropMines(drops)).toBe(drops); // every one of them still on the water
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

// ---------- the stub gate ----------------------------------------------------

// A STUB line is authored in full shape, carries a real `slotFill` on copy 1,
// and has NO module behind it. It is never dealt into a deck, so this is not a
// reachable play path -- it is the structural guarantee that an authored-but-
// unbuilt weapon cannot land in a slot the tick loop would then dispatch, by
// ANY route: a directed call, a stale wire id, a future deck bug. The id must
// not even reach `cards`, because `cards` is what the client and the respawn
// replay both re-derive the loadout from.
describe('STUB lines can never be fitted (server gate + shared replay)', () => {
  it('applyCard on a stub id moves nothing: not cards, not the fit, not the stats', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    const cardsBefore = [...a.cards];
    const fitBefore = a.loadout.map((s) => s.equipmentId);
    const statsBefore = a.stats;
    w.applyCard(a, 'lightTorpedo');
    w.applyCard(a, 'monitor');
    expect(a.cards).toEqual(cardsBefore);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(fitBefore);
    expect(a.stats).toBe(statsBefore);
  });

  it('the respawn replay re-derives the SAME loadout even off a stub id in cards', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    a.cards.push('captiveMines'); // however it got there, it fits nothing
    const fitBefore = a.loadout.map((s) => s.equipmentId);
    w.sinkShip('a');
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(fitBefore);
  });
});

// ---------- the carried seed -------------------------------------------------

// THE SPAWN SEED (review gate, Story 8.1). Copy 1 of an equipment line IS the
// bare weapon, so a hull that spawns with that weapon fitted is already HOLDING
// copy 1. Before this, the deck dealt that copy anyway and the pick was a dead
// card: `slotFill` no-ops against equipment already fitted, so a Torpedo Boat
// could spend a whole level on HEAVY TORPEDO and get nothing at all.
describe('THE SPAWN HOLDS NOTHING — gun + Shift, an empty weapon row (Story 8.10)', () => {
  // THE INTERIM SPAWN SEED IS DELETED (FR48, epic-8 amendment 62). Every hull
  // used to come up holding copy 1 of each of its class weapons, which fitted
  // the weapon and made the deck deal one copy fewer of the line. Now nothing
  // is held, nothing is fitted past the universal [gun, boost], and the whole
  // list (less its 13 stub cards) is dealt: 27 for every hull.
  const HULLS: [ShipClassId, string[]][] = [
    ['torpedoBoat', ['heavyTorpedo']],
    ['battleship', ['broadside', 'starShells']],
    ['mineLayer', ['navalMines']],
  ];

  for (const [hull, formerSeed] of HULLS) {
    it(`${hull} spawns with NO cards, a 27-card pool, and ${JSON.stringify(formerSeed)} still in the deck`, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, hull);
      expect(a.cards).toEqual([]);
      expect(a.deck.cards).toHaveLength(27);
      expect(deckSizeFor(hull)).toBe(27);
      // The line the hull used to hold is dealt WHOLE now — every copy the
      // list carries is in the pool, drawable like any other card.
      for (const id of formerSeed) {
        expect(copiesInDeck(a, id), id).toBe(DEFAULT_DECKS[hull].filter((x) => x === id).length);
      }
      // ...and the fit is the bare universal loadout, byte for byte: gun,
      // Shift boost, seven empty slots. `loadoutFor` IS the spawn now.
      expect(a.stats).toEqual(effectiveStats(a.cls));
      expect(a.loadout).toEqual(loadoutFor(a.stats));
      expect(a.loadout).toEqual(slotsWithCards(a.stats, a.cards));
      for (const i of WEAPON_SLOTS) expect(a.loadout[i]).toEqual({ equipmentId: null, state: null });
      for (const i of CONSUMABLE_SLOTS) expect(a.loadout[i]).toEqual({ equipmentId: null, state: null });
      expect(a.loadout[SLOT_GUN].equipmentId).toBe('gun');
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe('boost');
    });
  }

  it('the FIRST copy of a class line is the bare weapon, fitted into slot 2 (Q)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'heavyTorpedo');
    expect(a.cards).toEqual(['heavyTorpedo']);
    expect(a.loadout[WEAPON_SLOTS[0]].equipmentId).toBe('heavyTorpedo');
    expect(a.stats.equipment.heavyTorpedo.tier).toBe(1);
    // Tier I is the bare weapon (catalog-v3 §4), so copy 1 moves no number.
    expect(a.stats).toEqual(effectiveStats(a.cls, ['heavyTorpedo']));
  });

  it('the NEXT copy is tier II — a real -5% reload step, not a wasted fit', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'heavyTorpedo');
    const before = a.stats.equipment.heavyTorpedo.reloadMs;
    w.applyCard(a, 'heavyTorpedo');
    expect(a.cards).toEqual(['heavyTorpedo', 'heavyTorpedo']);
    expect(a.stats.equipment.heavyTorpedo.tier).toBe(2);
    expect(a.stats.equipment.heavyTorpedo.reloadMs).toBeCloseTo(before * 0.95, 6);
  });

  // THE SPAWN still holds nothing — but a REDEPLOY no longer returns a hull to
  // the spawn state (Story 8.10 review, P1): it keeps the build on every path.
  it('redeployShip (no hold) KEEPS the build; only a fresh ADDSHIP holds nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyCard(a, 'broadside');
    w.applyCard(a, 'armor');
    const pool = [...a.deck.cards];
    w.resetForMatchStart();
    expect(a.cards).toEqual(['broadside', 'armor']);
    expect(a.deck.cards).toEqual(pool); // two copies still spent
    expect(a.stats).toEqual(effectiveStats(a.cls, ['broadside', 'armor']));
    expect(a.loadout[WEAPON_SLOTS[0]].equipmentId).toBe('broadside');
    // A hull that JOINS, by contrast, still comes up with nothing at all.
    const fresh = place(w, 'fresh', 0, 0, 0, 'battleship');
    expect(fresh.cards).toEqual([]);
    expect(fresh.mulliganed).toBe(false);
    expect(fresh.deck.cards).toHaveLength(27);
    expect(fresh.stats).toEqual(effectiveStats(fresh.cls));
    expect(fresh.loadout).toEqual(loadoutFor(fresh.stats));
  });

  it('DRONES still get NO deck, and now no cards to speak of either', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined, []);
    expect(d.deck.cards).toEqual([]);
    expect(d.cards).toEqual([]);
    // A fleet hull fits the GUN ALONE — never the Shift boost (amendment 24).
    expect(d.loadout.map((x) => x.equipmentId)).toEqual(['gun', null, null, null, null, null, null, null, null]);
  });
});


// ---------- THE BELT (Story 8.7) ---------------------------------------------

// STOCK, REFUSE, USE, CLEAR — the whole consumable mechanism, end to end
// through the REAL seams (spendPoint -> settleSpend -> applyCard -> the shared
// fold; submitInput -> the two dispatch channels -> the sinking-activation
// gate). It runs on an INJECTED non-stub catalog and an INJECTED consumable
// registry because PRODUCTION SHIPS NEITHER (Eric ruling 2026-09-17, epic-8
// amendment 41): all five consumable lines stay `stub` and the production
// registry is EMPTY, so nothing here is reachable in play until Story 8.8.
// The production pin — a captain's belt stays [null x4] — is the carried-seed
// board above and equipment.test.ts's registry pins.

/** The private `consumable()` helper of sim/catalog.ts, minus its hard-wired
 *  `stub: true`: `cap` copies, one `stock` per copy. */
function consumableLine(id: ConsumableId, cap = 5): CatalogLine {
  const tiers = Array.from({ length: cap }, () => [{ kind: 'stock', equipmentId: id }]);
  return { id, kind: 'consumable', cap, tiers } as unknown as CatalogLine;
}

describe('the belt — stock, the full-belt refusal, use, and clear-at-zero (Story 8.7)', () => {
  const [B0, B1, B2, B3] = CONSUMABLE_SLOTS;
  /** Four KEY-FIRES lines + the one click-placed line (decoyBuoy is the only
   *  `CONSUMABLE_IS_WEAPON` true, catalog-v3 R1), all NON-STUB. */
  const BELT_CATALOG: Catalog = {
    hullRepair: consumableLine('hullRepair'),
    shieldBlock: consumableLine('shieldBlock'),
    smokeScreen: consumableLine('smokeScreen'),
    chaff: consumableLine('chaff'),
    decoyBuoy: consumableLine('decoyBuoy'),
    gunUp: ladderLine('gunUp', 9), // a non-consumable control line
  };

  /** A World on the belt catalog with ONE key-fires row and ONE `isWeapon` row
   *  (the future decoy's shape). `used` records every effect that ran. */
  function beltWorld(seed = 1): { w: World; used: string[] } {
    const used: string[] = [];
    const rows = [
      consumableRow('hullRepair', () => { used.push('hullRepair'); return { ok: true }; }),
      consumableRow('decoyBuoy', () => { used.push('decoyBuoy'); return { ok: true }; }),
    ];
    const w = bareWorld(seed, { catalog: BELT_CATALOG, consumables: buildConsumableRegistry(rows) });
    return { w, used };
  }

  /** A captain on a DIRECTED deck list (the injected catalog carries none of
   *  the shipped weapon lines, so the spawn seed is empty and `cards` starts
   *  bare — every card below is one this board put there). */
  function placeBelt(w: World, id: string, list: readonly LineId[]): ShipRecord {
    const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined, list);
    rec.state.x = 0;
    rec.state.y = 0;
    rec.state.speed = 0;
    rec.sweepAngle = 0;
    rec.prevSweepAngle = 0;
    return rec;
  }

  /** `n` copies of one line as a deck list. */
  const deckOf = (...ids: ConsumableId[]): LineId[] =>
    ids.flatMap((id) => new Array<LineId>(5).fill(id as LineId));

  /** A complete InputMsg through the REAL wire entry point. */
  function send(w: World, id: string, seq: number, extra: Partial<InputMsg>): void {
    w.submitInput(id, { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...extra });
  }

  // --- stock ---------------------------------------------------------------

  it('a consumable pick STOCKS the first belt slot, leaves the deck, and queues its bn', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    expect(a.cards).toEqual([]);
    const deckBefore = a.deck.cards.length;
    bank(w, a, 1);
    expect(front(a)).toEqual(['hullRepair']); // a one-line deck draws a one-card hand
    expect(w.spendPoint('a', 0)).toBe(true);
    // The stack: one copy, and a timer that is 0 for its whole life.
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 1, reloadMsLeft: 0 } });
    expect(a.cards).toEqual(['hullRepair']);
    // FR46 — a stocked consumable LEAVES the deck on pick, like any other card.
    expect(a.deck.cards).toHaveLength(deckBefore - 1);
    expect(copiesInDeck(a, 'hullRepair')).toBe(4);
    w.step(); // the tick swap is what publishes the queued event
    expect(bnsOf(buildFrame(w, 'a').events)).toEqual([{ k: 'bn', id: 'a', boon: 'hullRepair' }]);
    // The weapon row and the other three belt slots are untouched.
    for (const i of [...WEAPON_SLOTS, B1, B2, B3]) {
      expect(a.loadout[i], String(i)).toEqual({ equipmentId: null, state: null });
    }
  });

  it('a SECOND copy of a held line deepens the SAME stack (n 2), touching no other slot', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    bank(w, a, 2);
    expect(w.spendPoint('a', 0)).toBe(true);
    const state = a.loadout[B0].state; // the identical state object must survive
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.loadout[B0].state).toBe(state);
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 2, reloadMsLeft: 0 } });
    expect(a.cards).toEqual(['hullRepair', 'hullRepair']);
    for (const i of [B1, B2, B3]) expect(a.loadout[i]).toEqual({ equipmentId: null, state: null });
  });

  it('four DISTINCT lines fill the belt 5-8 in pick order; the weapon row never takes one', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']) w.applyCard(a, id);
    expect(CONSUMABLE_SLOTS.map((i) => a.loadout[i].equipmentId)).toEqual([
      'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff',
    ]);
    for (const i of CONSUMABLE_SLOTS) expect(a.loadout[i].state).toEqual({ n: 1, reloadMsLeft: 0 });
    for (const i of WEAPON_SLOTS) expect(a.loadout[i]).toEqual({ equipmentId: null, state: null });
  });

  // --- the refusal ---------------------------------------------------------

  it('a FIFTH line on a full belt is refused BEFORE any mutation — the offer is byte-identical next frame', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('decoyBuoy'));
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']) w.applyCard(a, id);
    bank(w, a, 1);
    w.step(); // publish the banked level's pt...
    w.step(); // ...and let it age out, so the frames below are clean
    expect(bnsOf(buildFrame(w, 'a').events)).toEqual([]);
    expect(ptsOf(buildFrame(w, 'a').events)).toEqual([]);
    expect(front(a)).toEqual(['decoyBuoy']);
    const offerRef = a.offer;
    const offerCopy = [...a.offer!];
    const banked = a.bankedLevels;
    const cards = [...a.cards];
    const deck = [...a.deck.cards];
    const loadout = JSON.parse(JSON.stringify(a.loadout)) as unknown;
    const stats = a.stats;

    expect(w.spendPoint('a', 0)).toBe(false);

    expect(a.offer).toBe(offerRef); // the SAME array, not an equal one
    expect([...a.offer!]).toEqual(offerCopy);
    expect(a.bankedLevels).toBe(banked);
    expect(a.cards).toEqual(cards);
    expect(a.deck.cards).toEqual(deck);
    expect(JSON.parse(JSON.stringify(a.loadout))).toEqual(loadout);
    expect(a.stats).toBe(stats);
    // No event of either kind was queued — this tick or the next.
    w.step();
    const f = buildFrame(w, 'a');
    expect(bnsOf(f.events)).toEqual([]);
    expect(ptsOf(f.events)).toEqual([]);
    // ...and the NEXT frame shows the very same hand.
    expect([...f.you!.offer]).toEqual(offerCopy);
    w.step();
    expect([...buildFrame(w, 'a').you!.offer]).toEqual(offerCopy);
  });

  it('a full belt still takes another copy of a line it ALREADY HOLDS (canStock is held-OR-empty)', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']) w.applyCard(a, id);
    bank(w, a, 1);
    expect(front(a)).toEqual(['hullRepair']);
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 2, reloadMsLeft: 0 } });
  });

  it('a NON-consumable pick is never gated by the belt (a full belt does not refuse a ladder)', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', new Array<LineId>(9).fill('gunUp' as LineId));
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']) w.applyCard(a, id);
    bank(w, a, 1);
    expect(front(a)).toEqual(['gunUp']);
    expect(w.spendPoint('a', 0)).toBe(true);
  });

  // --- the use -------------------------------------------------------------

  it('a use spends ONE copy and removes ONE copy from cards; stats do not move', () => {
    const { w, used } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    w.applyCard(a, 'hullRepair');
    const stats = a.stats;
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: true });
    expect(used).toEqual(['hullRepair']);
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 1, reloadMsLeft: 0 } });
    expect(a.cards).toEqual(['hullRepair']); // one copy left the build
    // A consumable carries no stat effect, so the re-fold moves NOTHING.
    expect(a.stats).toEqual(stats);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, BELT_CATALOG));
    // ...and the shared replay (what respawn/redeploy and the client both run)
    // agrees with the live loadout: a used copy is never restored.
    expect(slotsWithCards(a.stats, a.cards, BELT_CATALOG)).toEqual(a.loadout);
  });

  it('the LAST copy clears the slot in the SAME tick — loadout, slotAmmo and the replay all agree', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: true });
    expect(a.loadout[B0]).toEqual({ equipmentId: null, state: null });
    expect(slotAmmo(a)[B0]).toBeNull();
    expect(a.cards).toEqual([]);
    expect(slotsWithCards(a.stats, a.cards, BELT_CATALOG)).toEqual(a.loadout);
  });

  it('the LAST occurrence goes: a mixed card list keeps its order and loses exactly one copy', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    for (const id of ['hullRepair', 'gunUp', 'hullRepair', 'gunUp']) w.applyCard(a, id);
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: true });
    expect(a.cards).toEqual(['hullRepair', 'gunUp', 'gunUp']);
  });

  it('a used-up line becomes stockable again, and the rebuilt belt shows the REDUCED count', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    w.applyCard(a, 'hullRepair');
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: true }); // 2 -> 1
    // The REBUILD (respawn / redeploy / the client's replay) is this one shared
    // derivation over `cards` — it can only ever show what is still held.
    expect(slotsWithCards(a.stats, a.cards, BELT_CATALOG)[B0]).toEqual({
      equipmentId: 'hullRepair', state: { n: 1, reloadMsLeft: 0 },
    });
    w.applyCard(a, 'hullRepair'); // ...and a fresh copy deepens it again
    expect(a.loadout[B0].state).toEqual({ n: 2, reloadMsLeft: 0 });
  });

  // --- THE BELT IS ALWAYS THE REPLAY (Story 8.7 review patch P1) -----------
  //
  // The client never sees `loadout`: it REPLAYS `OwnShip.cards` through
  // `slotsWithCards`, which packs the belt left-to-right in fit order. So the
  // moment a spent stack clears IN PLACE the two sides hold different keys:
  // the server's `[null, B, C, D]` against the client's `[B, C, D, null]`, and
  // key 2 fires a different line on each side. The server therefore REBUILDS
  // the four belt slots from that same replay after every spend.

  it('a spent-to-zero slot RE-PACKS the belt leftward, exactly as the client replay does', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    for (const id of ['hullRepair', 'shieldBlock', 'shieldBlock', 'smokeScreen', 'chaff']) {
      w.applyCard(a, id);
    }
    expect(CONSUMABLE_SLOTS.map((i) => a.loadout[i].equipmentId)).toEqual([
      'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff',
    ]);
    // The GUN's live pool is the control: weapon slots keep their own state.
    a.loadout[SLOT_GUN].state = { n: 3, reloadMsLeft: 777 };

    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: true }); // hullRepair 1 -> 0

    expect(CONSUMABLE_SLOTS.map((i) => a.loadout[i].equipmentId)).toEqual([
      'shieldBlock', 'smokeScreen', 'chaff', null,
    ]);
    expect(a.loadout[B0].state).toEqual({ n: 2, reloadMsLeft: 0 }); // B's count survives the re-pack
    expect(a.loadout[B3]).toEqual({ equipmentId: null, state: null });
    expect(a.loadout.slice(5)).toEqual(slotsWithCards(a.stats, a.cards, BELT_CATALOG).slice(5));
    expect(slotAmmo(a).slice(5)).toEqual([
      { n: 2, reloadMsLeft: 0 }, { n: 1, reloadMsLeft: 0 }, { n: 1, reloadMsLeft: 0 }, null,
    ]);
    // ...and slots 0-4 were never touched: the gun's live timer is intact.
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 3, reloadMsLeft: 777 });
  });

  it('PROPERTY: after EVERY stock and EVERY use the belt equals the replay, ids and n, and slotAmmo agrees', () => {
    const LINES: ConsumableId[] = ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff'];
    for (let seed = 1; seed <= 24; seed++) {
      // Every one of the four lines gets a row, so any belt key can be pressed.
      const reg = buildConsumableRegistry(LINES.map((id) => consumableRow(id, () => ({ ok: true }))));
      const w = bareWorld(seed, { catalog: BELT_CATALOG, consumables: reg });
      const a = placeBelt(w, 'a', deckOf('hullRepair'));
      let rnd = seed * 2654435761;
      const next = (m: number): number => {
        rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
        return (rnd >>> 8) % m;
      };
      let actSeq = 0;
      for (let step = 0; step < 24; step++) {
        if (next(2) === 0) {
          w.applyCard(a, LINES[next(LINES.length)]); // a STOCK (refused if it cannot land)
        } else {
          actSeq += 1; // a USE — through the real ability channel, as a key press
          send(w, 'a', actSeq, { actSeq, actSlot: CONSUMABLE_SLOTS[next(4)] });
          w.step();
        }
        const replay = slotsWithCards(a.stats, a.cards, BELT_CATALOG);
        const where = `seed ${seed} step ${step} cards ${a.cards.join(',')}`;
        expect(a.loadout.slice(5), where).toEqual(replay.slice(5));
        expect(slotAmmo(a).slice(5), where).toEqual(slotAmmo({ ...a, loadout: replay } as ShipRecord).slice(5));
      }
    }
  });

  // --- ONE SPEND LAW (Story 8.7 review patch P2) ---------------------------

  it('a DENIED effect costs NOTHING at the gate: n, cards and the slot are all untouched', () => {
    const denying = buildConsumableRegistry([
      consumableRow('hullRepair', () => ({ ok: false, reason: 'blocked' })),
    ]);
    const w = bareWorld(1, { catalog: BELT_CATALOG, consumables: denying });
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    const cards = [...a.cards];
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 1, reloadMsLeft: 0 } });
    expect(a.cards).toEqual(cards); // no `{n:0}` zombie, no copy refunded on respawn
    expect(slotsWithCards(a.stats, a.cards, BELT_CATALOG)).toEqual(a.loadout);
    // ...and the copy is still there to try again with.
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  // --- NO PHANTOM COPIES (Story 8.7 review patch P4) -----------------------

  it('a DIRECTED applyCard of a fifth line on a full belt changes nothing at all', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']) w.applyCard(a, id);
    const cards = [...a.cards];
    const loadout = JSON.parse(JSON.stringify(a.loadout)) as unknown;
    const stats = a.stats;

    w.applyCard(a, 'decoyBuoy'); // the fifth LINE: nowhere to go

    // The copy never entered `cards` — a card no slot holds would ride the wire
    // and the client's replay would conjure a stack the server does not have.
    expect(a.cards).toEqual(cards);
    expect(JSON.parse(JSON.stringify(a.loadout))).toEqual(loadout);
    expect(a.stats).toBe(stats);
    expect(slotsWithCards(a.stats, a.cards, BELT_CATALOG)).toEqual(a.loadout);
    // ...while a line the belt ALREADY HOLDS still lands.
    w.applyCard(a, 'chaff');
    expect(a.loadout[B3].state).toEqual({ n: 2, reloadMsLeft: 0 });
  });

  it('SINKING policy is unchanged: a belt slot activates while going down', () => {
    const { w, used } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    a.lifecycle = { kind: 'sinking', since: w.now };
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: true });
    expect(used).toEqual(['hullRepair']);
    // ...while the ECONOMY stays closed to a sinking hull (amendment 10).
    a.bankedLevels = 1;
    expect(w.spendPoint('a', 0)).toBe(false);
  });

  // --- the two channels ----------------------------------------------------

  it('a KEY-FIRES consumable rides actSeq/actSlot; the click channel ignores it', () => {
    const { w, used } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    w.applyCard(a, 'hullRepair');
    // A CLICK naming the belt slot is inert — the weapon-only wall.
    send(w, 'a', 1, { fireSeq: 1, slot: B0, aimDist: 100 });
    w.step();
    expect(used).toEqual([]);
    expect(a.loadout[B0].state).toEqual({ n: 2, reloadMsLeft: 0 });
    // The PRESS activates it.
    send(w, 'a', 2, { actSeq: 1, actSlot: B0 });
    w.step();
    expect(used).toEqual(['hullRepair']);
    expect(a.loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(a.cards).toEqual(['hullRepair']);
  });

  it('an isWeapon consumable (the decoy shape) rides input.slot on the CLICK channel; the ability channel ignores it', () => {
    const { w, used } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('decoyBuoy'));
    w.applyCard(a, 'decoyBuoy');
    w.applyCard(a, 'decoyBuoy');
    // A PRESS naming the belt slot is inert — the ability-only wall.
    send(w, 'a', 1, { actSeq: 1, actSlot: B0 });
    w.step();
    expect(used).toEqual([]);
    expect(a.loadout[B0].state).toEqual({ n: 2, reloadMsLeft: 0 });
    // The CLICK activates it.
    send(w, 'a', 2, { fireSeq: 1, slot: B0, aimDist: 100 });
    w.step();
    expect(used).toEqual(['decoyBuoy']);
    expect(a.loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  it('pressing a CLEARED belt slot yields the server-internal empty-slot, never a wired denial (amendment 26)', () => {
    const { w, used } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    send(w, 'a', 1, { actSeq: 1, actSlot: B0 });
    w.step();
    expect(used).toEqual(['hullRepair']);
    expect(a.loadout[B0]).toEqual({ equipmentId: null, state: null }); // cleared at zero
    // The second press finds nothing: no row runs, and NOTHING reaches the wire.
    send(w, 'a', 2, { actSeq: 2, actSlot: B0 });
    w.step();
    expect(used).toEqual(['hullRepair']);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    // ...and the gate's own answer stays server-internal.
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: false, reason: 'empty-slot' });
    expect('denied' in buildFrame(w, 'a')).toBe(false);
  });

  it('a belt slot whose line has NO row fails closed at the gate', () => {
    // Story 8.8 gave HULL REPAIR a row, so the UNBUILT subject is one of the
    // four lines still waiting for its story. The injected catalog un-stubs it
    // so it can be stocked at all; production CONSUMABLES has no row for it.
    const w = bareWorld(1, { catalog: BELT_CATALOG });
    const a = placeBelt(w, 'a', deckOf('chaff'));
    w.applyCard(a, 'chaff');
    expect(a.loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 }); // stocked...
    expect(w.sinkingActivationGate(a, B0)).toEqual({ ok: false, reason: 'empty-slot' }); // ...but inert
    expect(a.loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 }); // nothing spent
  });

  // --- the belt is not a pool ----------------------------------------------

  it('a stat card never reconciles or rescales a belt slot (no cap, no timer)', () => {
    const { w } = beltWorld();
    const a = placeBelt(w, 'a', deckOf('hullRepair'));
    w.applyCard(a, 'hullRepair');
    w.applyCard(a, 'hullRepair');
    for (let i = 0; i < 9; i++) w.applyCard(a, 'gunUp'); // moves gun stats + cooldowns
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 2, reloadMsLeft: 0 } });
    for (let i = 0; i < 20; i++) w.step();
    expect(a.loadout[B0]).toEqual({ equipmentId: 'hullRepair', state: { n: 2, reloadMsLeft: 0 } });
  });
});

// ---------- the at-cap guard is LIVE (Story 8.11) ----------------------------
//
// Until the match pool existed, every door-admitted deck held each line at or
// under its catalog cap, so `drawOffer`'s at-cap guard was provably IDLE: a
// ship could never hold `cap` copies of a line the deck still had copies of.
// The pool is the first thing that can push a line's copies PAST its cap (HULL
// REPAIR: three authored + five pooled = eight, against a cap of five), and
// R44 rules those copies DEAD BY DESIGN — a ship holding `cap` is never
// offered the line again, however many copies the deck still carries. This is
// the pin that says so at World level, and the reason the batch-sim deck
// economy now draws with `{ held }` too.

describe('the at-cap guard with a match pool (Story 8.11)', () => {
  const FIVE_REPAIRS: readonly LineId[] = ['hullRepair', 'hullRepair', 'hullRepair', 'hullRepair', 'hullRepair'];

  it('a captain holding CAP copies is never offered the line again, with copies still in the deck', () => {
    const w = bareWorld(5, { pool: FIVE_REPAIRS });
    const a = place(w, 'a', 0, 0);
    // Three authored + five pooled: the deck is over cap, which is the state
    // only the pool can produce.
    expect(copiesInDeck(a, 'hullRepair')).toBe(poolCopies('hullRepair') + FIVE_REPAIRS.length);
    expect(copiesInDeck(a, 'hullRepair')).toBeGreaterThan(CATALOG.hullRepair.cap);
    // Fit the line to its cap through the real grant seam.
    stack(w, a, 'hullRepair', CATALOG.hullRepair.cap);
    expect(boonStackCount(a.cards, 'hullRepair')).toBe(CATALOG.hullRepair.cap);
    // Now draw hand after hand: the line is dead, the deck still holds it.
    for (let i = 0; i < 12; i += 1) {
      bank(w, a, 1);
      w.step();
      expect(front(a)).not.toContain('hullRepair');
      expect(w.spendPoint(a.id, 0)).toBe(true);
    }
    expect(copiesInDeck(a, 'hullRepair')).toBeGreaterThan(0); // dead, not consumed
  });

  it('...and BELOW the cap the pooled copies are ordinary cards: the line is still offered', () => {
    // The discriminating negative — without it the pin above would pass on a
    // World that simply never offers HULL REPAIR at all.
    const w = bareWorld(5, { pool: FIVE_REPAIRS });
    const a = place(w, 'a', 0, 0);
    let offered = false;
    for (let i = 0; i < 12 && !offered; i += 1) {
      bank(w, a, 1);
      w.step();
      offered = front(a).includes('hullRepair');
      expect(w.spendPoint(a.id, 0)).toBe(true);
    }
    expect(offered).toBe(true);
  });
});
