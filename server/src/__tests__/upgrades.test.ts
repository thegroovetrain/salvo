// THE DECK ECONOMY (Story 2.8, amendment 38 — this suite replaced the legacy
// upgrade-economy suite wholesale in the 2.8 strip). Server-side pins for the
// per-player card deck behind every offer: deck composition per hull (drones
// never get one), the draw→bank→spend→return cycle over the REAL production
// BOON_CATALOG, the acquisition purge + banked-offer scrub (amendment 43),
// free doctrine swaps with the rival's card returning to the deck (amendment
// 44), heal-on-grant (shipHull — the ONLY heal path), top-up on raised caps
// (amendment 41), the empty-deck no-bank rule (pinned unreachable in
// production via an injected tiny catalog), per-(seed, join-ordinal, draw
// sequence) determinism, and the intact 2.6/2.7 earn/queue/spend/lifecycle/
// privacy guarantees the deck slots into.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  boonStackCount,
  effectiveStats,
  isAcquisitionDef,
  type BallisticEvent,
  type BlipEvent,
  type BoonOffer,
  type FrameMsg,
  type GameEvent,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const SLOT_GUN = 0;
const SLOT_TORPEDO = 1;

function bareWorld(seed = 1, opts?: WorldOptions): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = brg - halfWidth;
  me.sweepAngle = brg + halfWidth;
}

/** Stack `count` copies of one catalog line through the real grant seam. */
function stack(w: World, ship: ShipRecord, boonId: string, count: number): void {
  for (let i = 0; i < count; i++) w.applyBoon(ship, boonId);
}

/** Bank `n` levels through the real XP seam (each banks one deck-drawn offer). */
function bank(w: World, ship: ShipRecord, n: number): void {
  for (let i = 0; i < n; i++) w.grantXp(ship, 1);
}

/** Occurrences of `id` in a deck's card multiset. */
function copiesInDeck(ship: ShipRecord, id: string): number {
  return boonStackCount(ship.deck.cards, id);
}

const bnsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'bn');
const ptsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'pt');
const blipsOf = (f: FrameMsg) => f.events.filter((e): e is BlipEvent => e.k === 'blip');
const ballisticsOf = (f: FrameMsg) =>
  f.events.filter((e): e is BallisticEvent => e.k === 'shell' || e.k === 'torp');

// ---------- deck composition -------------------------------------------------

