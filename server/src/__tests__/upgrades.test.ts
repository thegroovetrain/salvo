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
  HEAL_CHOICE,
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
/** Battleship fit [gun, cannon, starShells, empty]. */
const SLOT_CANNON = 1;

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

/** Park a complete InputMsg carrying ONE click on `slot` (fireSeq doubles as
 *  seq — a fresh fireSeq is what the world reads as a pending press). */
function fire(ship: ShipRecord, fireSeq: number, slot: number, aimDist: number, aim = 0): void {
  ship.input = { seq: fireSeq, throttle: 0, rudder: 0, aim, fireSeq, aimDist, slot, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
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

/** The seven per-equipment reload lines the 2026-08-04 global cooldown ruling
 *  deleted — no deck, offer, or catalog may ever hold one again. */
const DEAD_RELOAD_IDS = ['gunReload', 'cannonReload', 'torpedoReload', 'mineReload', 'boostReload', 'starReload', 'decoyReload'];

describe('deck composition — buildDeck over the fresh fit (spec I/O matrix)', () => {
  // Per-hull expected line totals against the production catalog: universal
  // (guns 8 + intel 15 + ship 15 = 38) + carried subdecks + ONE acquisition
  // card per absent equipment. (Global cooldown reduction, Eric ruling
  // 2026-08-04: the seven per-equipment *Reload lines died and ONE universal
  // `shipCooldown` line — 5 copies, `ship` category — replaced them, so every
  // subdeck thinned by its 5 reload copies and `ship` grew by 5.)
  const CASES: [ShipClassId, number, string[]][] = [
    // TB: torpedo 12 + boost 5 + acquisitions (mine/cannon/star/decoy) 4 = 59.
    ['torpedoBoat', 38 + 12 + 5 + 4, ['acquireMine', 'acquireCannon', 'acquireStarShells', 'acquireDecoy']],
    // BS: cannon 12 + starShells 12 + acquisitions (torpedo/mine/decoy/boost) 4 = 66.
    ['battleship', 38 + 12 + 12 + 4, ['acquireTorpedo', 'acquireMine', 'acquireDecoy', 'acquireBoost']],
    // ML: mine 22 + decoy 5 + acquisitions (torpedo/cannon/star/boost) 4 = 69.
    ['mineLayer', 38 + 22 + 5 + 4, ['acquireTorpedo', 'acquireCannon', 'acquireStarShells', 'acquireBoost']],
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
      // The ONE global cooldown line is universal — every hull's deck carries
      // all 5 copies, and no per-equipment reload line survives anywhere.
      expect(copiesInDeck(rec, 'shipCooldown')).toBe(5);
      for (const dead of DEAD_RELOAD_IDS) {
        expect(BOON_CATALOG[dead]).toBeUndefined();
        expect(copiesInDeck(rec, dead)).toBe(0);
      }
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
    a.hp -= 40; // DAMAGE gone, so a -1 rejection can only be the SENTINEL check
    bank(w, a, 1);
    const before = [...a.offers[0]];
    // -1 left this list on 2026-08-04: it is now HEAL_CHOICE, the one reserved
    // negative. EVERY other negative stays malformed — that is the whole point
    // of a reserved sentinel over "any negative means heal".
    for (const junk of [-2, -99, 4, 99, 1.5, NaN, Infinity, '0', 'heal', null, undefined, {}]) {
      expect(w.spendPoint('a', junk)).toBe(false);
    }
    expect(a.offers).toHaveLength(1);
    expect([...a.offers[0]]).toEqual(before);
    expect(a.boons).toEqual([]);
    expect(a.repairHp).toBe(0); // no near-miss ever primed the pool
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
    expect(a.offers).toHaveLength(0); // exactly one level consumed
    w.step();
    expect(HEALS_OF(buildFrame(w, 'a').events)).toEqual([{ k: 'heal', id: 'a' }]);
    expect(HEALS_OF(buildFrame(w, 'b').events)).toEqual([]); // healer-private
  });

  it('the WHOLE front offer returns to the deck — no card leaves it (unlike a card pick)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    a.hp -= 50;
    const offer = [...a.offers[0]];
    const deckBefore = a.deck.cards.length;
    const copiesBefore = offer.map((id) => copiesInDeck(a, id));
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.deck.cards).toHaveLength(deckBefore + offer.length); // +4, not +3
    offer.forEach((id, i) => expect(copiesInDeck(a, id)).toBe(copiesBefore[i] + 1));
    expect(a.boons).toEqual([]); // nothing was fitted
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
    expect(a.repairHp).toBeCloseTo(15, 6);
    const hpAtSecondHeal = a.hp;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.repairHp).toBeCloseTo(15 + DC.regenHp, 6); // 40, the matrix row
    // THE RATE PIN: the very next tick pays 5 hp/s worth, NOT 10 hp/s worth.
    w.step();
    expect(a.hp).toBeCloseTo(hpAtSecondHeal + DC.instantHp + REGEN_PER_TICK, 9);
    expect(a.hp).not.toBeCloseTo(hpAtSecondHeal + DC.instantHp + 2 * REGEN_PER_TICK, 9);
  });

  it('FULL HP is rejected fail-closed: the level stays banked, the pool untouched, no event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    expect(a.hp).toBe(a.stats.maxHp);
    const offerBefore = [...a.offers[0]];
    const deckBefore = a.deck.cards.length;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.offers).toHaveLength(1);
    expect([...a.offers[0]]).toEqual(offerBefore); // the SAME hand, never rerolled
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
    expect(a.alive).toBe(false);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.offers).toHaveLength(1); // banked, unlike a CARD pick which is legal dead
    expect(a.repairHp).toBe(0);
    expect(a.hp).toBe(0);
  });

  it('NO banked levels is rejected by the existing empty-queue guard', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp -= 50; // damaged and alive — only the empty bank can refuse it
    expect(a.offers).toHaveLength(0);
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
    const ticks = Math.ceil(CONFIG.ship.respawnDelay / DT) + 2;
    for (let i = 0; i < ticks; i++) w.step();
    expect(a.alive).toBe(true);
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
    const boonDefsBefore = a.boonDefs;
    // Put a round in flight so a stray rescaleReloadTimers would be visible.
    fire(a, 1, SLOT_GUN, 300);
    w.step();
    const reloadBefore = a.loadout[SLOT_GUN].state!.reloadMsLeft;
    const ammoBefore = a.loadout[SLOT_GUN].state!.n;
    expect(reloadBefore).toBeGreaterThan(0);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.boons).toEqual([]);
    expect(a.stats).toBe(statsBefore); // the SAME object — never recomputed
    expect(a.boonDefs).toBe(boonDefsBefore);
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
    for (const offer of a.offers) {
      expect(offer).toHaveLength(4);
      for (const id of offer) expect(Object.hasOwn(BOON_CATALOG, id)).toBe(true);
    }
    expect(buildFrame(w, 'a').you!.offer).toHaveLength(4); // the strip never rides `offer`
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
      ['acquireCannon', 'shipCooldown', 'shipSpeed', 'intelRadar'], // holds a now-dead acquisition
      ['gunDamage', 'torpedoDamage', 'intelTruesight', 'boostMax'], // acquisition-free: untouched
    ]);
    const untouched = [...a.offers[2]];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.offers).toHaveLength(2);
    const scrubbed = a.offers[0];
    expect(scrubbed).toHaveLength(4); // refilled back to its prior size
    expect([...scrubbed.slice(0, 3)]).toEqual(['shipCooldown', 'shipSpeed', 'intelRadar']); // kept cards keep identity + order
    expect(isAcquisitionDef(BOON_CATALOG[scrubbed[3]])).toBe(false); // the refill can never be an acquisition
    expect(scrubbed).not.toContain('acquireCannon');
    expect([...a.offers[1]]).toEqual(untouched); // acquisition-free offers are byte-identical
  });

  // Story 2.8 review, P5: a BANKED offer can be 100% acquisition cards, and an
  // exhausted deck refills it with NOTHING. A zero-card offer still counted in
  // pts (pts === offers.length) but spendPoint bounds `choice` by front.length
  // — so a zero-card FRONT could never be consumed and the FIFO deadlocked
  // forever. RULING: an offer scrubbed to zero cards is REMOVED entirely
  // (mirroring grantPoint's empty-draw rule). Driven with a tiny injected
  // catalog, the same way the empty-deck rule below is reached: production
  // decks are far too fat for the state to arise in one match.
  it('an offer scrubbed to ZERO cards is REMOVED — pts falls with it and the queue stays spendable', () => {
    const twoAcquisitions: WorldOptions = {
      boonCatalog: {
        // Two acquisitions whose categories hold NO other lines, so nothing
        // can refill a scrubbed offer once the pool is dry.
        acqCannon: { id: 'acqCannon', category: 'cannon', rarity: 'rare', copies: 1, effects: [{ kind: 'slotFill', equipmentId: 'cannon' }] },
        acqStar: { id: 'acqStar', category: 'starShells', rarity: 'rare', copies: 1, effects: [{ kind: 'slotFill', equipmentId: 'starShells' }] },
        aLine: { id: 'aLine', category: 'guns', rarity: 'common', copies: 1, effects: [{ kind: 'stat', path: 'gun.damage', add: 1 }] },
      },
    };
    const w = bareWorld(1, twoAcquisitions);
    const a = place(w, 'a', 0, 0);
    a.offers.push(['acqCannon']); // the FRONT: an acquisition pick (nothing to give back)
    a.offers.push(['acqStar']); // BANKED and 100% acquisition — the scrub empties it
    a.offers.push(['aLine']); // a real banked offer behind it
    a.deck = { cards: [], levelsSinceRare: 0 }; // pool dry: the refill draws nothing
    expect(buildFrame(w, 'a').you!.pts).toBe(3);

    expect(w.spendPoint('a', 0)).toBe(true); // fit the acquisition
    // The all-acquisition offer scrubbed to zero and is GONE (not a 0-card
    // ghost); the real offer behind it survived intact.
    expect(a.offers).toHaveLength(1);
    expect([...a.offers[0]]).toEqual(['aLine']);
    // pts === offers.length still holds, and the queue consumes to empty
    // instead of deadlocking on an unspendable front.
    expect(buildFrame(w, 'a').you!.pts).toBe(1);
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.offers).toHaveLength(0);
    expect(buildFrame(w, 'a').you!.pts).toBe(0);
  });

  it('the scrub refill is deterministic on the player’s own stream (twin worlds agree)', () => {
    const run = (): BoonOffer[] => {
      const { w, a } = acquisitionBoard([['acquireCannon', 'shipCooldown', 'shipSpeed', 'intelRadar']]);
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
    // Two HEAVY WARHEAD copies at the retuned +1/card step (Eric ruling
    // 2026-08-04, the weapon balance pass; was +2/card).
    expect(a.stats.torpedo.damage).toBe(CONFIG.torpedo.damage + 2);
    w.applyBoon(a, 'torpedoCommand'); // swap...
    expect(a.boons).toEqual(['torpedoDamage', 'torpedoDamage', 'torpedoCommand']);
    expect(a.stats.torpedo.mode).toBe('command');
    w.applyBoon(a, 'torpedoHoming'); // ...and back (ping-pong legal)
    expect(a.boons).toEqual(['torpedoDamage', 'torpedoDamage', 'torpedoHoming']);
    expect(a.stats.torpedo.mode).toBe('homing');
    expect(a.stats.torpedo.damage).toBe(CONFIG.torpedo.damage + 2); // stacks survive every swap
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
    expect(a.deck.cards).toHaveLength(59); // the TB composition (suite above)
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

  it('a sight-booned observer sees an enemy MINE at the wider DETECT radius (Story 4.9: mines ride 0.75×sight, so the boon widens detect too — amendment 121)', () => {
    // Between base detect (330 × 0.75 = 247.5) and one-stack detect
    // (330 × 1.12 × 0.75 = 277.2) — factors re-derived as literals.
    const mineAt = SIGHT * 0.75 + 20;
    const w = bareWorld();
    const up = place(w, 'up', 0, 0);
    place(w, 'base', 0, 0);
    stack(w, up, 'intelTruesight', 1);
    w.mines.set('m1', { id: 'm1', ownerId: 'x', x: mineAt, y: 0, armedAt: 0 });
    expect(buildFrame(w, 'up').mines.map((m) => m.id)).toEqual(['m1']);
    expect(buildFrame(w, 'base').mines).toEqual([]);
  });
});

describe('per-observer radar (intelRadar)', () => {
  it('paints a blip in the widened annulus that a base observer cannot reach', () => {
    const target = RADAR + 40; // between base radar and one-stack radar (660×1.15)
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
  it('shipCooldown: ONE card shortens EVERY equipment — a consumed gun AND torpedo round both start the SCALED reload', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB fit: [gun, torpedo, speedBoost, empty]
    stack(w, a, 'shipCooldown', 5); // the 5-copy cap: additive −0.1/card => 0.5
    // Additive-linear, never 0.9^5 (=0.5905). clampStats rounds the
    // accumulated scale to 3 decimals before the multiplies (shared/src/sim/
    // stats.ts), so a 5-stack lands EXACTLY on 0.5 — strict, not close.
    expect(a.stats.cooldownScale).toBe(0.5);
    expect(a.stats.gun.reloadMs).toBe(2500); // 5000 base -> 2500
    expect(a.stats.torpedo.reloadMs).toBe(CONFIG.torpedo.reloadMs * 0.5);

    // The GUN's fire path reads the scaled reload, not raw CONFIG.
    fire(a, 1, SLOT_GUN, 300);
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(CONFIG.gun.reloadMs * 0.5);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeLessThan(CONFIG.gun.reloadMs); // strictly shorter than base

    // ...and so does the TORPEDO's — the SAME single card, a different weapon.
    fire(a, 2, SLOT_TORPEDO, 0);
    w.step();
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(0);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs * 0.5);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBeLessThan(CONFIG.torpedo.reloadMs);
  });

  it('shipCooldown: the CANNON reads the same global scale (45s -> 22.5s) off the Battleship fit', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 0, 0, 0, 'battleship'); // [gun, cannon, starShells, empty]
    stack(w, bb, 'shipCooldown', 5);
    expect(bb.stats.cannon.reloadMs).toBe(22500); // 45000 base -> 22500 (Eric ruling 2026-08-04)
    fire(bb, 1, SLOT_CANNON, 400);
    w.step();
    expect(bb.loadout[SLOT_CANNON].state!.n).toBe(0);
    expect(bb.loadout[SLOT_CANNON].state!.reloadMsLeft).toBe(CONFIG.cannon.reloadMs * 0.5);
    expect(bb.loadout[SLOT_CANNON].state!.reloadMsLeft).toBeLessThan(CONFIG.cannon.reloadMs);

    // ...and the authoritative tick really returns the round on the 22.5s
    // clock: still empty at 22 450ms, back at exactly 22 500ms — 22.5s short of
    // the 45s base, and exactly 450 ticks (not 451 — the rounding fix's
    // tick-count pin: reloadMsLeft is exactly 22500, so it takes exactly
    // 450 * 50ms decrements to cross zero, never one tick of float-dust slop).
    bb.input = { ...bb.input!, fireSeq: 0, seq: 2 };
    for (let i = 0; i < 449; i++) w.step();
    expect(bb.loadout[SLOT_CANNON].state!.n).toBe(0);
    w.step();
    expect(bb.loadout[SLOT_CANNON].state!.n).toBe(1);
    expect(451 * DT).toBeLessThan(CONFIG.cannon.reloadMs); // 22 550 < 45 000
  });

  it('shipCooldown: the AUTHORITATIVE ammo tick restores the round on the SCALED clock (exactly 2.5s), not the 5.0s base', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'shipCooldown', 5);
    fire(a, 1, SLOT_GUN, 300);
    w.step(); // the shot: pool 1 -> 0, the scaled reload starts
    a.input = { ...a.input!, fireSeq: 0, seq: 2 }; // stop clicking — just let the world tick
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);

    // 49 more ticks == 2450ms elapsed on the reload: still empty.
    for (let i = 0; i < 49; i++) w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    // ONE more (2500ms, EXACTLY — not 2550ms) and the round is BACK. Before
    // the clampStats rounding fix the accumulated scale carried float dust
    // (a 4-stack landed on 0.6000000000000001), the scaled reload was a hair
    // over its integer, and the refill took a full extra 50ms tick to cross
    // zero — the actual defect this pin regresses. The base 5000ms clock
    // would still be 50 ticks away, so nothing but the global scale can
    // explain it.
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(1);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(0);
    expect(50 * DT).toBe(CONFIG.gun.reloadMs * 0.5); // 2500 === 2500 — exact, no tick slop
    expect(50 * DT).toBeLessThan(CONFIG.gun.reloadMs); // 2500 < 5000 — the proof
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

  it('a mid-reload shipCooldown grant PRESERVES the progress fraction (half of 5000 -> half of 4500)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(2500); // 50% of the 5000ms base

    w.applyBoon(a, 'shipCooldown'); // 5000 -> 4500
    expect(a.stats.gun.reloadMs).toBe(4500);
    // 2500 * (4500/5000) = 2250 — still EXACTLY half remaining, on the new clock.
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(2250);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft / a.stats.gun.reloadMs).toBe(0.5);
  });

  it('the rescale is NEVER a free round — the pool is untouched and the timer stays positive', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    const nBefore = a.loadout[SLOT_GUN].state!.n;
    w.applyBoon(a, 'shipCooldown');
    expect(a.loadout[SLOT_GUN].state!.n).toBe(nBefore); // 0 — no round handed out
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeGreaterThan(0);
    // ...and the very next tick does not conjure one either.
    w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
  });

  it('a mid-reload 5-stack lands the round on the RESCALED clock (~1250ms, not the 2500ms it had left)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    stack(w, a, 'shipCooldown', 5); // 5000 -> 2500; half remaining => ~1250ms
    expect(a.stats.gun.reloadMs).toBe(2500);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeCloseTo(1250, 6);

    // 24 ticks (1200ms): not yet. On the un-rescaled clock 2500ms remained, so
    // nothing but the renormalization can land the round inside 26 ticks.
    for (let i = 0; i < 24; i++) w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    w.step();
    w.step(); // 1300ms: past the rescaled 1250ms remainder
    expect(a.loadout[SLOT_GUN].state!.n).toBe(1);
  });

  it('a boon that does not touch reloads leaves every in-flight timer BYTE-identical', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    gunAtHalfReload(w, a);
    const before = a.loadout[SLOT_GUN].state!.reloadMsLeft;
    w.applyBoon(a, 'shipHull'); // +20 maxHp, heal-on-grant: ratio 1
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(before);
    w.applyBoon(a, 'gunDamage'); // a GUN card that is not a reload card: ratio 1
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(before);
    expect(a.stats.gun.reloadMs).toBe(CONFIG.gun.reloadMs); // untouched base
  });

  it('an IDLE slot (and a slot filled by this very grant) stays at reloadMsLeft 0', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // nothing fired: every fitted slot is full + idle
    w.applyBoon(a, 'acquireMine'); // fills the extra slot via freshSlotState
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    stack(w, a, 'shipCooldown', 5); // every reload moves; no timer is running
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    expect(a.loadout[SLOT_GUN].state!.n).toBe(a.stats.gun.maxAmmo);
  });

  it('gunDamage: the spawned shell carries the effective damage (HEAVY SHELLS), never raw CONFIG', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'gunDamage', 3); // +3/card
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
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
      a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
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
          fireSeq: i + 1, aimDist: 40 + i, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0,
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
      w.submitInput('up', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
      w.submitInput('base', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
      w.step();
    }
    const f = 1.05 ** 2;
    expect(w.ships.get('up')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed * f, 6);
    expect(w.ships.get('base')!.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed, 6);
  });
});