describe('deck composition — buildDeck over the fresh fit (spec I/O matrix)', () => {
  // Per-hull expected line totals against the production catalog: universal
  // (guns 13 + intel 15 + ship 10 = 38) + carried subdecks + ONE acquisition
  // card per absent equipment.
  const CASES: [ShipClassId, number, string[]][] = [
    // TB: torpedo 17 + boost 10 + acquisitions (mine/cannon/star/decoy) 4 = 69.
    ['torpedoBoat', 38 + 17 + 10 + 4, ['acquireMine', 'acquireCannon', 'acquireStarShells', 'acquireDecoy']],
    // BS: cannon 17 + starShells 17 + acquisitions (torpedo/mine/decoy/boost) 4 = 76.
    ['battleship', 38 + 17 + 17 + 4, ['acquireTorpedo', 'acquireMine', 'acquireDecoy', 'acquireBoost']],
    // ML: mine 27 + decoy 10 + acquisitions (torpedo/cannon/star/boost) 4 = 79.
    ['mineLayer', 38 + 27 + 10 + 4, ['acquireTorpedo', 'acquireCannon', 'acquireStarShells', 'acquireBoost']],
  ];

  for (const [hull, total, acquisitions] of CASES) {
    it(`${hull}: universal + carried subdecks + exactly the absent-equipment acquisitions (${total} cards)`, () => {
      const w = bareWorld();
      const rec = place(w, 'a', 0, 0, 0, hull);
      expect(rec.deck.cards).toHaveLength(total);
      expect(rec.deck.levelsSinceRare).toBe(0);
      for (const id of acquisitions) expect(copiesInDeck(rec, id)).toBe(1);
      // Acquisition cards for CARRIED equipment never enter the deck — the
      // slotFill already-fitted no-op stays production-unreachable (pinned).
      for (const id of Object.keys(BOON_CATALOG)) {
        if (!isAcquisitionDef(BOON_CATALOG[id])) continue;
        if (!acquisitions.includes(id)) expect(copiesInDeck(rec, id)).toBe(0);
      }
      // Copy counts mirror the catalog for every present line.
      expect(copiesInDeck(rec, 'gunDamage')).toBe(5);
      expect(copiesInDeck(rec, 'gunTurret')).toBe(1);
    });
  }

  it('DRONES get NO deck and never draw (the frozen empty identity)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', true, 'droneSmall');
    expect(d.deck.cards).toEqual([]);
    // Even a direct XP grant banks nothing for a drone (the addXpMs guard).
    w.grantXp(d, 5);
    expect(d.level).toBe(0);
    expect(d.offers).toEqual([]);
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
    expect(a.offers).toHaveLength(1);
    expect(a.offers[0]).toHaveLength(CONFIG.offer.size); // 4 lines from a healthy deck
    expect(new Set(a.offers[0]).size).toBe(CONFIG.offer.size); // all DIFFERENT lines
    expect(a.deck.cards).toHaveLength(deckBefore - CONFIG.offer.size); // drawn cards left the deck
    expect(a.level).toBe(1);
    // Earning applies NOTHING: the build and cached stats are the zero-boon identity.
    expect(a.boons).toEqual([]);
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
    expect(a.offers).toEqual([]);
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('a self-kill banks nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step();
    w.sinkShip('a', 'a');
    w.step();
    expect(a.offers).toEqual([]);
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
    w.sinkShip('a', 'b'); // a dies first...
    w.sinkShip('b', 'a'); // ...but its torpedo still lands
    w.step();
    expect(a.offers).toHaveLength(1);
    expect(a.level).toBe(1); // kill XP is NOT alive-gated (Story 2.6)
    expect(a.alive).toBe(false);
    expect(a.hp).toBe(0); // earning is inert — a corpse banks, nothing heals
  });
});

// ---------- determinism ------------------------------------------------------

describe('deck determinism — (mapSeed, join ordinal, draw sequence)', () => {
  it('same seed + same join order + same draws ⇒ identical offers', () => {
    const run = (): BoonOffer[] => {
      const w = bareWorld(42);
      const a = place(w, 'a', 0, 0);
      place(w, 'b', 100, 0);
      bank(w, a, 3);
      return [...a.offers];
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

    expect(a2.offers).toEqual(a1.offers); // a's stream is its own
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

    expect(a2.offers).toEqual(a1.offers);
  });
});

// ---------- the queue + spend cycle ------------------------------------------

describe('offer queue — FIFO, front on the wire, reroll-proof', () => {
  it('3 banked levels queue 3 offers; spend applies exactly the FRONT slot, then surfaces the next', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 3);
    expect(a.offers).toHaveLength(3);
    const [first, second] = [a.offers[0], a.offers[1]];
    const pick = first[2];
    expect(w.spendPoint('a', 2)).toBe(true);
    expect(a.boons).toEqual([pick]);
    expect(a.offers).toHaveLength(2);
    expect(a.offers[0]).toEqual(second); // the next queued offer slides forward untouched
    const f = buildFrame(w, 'a');
    expect(f.you!.pts).toBe(2);
    expect(f.you!.offer).toEqual([...second]);
  });

  it('the front offer is reroll-proof: identical across consecutive frames with no spend', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const before = [...buildFrame(w, 'a').you!.offer];
    w.step();
    w.step();
    expect([...buildFrame(w, 'a').you!.offer]).toEqual(before);
    expect(a.offers).toHaveLength(1);
  });

  it('spend RETURNS the unchosen cards to the deck; the chosen card is consumed', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const offer = [...a.offers[0]];
    const deckBefore = a.deck.cards.length;
    expect(w.spendPoint('a', 0)).toBe(true);
    // 3 of the 4 drawn cards came back; the fitted card is gone for good.
    expect(a.deck.cards).toHaveLength(deckBefore + offer.length - 1);
    const chosen = offer[0];
    expect(copiesInDeck(a, chosen)).toBe(BOON_CATALOG[chosen].copies - 1); // one copy consumed
    for (const id of offer.slice(1)) {
      expect(copiesInDeck(a, id)).toBe(BOON_CATALOG[id].copies - boonStackCount(a.boons, id));
    }
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
    bank(w, a, 1);
    const before = [...a.offers[0]];
    for (const junk of [-1, 4, 99, 1.5, NaN, Infinity, '0', null, undefined, {}]) {
      expect(w.spendPoint('a', junk)).toBe(false);
    }
    expect(a.offers).toHaveLength(1);
    expect([...a.offers[0]]).toEqual(before);
    expect(a.boons).toEqual([]);
  });

  it('a valid slot FITS the boon, recomputes stats, and emits a self-private bn', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    bank(w, a, 1);
    const pick = a.offers[0][1];
    expect(w.spendPoint('a', 1)).toBe(true);
    w.step();
    expect(a.boons).toEqual([pick]);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.boonDefs));
    expect(bnsOf(buildFrame(w, 'a').events)).toEqual([{ k: 'bn', id: 'a', boon: pick }]);
    expect(bnsOf(buildFrame(w, 'b').events)).toEqual([]); // spender-private
  });

  it('digit 4 (choice 3) is LIVE against the four-card production offer', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    expect(a.offers[0]).toHaveLength(4);
    const pick = a.offers[0][3];
    expect(w.spendPoint('a', 3)).toBe(true);
    expect(a.boons).toEqual([pick]);
  });

  it('levels ARE spendable while dead (builds persist across respawn)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(a.alive).toBe(false);
    const pick = a.offers[0][0];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.boons).toEqual([pick]);
    expect(a.offers).toEqual([]);
  });
});

// ---------- acquisitions -----------------------------------------------------

describe('acquisitions — R fills once, purge + scrub (amendments 38/41/43)', () => {
  /** A TB with a directed acquireMine offer at the queue front. */
  function acquisitionBoard(extraOffers: string[][] = []): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.offers.push(['acquireMine', 'gunDamage', 'shipHull', 'intelSweep']);
    for (const o of extraOffers) a.offers.push(o);
    return { w, a };
  }

  it('the pick installs the equipment LOADED in the extra slot (full pool)', () => {
    const { w, a } = acquisitionBoard();
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', 'mine']);
    expect(a.loadout[3].state).toEqual({ n: a.stats.mine.maxAmmo, reloadMsLeft: 0 });
  });

  it('the acquired subdeck shuffles in and EVERY remaining acquisition card purges — R can never fill again', () => {
    const { w, a } = acquisitionBoard();
    expect(copiesInDeck(a, 'mineDamage')).toBe(0); // no mine lines before the fit
    expect(w.spendPoint('a', 0)).toBe(true);
    // The mine subdeck joined the pool at catalog copy counts.
    expect(copiesInDeck(a, 'mineDamage')).toBe(5);
    expect(copiesInDeck(a, 'mineSelfPropelled')).toBe(1);
    // Every acquisition card is GONE from the deck — permanently.
    for (const id of Object.keys(BOON_CATALOG)) {
      if (isAcquisitionDef(BOON_CATALOG[id])) expect(copiesInDeck(a, id)).toBe(0);
    }
  });

  it('banked offers SCRUB their dead acquisition cards and refill to size from the deck (amendment 43)', () => {
    const { w, a } = acquisitionBoard([
      ['acquireCannon', 'gunReload', 'shipSpeed', 'intelRadar'], // holds a now-dead acquisition
      ['gunDamage', 'torpedoDamage', 'intelTruesight', 'boostMax'], // acquisition-free: untouched
    ]);
    const untouched = [...a.offers[2]];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.offers).toHaveLength(2);
    const scrubbed = a.offers[0];
    expect(scrubbed).toHaveLength(4); // refilled back to its prior size
    expect([...scrubbed.slice(0, 3)]).toEqual(['gunReload', 'shipSpeed', 'intelRadar']); // kept cards keep identity + order
    expect(isAcquisitionDef(BOON_CATALOG[scrubbed[3]])).toBe(false); // the refill can never be an acquisition
    expect(scrubbed).not.toContain('acquireCannon');
    expect([...a.offers[1]]).toEqual(untouched); // acquisition-free offers are byte-identical
  });

  it('the scrub refill is deterministic on the player’s own stream (twin worlds agree)', () => {
    const run = (): BoonOffer[] => {
      const { w, a } = acquisitionBoard([['acquireCannon', 'gunReload', 'shipSpeed', 'intelRadar']]);
      w.spendPoint('a', 0);
      return [...a.offers];
    };
    expect(run()).toEqual(run());
  });
});

// ---------- doctrine swaps ---------------------------------------------------

describe('doctrine swap — free replace, rival card returns, ping-pong (amendment 44)', () => {
  it('fitting the rival removes ONE occurrence of the held doctrine and returns its card to the deck', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // Take the homing card out of the deck the way a real draw would, then fit it.
    a.offers.push(['torpedoHoming', 'gunDamage', 'shipHull', 'intelSweep']);
    a.deck = { cards: a.deck.cards.filter((c) => c !== 'torpedoHoming'), levelsSinceRare: 0 };
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.boons).toEqual(['torpedoHoming']);
    expect(a.stats.torpedo.mode).toBe('homing');
    expect(copiesInDeck(a, 'torpedoHoming')).toBe(0); // held — its only copy is out of the pool
    // Now the rival is drawn and picked: a free swap.
    a.offers.push(['torpedoCommand', 'gunDamage', 'shipHull', 'intelSweep']);
    a.deck = { cards: a.deck.cards.filter((c) => c !== 'torpedoCommand'), levelsSinceRare: 0 };
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.boons).toEqual(['torpedoCommand']); // the homing id LEFT boons
    expect(a.stats.torpedo.mode).toBe('command');
    expect(copiesInDeck(a, 'torpedoHoming')).toBe(1); // the rival's card is BACK in the deck
    expect(copiesInDeck(a, 'torpedoCommand')).toBe(0);
  });

  it('doctrine can ping-pong across a match; stat stacks apply under either doctrine', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'torpedoDamage', 2); // stat stacks fitted first
    w.applyBoon(a, 'torpedoHoming');
    expect(a.stats.torpedo.mode).toBe('homing');
    expect(a.stats.torpedo.damage).toBe(CONFIG.torpedo.damage + 4);
    w.applyBoon(a, 'torpedoCommand'); // swap...
    expect(a.boons).toEqual(['torpedoDamage', 'torpedoDamage', 'torpedoCommand']);
    expect(a.stats.torpedo.mode).toBe('command');
    w.applyBoon(a, 'torpedoHoming'); // ...and back (ping-pong legal)
    expect(a.boons).toEqual(['torpedoDamage', 'torpedoDamage', 'torpedoHoming']);
    expect(a.stats.torpedo.mode).toBe('homing');
    expect(a.stats.torpedo.damage).toBe(CONFIG.torpedo.damage + 4); // stacks survive every swap
  });
});

// ---------- heal-on-grant + capacity raises ----------------------------------

describe('grant-time effects — healOnGrant and raised-cap top-ups', () => {
  it('shipHull heals exactly the granted maxHp delta, clamped to the new cap (spec matrix row)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const baseMax = a.stats.maxHp;
    a.hp = baseMax - 50;
    w.applyBoon(a, 'shipHull'); // +20 maxHp, healOnGrant
    expect(a.stats.maxHp).toBe(baseMax + 20);
    expect(a.hp).toBe(baseMax - 50 + 20); // healed by the delta, not to full
    // Near-full: the heal is still exactly the delta (the raise moves the cap
    // by the same amount, so the defensive clamp can never bind for shipHull —
    // hp tracks the same distance below the new cap).
    a.hp = a.stats.maxHp - 5;
    w.applyBoon(a, 'shipHull');
    expect(a.hp).toBe(a.stats.maxHp - 5);
    expect(a.hp).toBeLessThanOrEqual(a.stats.maxHp); // never above the cap
  });

  it('a DEAD hull does not heal on a shipHull fit (respawn restores full effective hp anyway)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.applyBoon(a, 'shipHull');
    expect(a.hp).toBe(0);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 20); // the cap still moved
  });

  it('a NON-heal fit never heals (only shipHull carries healOnGrant in v1)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = 40;
    w.applyBoon(a, 'gunDamage');
    expect(a.hp).toBe(40);
  });

  it('AFT TURRET (gunTurret): the gun pool cap rises to 2 AND fills immediately (amendment 41)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
    w.applyBoon(a, 'gunTurret');
    expect(a.stats.gun.maxAmmo).toBe(2); // the single-shot pin is deliberately retired
    expect(a.loadout[SLOT_GUN].state!.n).toBe(2); // topped to the new cap — arrives loaded
  });

  it('SECOND TUBE (torpedoTube): mid-reload empty tubes fill to the raised cap immediately', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: 9000 };
    w.applyBoon(a, 'torpedoTube');
    expect(a.stats.torpedo.maxAmmo).toBe(2);
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(2); // everything arrives loaded
  });
});

// ---------- empty deck -------------------------------------------------------

describe('empty deck — level increments, NO offer banks (pinned unreachable in production)', () => {
  it('with a one-card injected catalog: the first level banks the last card, the second banks NOTHING and emits no pt', () => {
    // Production decks are 69+ cards — a match can never exhaust one. The rule
    // is still DEFINED: reach it with a tiny catalog (one universal line, one
    // copy).
    const tiny: WorldOptions = {
      boonCatalog: {
        lastShell: { id: 'lastShell', category: 'guns', rarity: 'common', copies: 1, effects: [{ kind: 'stat', path: 'gun.damage', add: 1 }] },
      },
    };
    const w = bareWorld(1, tiny);
    const a = place(w, 'a', 0, 0);
    expect(a.deck.cards).toEqual(['lastShell']);
    w.grantXp(a, 1);
    w.step();
    expect(a.level).toBe(1);
    expect(a.offers).toEqual([['lastShell']]); // a thin deck draws a short offer
    expect(a.deck.cards).toEqual([]);
    expect(ptsOf(w.tickEvents)).toEqual([{ k: 'pt', id: 'a' }]);
    // The deck is now EMPTY: the next level still increments but banks nothing
    // — and must NOT advertise TAB-to-refit (no pt event).
    w.grantXp(a, 1);
    w.step();
    expect(a.level).toBe(2);
    expect(a.offers).toHaveLength(1); // unchanged — nothing banked
    expect(ptsOf(w.tickEvents)).toEqual([]);
    expect(buildFrame(w, 'a').you!.pts).toBe(1); // pts === offers.length holds throughout
  });
});

// ---------- lifecycle --------------------------------------------------------

describe('economy lifecycle — respawn preserves, redeploy wipes', () => {
  it('respawn (waiting phase) PRESERVES the build: boons, stats, effective hp + pools, deck, offers, XP', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'shipHull', 2);
    bank(w, a, 2);
    w.grantXp(a, 0.5); // partial progress toward the next level
    const deckBefore = [...a.deck.cards];
    const offersBefore = a.offers.map((o) => [...o]);
    const xpBefore = a.xpMs;
    w.sinkShip('a');
    for (let i = 0; i < Math.ceil(CONFIG.ship.respawnDelay / DT) + 1; i++) w.step();
    expect(a.alive).toBe(true);
    expect(a.boons).toEqual(['shipHull', 'shipHull']);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 40);
    expect(a.hp).toBe(a.stats.maxHp); // full EFFECTIVE hp
    expect(a.deck.cards).toEqual(deckBefore);
    expect(a.offers.map((o) => [...o])).toEqual(offersBefore);
    expect(a.level).toBe(2);
    // Passive XP kept ticking through the respawn steps — never reset.
    expect(a.xpMs).toBeGreaterThanOrEqual(xpBefore);
  });

  it('redeployShip (match start) WIPES the build AND rebuilds the deck over the fresh fit', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // Fit an acquisition so the live deck diverges hard from a fresh build.
    a.offers.push(['acquireMine', 'gunDamage', 'shipHull', 'intelSweep']);
    w.spendPoint('a', 0);
    bank(w, a, 2);
    expect(copiesInDeck(a, 'mineDamage')).toBeGreaterThan(0);
    w.resetForMatchStart();
    expect(a.boons).toEqual([]);
    expect(a.offers).toEqual([]);
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
    expect(a.stats).toEqual(effectiveStats(a.cls));
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
    // The fresh deck is the fresh-fit composition: mine lines gone, the
    // absent-equipment acquisitions back.
    expect(copiesInDeck(a, 'mineDamage')).toBe(0);
    expect(copiesInDeck(a, 'acquireMine')).toBe(1);
    expect(a.deck.cards).toHaveLength(69); // the TB composition (suite above)
  });
});

// ---------- wire privacy -----------------------------------------------------

describe('wire privacy — banked levels and the deck never leak', () => {
  it('own frame: pts counts the queue, offer is the FRONT offer as resolvable BOON IDS; the DECK never rides the wire', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    const f = buildFrame(w, 'a');
    expect(f.you!.pts).toBe(2);
    expect(f.you!.offer).toEqual([...a.offers[0]]);
    for (const id of f.you!.offer) expect(Object.hasOwn(BOON_CATALOG, id)).toBe(true);
    expect('deck' in f.you!).toBe(false);
    expect(JSON.stringify(f)).not.toContain('levelsSinceRare');
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

describe('per-observer sight (intelTruesight)', () => {
  const target = SIGHT + 20; // between base sight and one-stack sight (330×1.12)

  it('a sight-booned observer sees a CONTACT at a distance a base observer does not', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    place(w, 't', target, 0);
    stack(w, up, 'intelTruesight', 1);
    expect(buildFrame(w, 'up').contacts.map((c) => c.id)).toContain('t');
    expect(buildFrame(w, 'base').contacts.map((c) => c.id)).not.toContain('t');
  });

  it('a sight-booned observer gets the ballistic first-sight reveal at the wider radius', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    place(w, 'shooter', target + 200, 0);
    stack(w, up, 'intelTruesight', 1);
    w.shells.set('s1', {
      id: 's1', ownerId: 'shooter', x: target, y: 0, vx: -100, vy: 0, distLeft: 500,
      bornAt: 0, kind: 'shell', damage: 5, hitRadius: 2,
      targetX: null, targetY: null, burstRadius: 0, contactDamage: 5,
    });
    expect(ballisticsOf(buildFrame(w, 'up')).map((e) => e.id)).toEqual(['s1']);
    expect(ballisticsOf(buildFrame(w, 'base'))).toEqual([]);
    void base;
  });

  it('a sight-booned observer sees an enemy MINE at the wider radius', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    place(w, 'base', 0, 0);
    stack(w, up, 'intelTruesight', 1);
    w.mines.set('m1', { id: 'm1', ownerId: 'x', x: target, y: 0, armedAt: 0 });
    expect(buildFrame(w, 'up').mines.map((m) => m.id)).toEqual(['m1']);
    expect(buildFrame(w, 'base').mines).toEqual([]);
  });
});

describe('per-observer radar (intelRadar)', () => {
  it('paints a blip in the widened annulus that a base observer cannot reach', () => {
    const target = RADAR + 40; // between base radar and one-stack radar (650×1.15)
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    place(w, 'target', target, 0);
    stack(w, up, 'intelRadar', 1);
    windowAround(up, 0);
    windowAround(base, 0);
    expect(blipsOf(buildFrame(w, 'up')).map((e) => e.id)).toEqual(['target']);
    expect(blipsOf(buildFrame(w, 'base'))).toEqual([]);
  });
});

describe('per-observer sweep (intelSweep)', () => {
  it('a booned sweep completes a revolution proportionally faster', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    const base = place(w, 'base', 0, 0);
    stack(w, up, 'intelSweep', 1); // +3 rpm
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
  it('gunReload: a consumed round starts the EFFECTIVE (shorter) reload', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'gunReload', 1); // ×0.9
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: Math.PI / 2, fireSeq: 1, aimDist: 300, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0 };
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeCloseTo(CONFIG.gun.reloadMs * 0.9, 9);
  });

  it('gunDamage: the spawned shell carries the effective damage (HEAVY SHELLS), never raw CONFIG', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'gunDamage', 3); // +3/card
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0 };
    w.step();
    const [shell] = [...w.shells.values()];
    expect(shell.damage).toBe(CONFIG.gun.damage + 9);
    expect(shell.contactDamage).toBe(CONFIG.gun.contactDamage);
    expect(shell.burstRadius).toBe(CONFIG.gun.burstRadius);
  });

  it('torpedoSpeed: the launched fish is faster (+5/card), and ONLY vx/vy change on the wire event', () => {
    const launch = (stacks: number): BallisticEvent => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      stack(w, a, 'torpedoSpeed', stacks);
      w.step(); // flush the join spawn
      a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0 };
      w.step();
      const ev = w.tickEvents.find((e): e is BallisticEvent => e.k === 'torp');
      expect(ev).toBeDefined();
      return ev!;
    };
    const base = launch(0);
    const fast = launch(1);
    expect(Math.hypot(base.vx, base.vy)).toBeCloseTo(CONFIG.torpedo.speed, 6);
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(CONFIG.torpedo.speed + 5, 6);
    // Same constant-free wire shape — the speed rides the velocity, nothing else.
    expect(Object.keys(fast).sort()).toEqual(['id', 'k', 't', 'vx', 'vy', 'x', 'y']);
    expect({ x: fast.x, y: fast.y }).toEqual({ x: base.x, y: base.y }); // same muzzle offset
  });

  it("mine maxLive comes from the OWNER's stats: a mineMax fit keeps one more mine live", () => {
    const SLOT_MINE_ML = 1; // ML fit: [gun, mine, decoyBuoy, empty]
    const dropMines = (stacks: number, drops: number): number => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, 'mineLayer');
      stack(w, a, 'mineMax', stacks);
      w.step();
      for (let i = 0; i < drops; i++) {
        a.loadout[SLOT_MINE_ML].state = { n: 1, reloadMsLeft: 0 }; // skip the reload wait
        // Mines are an aimed WEAPON (Story 2.8): each placement is one rear-arc click.
        w.submitInput('a', {
          seq: i + 1, throttle: 0, rudder: 0, aim: Math.PI,
          fireSeq: i + 1, aimDist: 40 + i, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0,
        });
        w.step();
      }
      return w.mines.size;
    };
    const drops = CONFIG.mine.maxLive + 2; // enough to overflow BOTH caps
    expect(dropMines(0, drops)).toBe(CONFIG.mine.maxLive); // base cap: oldest evicted
    expect(dropMines(1, drops)).toBe(CONFIG.mine.maxLive + 1); // booned owner's cap
  });

  it('shipSpeed: a booned hull out-runs an identical base twin', () => {
    const w = bareWorld();
    const up = place(w, 'up', 0, -200);
    place(w, 'base', 0, 200);
    stack(w, up, 'shipSpeed', 2); // ×1.05 each
    for (let tick = 1; tick <= 200; tick++) {
      w.submitInput('up', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
      w.submitInput('base', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
      w.step();
    }
    const f = 1.05 ** 2;
    expect(w.ships.get('up')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed * f, 6);
    expect(w.ships.get('base')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed, 6);
  });
});
