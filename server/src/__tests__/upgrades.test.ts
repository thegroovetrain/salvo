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

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  CATALOG,
  CONFIG,
  equipmentMaxAmmo,
  MULLIGAN_CHOICE,
  SLOT_COUNT,
  DEFAULT_SHIFT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  LINE_IDS,
  eligibleLines,
  INDEX_IDS,
  SLOT_BOOST,
  WEAPON_SLOTS,
  boonStackCount,
  familySlotFor,
  effectiveStats,
  isStubLine,
  sunkAt,
  loadoutFor,
  pickRefusal,
  slotsWithCards,
  tierTargetOf,
  type BallisticEvent,
  type Catalog,
  type CatalogLine,
  type GameEvent,
  type LineId,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';
import { fitClassWeapons } from './classWeapons.js';

const DT = CONFIG.tick.simDtMs;
// FIVE FIXED-ROLE SLOTS (Story 10.5): [gun, boost, torpedo, mine, shell] on
// every captain; a weapon card lands in its FAMILY's slot.
const SLOT_GUN = 0;
const SLOT_TORPEDO = familySlotFor('heavyTorpedo')!;
/** The Battleship fixture's SEATED broadside (classWeapons — it left the deal
 *  in Story 10.5, R6, and is mounted straight onto slot 2). */
const SLOT_BROADSIDE = 2;

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 1, opts?: WorldOptions): World {
  // 8.14: there is no deck and no hidden match pool to set up — every captain
  // draws from the whole catalog, bounded by caps and by the slot rules.
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'bismarck'): ShipRecord {
  // The seat's DEFAULT gun (Story 8.14): every captain draws from the same
  // common pool, so a fixture says nothing about cards at all.
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
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

/** Park a complete InputMsg carrying ONE click on `slot` (fireSeq doubles as
 *  seq — a fresh fireSeq is what the world reads as a pending press). */
function fire(ship: ShipRecord, fireSeq: number, slot: number, aimDist: number, aim = 0): void {
  ship.input = { seq: fireSeq, throttle: 0, rudder: 0, aim, fireSeq, aimDist, slot, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
}

/** A torpedo click on the shooter's STARBOARD BEAM with every launcher already
 *  trained there (R28: the launchers fire across the beam, never dead ahead). */
function fireTorpedoAbeam(ship: ShipRecord, fireSeq: number, aimDist: number): void {
  for (const l of ship.launchers) l.a = Math.PI / 2;
  fire(ship, fireSeq, SLOT_TORPEDO, aimDist, ship.state.heading + Math.PI / 2);
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

/** Spend the front offer on its first FITTABLE card. Catalog v3 has no
 *  acquisition card and no subdeck, so every accepted pick moves the build by
 *  exactly one card. A long spend run CAN meet a hand whose first card is a
 *  refused pick (a line at its cap, or copy 1 of a weapon with Q/E/R full);
 *  the helper skips to the first card the shared `pickRefusal` admits, which
 *  is exactly the card a human could take. Returns the fitted id. */
function spendPlainCard(w: World, ship: ShipRecord): string {
  const hand = front(ship);
  const slotIds = ship.loadout.map((s) => s.equipmentId);
  const idx = hand.findIndex((id) => pickRefusal(ship.cards, slotIds, id) === null);
  expect(idx, `no fittable card in ${hand.join(',')}`).toBeGreaterThanOrEqual(0);
  expect(w.spendPoint(ship.id, idx)).toBe(true);
  return hand[idx];
}

const bnsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'bn');
const ptsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'pt');

// ---------- the common pool --------------------------------------------------

/** The seven per-equipment reload lines the 2026-08-04 global cooldown ruling
 *  deleted — no offer or catalog may ever hold one again. */
const DEAD_RELOAD_IDS = ['gunReload', 'cannonReload', 'torpedoReload', 'mineReload', 'boostReload', 'starReload', 'decoyReload'];

/** NOTHING IS HELD AT SPAWN (Story 8.10, FR48, epic-8 amendment 62): the
 *  interim spawn seed — copy 1 of each of a hull's class weapons — is deleted,
 *  so every captain comes up with an EMPTY `cards` list, the seat's gun and the
 *  Shift boost. The first weapon is the one taken from the level-zero offer the
 *  countdown grants, drawn from the COMMON POOL like every card after it. */
const NO_SEED: readonly string[] = [];

/** The lines the draw could deal THIS ship right now, as ids. The whole
 *  eligibility law lives in shared/src/sim/draw.ts; this is the server-side
 *  view of it, assembled exactly as `materializeOffer` assembles it. */
const eligibleFor = (ship: ShipRecord): string[] =>
  eligibleLines({
    held: ship.cards as readonly LineId[],
    slotIds: ship.loadout.map((s) => s.equipmentId),
    mountedGun: 'mainBattery', // every captain's slot 0 since Story 10.4
  }).map((e) => e.id);

describe('the common pool — every dealable line, for every hull (Story 8.14)', () => {
  const HULLS: readonly ShipClassId[] = SHIP_CLASS_IDS;

  for (const hull of HULLS) {
    it(`${hull}: draws from the WHOLE catalog less its stubs — no per-hull list at all`, () => {
      const w = bareWorld();
      const rec = place(w, 'a', 0, 0, 0, hull);
      // THE POOL IS THE CATALOG (amendment 89a). A fresh hull holds nothing and
      // has all three weapon slots open, so every non-stub line is eligible for
      // it except the GUN LADDERS — slot 0 is the MAIN BATTERY on every captain
      // since Story 10.4, which hosts no ladder, so no deck-gun ladder is ever
      // eligible.
      const eligible = new Set(eligibleFor(rec));
      for (const id of LINE_IDS) {
        const line = CATALOG[id];
        const gunLadder = line.kind === 'ladder' && line.appliesTo !== undefined;
        // ...and BROADSIDE left the deal (Story 10.5, R6): it has no family
        // slot, so no copy of it is ever a candidate.
        const familyless = line.kind === 'equipment' && familySlotFor(tierTargetOf(line)!) === null;
        // ...and the four ONE-OFF add-ons (Story 10.6, R10 / I8) are dealt only
        // once their family slot is filled — a fresh hull fills none.
        const unhosted = line.kind === 'addon';
        const want = !isStubLine(id) && !gunLadder && !familyless && !unhosted;
        expect(eligible.has(id), `${hull}/${id}`).toBe(want);
      }
      // ...and it is IDENTICAL across hulls: class identity is the envelope and
      // the Shift now, never the cards a hull is allowed to draw.
      expect([...eligible].sort()).toEqual(eligibleFor(place(w, `x-${hull}`, 0, 0, 0, 'bismarck')).sort());
      for (const dead of DEAD_RELOAD_IDS) expect(Object.hasOwn(CATALOG, dead)).toBe(false);
    });
  }

  it('the hulls spawn holding NOTHING', () => {
    for (const hull of HULLS) {
      const w = bareWorld();
      expect(place(w, 'a', 0, 0, 0, hull).cards).toEqual(NO_SEED);
    }
  });

  it('a captain added with no Shift sails the DEFAULT one, and the World never picks a deck', () => {
    const w = bareWorld();
    const bare = w.addShip('bare', 'BARE', 'captain', 'bismarck', undefined, undefined);
    expect(bare.shift).toBe(DEFAULT_SHIFT);
    expect(bare.cards).toEqual([]);
    // ...and a level banks WITH a real offer: the pool is never empty.
    w.grantXp(bare, 1);
    expect(bare.bankedLevels).toBe(1);
    expect(bare.offer).toHaveLength(CONFIG.offer.size);
  });

  it('the SEAT SHIFT rides the record into slot 1; slot 0 is the main battery, one round per turret, loaded', () => {
    const w = bareWorld();
    for (const shift of SHIFT_IDS) {
      const rec = w.addShip(`s-${shift}`, 'S', 'captain', 'bismarck', undefined, undefined, shift);
      expect(rec.shift).toBe(shift);
      expect(rec.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      expect(rec.loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
      expect(rec.loadout[SLOT_GUN].state).toEqual({ n: equipmentMaxAmmo(rec.stats, 'mainBattery'), reloadMsLeft: 0 });
      expect(equipmentMaxAmmo(rec.stats, 'mainBattery')).toBe(rec.turrets.length);
    }
  });

  it('DRONES never draw (no bank, no hand, whatever the XP)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined);
    // Even a direct XP grant banks nothing for a drone (the addXpMs guard).
    w.grantXp(d, 5);
    expect(d.level).toBe(0);
    expect(d.bankedLevels).toBe(0);
    expect(d.offer).toBeNull();
    expect(w.takes.size).toBe(0);
  });
});

// ---------- earn: who banks one ----------------------------------------------

describe('point earn — who banks one (pool-drawn offers)', () => {
  it('an attributed kill banks ONE pool-drawn offer (stats untouched) + a self-private pt event', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.step(); // flush joins
    w.sinkShip('b', 'a');
    w.step();
    expect(a.bankedLevels).toBe(1);
    expect(front(a)).toHaveLength(CONFIG.offer.size); // four lines from the pool
    expect(new Set(front(a)).size).toBe(CONFIG.offer.size); // all DIFFERENT lines
    expect(w.takes.size).toBe(0); // the DRAW takes nothing and records nothing
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
    // The standard captain level plus CONFIG.bounty.killLevels for sinking
    // the holder (Story 4.6) — both to a corpse.
    expect(a.bankedLevels).toBe(CONFIG.xp.killLevels + CONFIG.bounty.killLevels);
    expect(a.level).toBe(CONFIG.xp.killLevels + CONFIG.bounty.killLevels); // kill XP is NOT alive-gated (Story 2.6)
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(a.hp).toBe(0); // earning is inert — a corpse banks, nothing heals
  });
});

// ---------- determinism ------------------------------------------------------

describe('draw determinism — (mapSeed, join ordinal, draw sequence)', () => {
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
    if (target !== undefined && CATALOG[pick].kind === 'equipment') {
      // Copy 1 of an EQUIPMENT line is the bare weapon (tier I) arriving in
      // its family slot (Story 10.5).
      expect(a.stats.equipment[target].tier).toBe(1);
      expect(a.loadout[familySlotFor(target)!].equipmentId).toBe(target);
    } else if (target !== undefined) {
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

  // THE ANTI-REGRESSION PIN (the lazy-draw bugfix). Under the old deck model
  // each level DREW four cards out of the deck and only gave three back on a
  // spend, so a player who banked levels drained their own deck: a 59-card TB
  // hit zero by ~L15 and started banking 3-card, then 1-card, then zero-card
  // levels. Story 8.14 makes that structurally impossible — a draw is a READ of
  // the common pool and there is nothing to thin — but the pin stays, because
  // what it really asserts is that banking is FREE.
  it('20 levels banked WITHOUT a single spend: every hand is full size', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const hands: string[][] = [];
    for (let i = 0; i < 20; i++) {
      bank(w, a, 1);
      expect(a.bankedLevels).toBe(i + 1);
      hands.push(front(a));
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
  });

  it('a passed-on line is drawable by the very next level (nothing is consumed by passing)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 2);
    const hand = front(a);
    const passed = hand[1]; // fit slot 0, pass on the rest
    expect(w.spendPoint('a', 0)).toBe(true);
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

  it('a spend fits EXACTLY the chosen card; the unchosen three buy nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const offer = front(a);
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.cards).toEqual([offer[0]]);
    // ...and only the CHOSEN line can have moved the take ledger.
    for (const id of offer.slice(1)) expect(w.takes.has(id as LineId), id).toBe(false);
  });

  it('N spends fit exactly N cards, however the levels are banked and spent', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
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
      expect(a.cards).toHaveLength(fits);
    }
  });

  // SOFT PITY IS DELETED with rarity (Story 8.1), and `levelsSinceRare` with
  // it — so the "exactly one draw per level" rule needs a different witness.
  // The DRAW STREAM is it: a draw consumes ONE rng value per dealt card (the
  // line pick) plus one per wildcard slot that had BOTH types to flip between
  // (Story 10.7). This catalog is all ladders — ship lines only — so no
  // wildcard ever flips and every full draw costs exactly one value per card;
  // counting the stream's consumption counts draws.
  it('exactly ONE draw per level across grant/spend/heal interleavings (the draw stream counts them)', () => {
    const line = (id: string): CatalogLine =>
      ({ id, kind: 'ladder', cap: 9, tiers: new Array(9).fill([{ kind: 'stat', path: 'armor', add: 1 }]) }) as unknown as CatalogLine;
    const catalog: Catalog = { c1: line('c1'), c2: line('c2'), c3: line('c3'), c4: line('c4'), c5: line('c5'), c6: line('c6') };
    const w = bareWorld(3, { catalog });
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    // Count the stream instead of a deleted counter: wrap this ship's own rng.
    let rolls = 0;
    const inner = a.drawRng;
    a.drawRng = {
      next: () => { rolls += 1; return inner.next(); },
      int: (lo: number, hi: number) => inner.int(lo, hi),
      float: (lo: number, hi: number) => inner.float(lo, hi),
      pick: <T>(xs: readonly T[]) => inner.pick(xs),
    };
    const ROLLS_PER_CARD = 1; // the line pick; an all-ship catalog never flips a wildcard
    const draws = (): number => rolls / (ROLLS_PER_CARD * CONFIG.offer.size);
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
    for (const junk of [-1, -2, -99, CONFIG.offer.size, 99, 1.5, NaN, Infinity, '0', 'heal', null, undefined, {}]) {
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

  it('the LAST offer index is live against the production offer (no off-by-one at the bound)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 1);
    const last = CONFIG.offer.size - 1;
    expect(front(a)).toHaveLength(CONFIG.offer.size);
    const pick = front(a)[last];
    expect(w.spendPoint('a', last)).toBe(true);
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

// ---------- equipment lines --------------------------------------------------
//
// ACQUISITION CARDS ARE DELETED (Story 8.1). Catalog v3 has no acquire* line
// and no per-equipment subdeck: an EQUIPMENT line's COPY 1 *is* the fit (its
// only effect is the `slotFill`), and copies 2–5 are its upgrade tiers. So the
// old purge/subdeck pins have no mechanism left to assert about; what replaces
// them is the fit itself, and the guarantee that an UNBUILT weapon can never
// take the slot.

describe('equipment lines — copy 1 fits the weapon into its EMPTY family slot', () => {
  /** A TB holding `extraLevels` more banked levels behind a directed
   *  navalMines front offer. Since Story 8.14 there is no deck to stack the
   *  line into: EVERY non-stub line is in the common pool for every hull, so
   *  the fixture only has to hand the ship the offer. */
  function fitBoard(extraLevels = 0): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    a.bankedLevels = 1 + extraLevels;
    a.offer = ['navalMines', 'deckGun', 'armor', 'intel'];
    return { w, a };
  }

  it('the pick installs the equipment LOADED in its FAMILY slot (full pool)', () => {
    const { w, a } = fitBoard();
    expect(w.spendPoint('a', 0)).toBe(true);
    // Story 10.5: a slotFill goes to its family's slot — the rack to the
    // MINE slot (E) — never first-empty-first.
    const slot = familySlotFor('navalMines')!;
    const want: (string | null)[] = ['mainBattery', 'boost', ...new Array<null>(SLOT_COUNT - 2).fill(null)];
    want[slot] = 'navalMines';
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(want);
    expect(a.loadout[slot].state).toEqual({ n: a.stats.equipment.navalMines.maxAmmo, reloadMsLeft: 0 });
  });

  it('copy 1 is the TAKE, and its later copies are its TIERS, not another fit', () => {
    const { w, a } = fitBoard();
    expect(w.spendPoint('a', 0)).toBe(true);
    // COPY 1 OF AN EQUIPMENT LINE IS A TAKE (Story 8.14, amendment 90) — it is
    // the bare weapon arriving, so every other captain's weight for the line
    // steps down. Copy 2 is a tier bump and moves nobody's weight.
    expect([...w.takes.get('navalMines' as LineId)!]).toEqual(['a']);
    const slotsBefore = a.loadout.map((s) => s.equipmentId);
    w.applyCard(a, 'navalMines');
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(slotsBefore);
    expect(a.stats.equipment.navalMines.tier).toBe(2);
  });

  it('a gun LADDER card moves its row\'s numbers and never fits a slot', () => {
    const { w, a } = fitBoard();
    // The machine gun's line is a LADDER now (amendment 104): forced past the
    // pool onto a main-battery seat it moves the machineGun ROW's numbers and fits
    // nothing — the weapon row is untouched (a ladder has no slotFill).
    const before = effectiveStats(a.cls);
    expect(() => w.applyCard(a, 'machineGun')).not.toThrow();
    for (const i of WEAPON_SLOTS) expect(a.loadout[i].equipmentId).toBeNull(); // every family slot untouched
    expect(a.stats.equipment.machineGun.tier).toBe(2);
    expect(a.stats.equipment.machineGun).not.toEqual(before.equipment.machineGun); // the ladder moved the row
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards)); // ...through the one fold
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

// ---------- grant-time effects + capacity raises -----------------------------

// The HULL POINTS heal-on-grant tests lived here until Story 10.3 DELETED the
// line, the `healOnGrant` flag and world.ts's heal branch (Eric 2026-11-04,
// epic-10 amendment 8). No grant heals now.
describe('grant-time effects — no grant heals, and raised-cap top-ups', () => {
  it('a fit never heals — a ladder or a gun rung alike (Story 10.3 deleted heal-on-grant)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = 40;
    w.applyCard(a, 'deckGun');
    expect(a.hp).toBe(40);
    w.applyCard(a, 'armor');
    expect(a.hp).toBe(40);
  });

  // (The CANNON-rung and FLAK-turret-rung pool raises pinned here until Story
  // 10.4 are retired with the captain's deck gun: slot 0 is the main battery,
  // which hosts no ladder, so no captain can climb either ladder. Amendment
  // 41's arrives-loaded rule for a raised cap is still pinned on the weapon
  // row by the mine rack's tier II below.)
});

// ---------- empty deck -------------------------------------------------------

/** A plain universal ladder line for the injected-catalog boards below: `cap`
 *  identical +1-Armor tiers (a stat on no equipment row, so a UNIVERSAL
 *  ladder — a gun-row path would host it on the drones' gun, Story 10.4), so
 *  a board can say "cap 1" or "cap 9" and mean only that. */
function ladderLine(id: string, cap = 1): CatalogLine {
  const tier = [{ kind: 'stat', path: 'armor', add: 1 }];
  return { id, kind: 'ladder', cap, tiers: new Array(cap).fill(tier) } as unknown as CatalogLine;
}

// ---------- the EXHAUSTED hull: a short or EMPTY offer (Story 10.5) ----------
//
// Amendment 94's "the offer is never empty" stood on the consumables, which
// were ALWAYS eligible. They are gone (Story 10.5, epic-10 amendment 11), so a
// hull holding every ladder and all three family-slot weapons at cap has
// NOTHING left to draw. Orchestrator ruling: an empty offer is never opened as
// a refit window and never throws. Since Story 10.7 (R5, Eric 2026-11-06,
// replacing R3's "banks nothing") a level that meets an EMPTY draw becomes ONE
// bonus point on an index picked off the ship's draw stream: no bank, no
// offer, no `pt`, while `level` keeps counting.

/** Max a production captain OUT: every non-stub universal ladder, one kind
 *  per family at its cap (the first non-stub, dealable member of each) and
 *  every one-off add-on (Story 10.6). */
function exhaust(w: World, a: ShipRecord): void {
  for (const id of LINE_IDS) {
    const line = CATALOG[id];
    if (isStubLine(id) || line.kind !== 'ladder' || line.appliesTo !== undefined) continue;
    stack(w, a, id, line.cap);
  }
  for (const slot of WEAPON_SLOTS) {
    const id = LINE_IDS.find((l) => {
      const line = CATALOG[l];
      const eq = tierTargetOf(line);
      return line.kind === 'equipment' && !isStubLine(l) && eq !== undefined && familySlotFor(eq) === slot;
    })!;
    stack(w, a, id, CATALOG[id].cap);
  }
  // ...and every one-off ADD-ON its now-filled family slot hosts (Story 10.6).
  for (const id of LINE_IDS) {
    if (CATALOG[id].kind === 'addon' && !isStubLine(id)) stack(w, a, id, CATALOG[id].cap);
  }
}

/** The total bonus points a ship holds across every index (Story 10.7, R5). */
const bonusTotal = (a: ShipRecord): number => INDEX_IDS.reduce((sum, id) => sum + a.indexBonus[id], 0);

/** Wrap a ship's draw stream so the test can count what the World spends. */
function countDraws(a: ShipRecord): () => number {
  const inner = a.drawRng;
  let n = 0;
  a.drawRng = {
    ...inner,
    next: () => {
      n += 1;
      return inner.next();
    },
  };
  return () => n;
}

describe('the EXHAUSTED hull — a short or empty offer never throws, and an empty draw is a bonus point (Stories 10.5, 10.7 R5)', () => {
  it('every ladder + all three family weapons at cap: NOTHING is eligible, and a level crossed is ONE bonus point — no bank, no offer, no pt, level still rises', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    expect(WEAPON_SLOTS.every((i) => a.loadout[i].equipmentId !== null)).toBe(true);
    expect(eligibleFor(a)).toEqual([]);
    expect(bonusTotal(a)).toBe(0);
    const levelBefore = a.level;
    const cardsBefore = [...a.cards];
    expect(() => bank(w, a, 1)).not.toThrow();
    w.step();
    expect(a.level).toBe(levelBefore + 1); // the LEVEL still counts...
    expect(a.bankedLevels).toBe(0); // ...nothing is banked...
    expect(bonusTotal(a)).toBe(1); // ...it became exactly one bonus point (R5)...
    expect(a.cards).toEqual(cardsBefore); // ...which is no card
    expect(a.offer).toBeNull(); // ...no hand (no refit window)
    expect(ptsOf(w.tickEvents)).toEqual([]); // ...and no TAB cue
    // The point is IN the stats, through the one fold.
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, CATALOG, a.indexBonus));
    const picked = INDEX_IDS.find((id) => a.indexBonus[id] > 0)!;
    expect(a.stats[picked]).toBe(effectiveStats(a.cls, a.cards)[picked] + CONFIG.offer.exhausted.indexPoints);
    const you = buildFrame(w, 'a').you!;
    expect(you.pts).toBe(0);
    expect(you.offer).toEqual([]);
    expect(you.ib).toEqual({ [picked]: 1 });
  });

  it('R7: a SINKING or SUNK exhausted hull credited levels gets NO point — bank 0, no draw-stream value spent, stats untouched; the same hull afloat converts', () => {
    for (const state of ['sinking', 'sunk'] as const) {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      exhaust(w, a);
      if (state === 'sinking') w.sinkShip('a');
      else a.lifecycle = sunkAt(w.now);
      expect(isAfloat(a.lifecycle), state).toBe(false);
      const stats = a.stats;
      const draws = countDraws(a);
      bank(w, a, 3);
      expect(a.bankedLevels, state).toBe(0);
      expect(bonusTotal(a), state).toBe(0);
      expect(draws(), state).toBe(0);
      expect(a.stats, state).toBe(stats);
    }
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    bank(w, a, 3);
    expect(bonusTotal(a)).toBe(3);
  });

  it('R6: an INTEL bonus point on a hull at its INTEL card cap makes it SWEEP faster — no ceiling', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    expect(boonStackCount(a.cards, 'intel')).toBe(CATALOG.intel.cap);
    const before = a.stats;
    // Steer the pick onto INTEL: the uniform slice of [0, 1) that maps to it.
    const indices = CONFIG.offer.exhausted.indices;
    const v = (indices.indexOf('intel') + 0.5) / indices.length;
    a.drawRng = { ...a.drawRng, next: () => v };
    bank(w, a, 1);
    expect(a.indexBonus.intel).toBe(1);
    const perPoint = (CONFIG.vision.sweepRpm * CONFIG.offer.exhausted.indexPoints) / CONFIG.index.base;
    expect(a.stats.sweepRpm - before.sweepRpm).toBeCloseTo(perPoint, 9);
    // ...and the World's sweep stepping reads it: one tick advances the beam
    // by 2π·dt / the NEW (shorter) period.
    const start = a.sweepAngle;
    w.step();
    const advanced = (a.sweepAngle - start + 2 * Math.PI) % (2 * Math.PI);
    expect(advanced).toBeCloseTo((2 * Math.PI * DT) / a.stats.sweepPeriodMs, 9);
    expect(advanced).toBeGreaterThan((2 * Math.PI * DT) / before.sweepPeriodMs);
  });

  it('K levels on an exhausted hull are K points — one draw-stream value each — and spendPoint is refused cleanly', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    bank(w, a, 1);
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(a.bankedLevels).toBe(0);
    const levelBefore = a.level;
    const draws = countDraws(a);
    bank(w, a, 5);
    expect(a.level).toBe(levelBefore + 5);
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
    expect(bonusTotal(a)).toBe(6);
    expect(draws()).toBe(5); // an empty draw spends nothing; each pick spends one
  });

  it('PROPERTY over seeds: the points land only on the ruled indices, never on anything else', () => {
    const allowed = new Set<string>(CONFIG.offer.exhausted.indices);
    for (let seed = 1; seed <= 12; seed += 1) {
      const w = bareWorld(seed);
      const a = place(w, 'a', 0, 0);
      exhaust(w, a);
      const cardsBefore = [...a.cards];
      const before = a.stats;
      bank(w, a, 8);
      expect(Object.keys(a.indexBonus).sort(), `seed ${seed}`).toEqual([...INDEX_IDS].sort());
      for (const id of INDEX_IDS) if (a.indexBonus[id] > 0) expect(allowed.has(id), `seed ${seed} ${id}`).toBe(true);
      expect(bonusTotal(a), `seed ${seed}`).toBe(8);
      expect(a.cards, `seed ${seed}`).toEqual(cardsBefore);
      // HULL REPAIR / SMOKE SCREEN never move: they are no index.
      expect(a.stats.repair, `seed ${seed}`).toEqual(before.repair);
      expect(a.stats.smoke, `seed ${seed}`).toEqual(before.smoke);
    }
  });

  it('is deterministic: the same seed picks the same points', () => {
    const run = (): Record<string, number> => {
      const w = bareWorld(7);
      const a = place(w, 'a', 0, 0);
      exhaust(w, a);
      bank(w, a, 10);
      return { ...a.indexBonus };
    };
    expect(run()).toEqual(run());
  });

  it('a hull that spends its LAST eligible card with N levels banked behind it converts all N into points, and the bank ends at 0', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    // Give one ladder back: exactly ONE line is dealable.
    const back = LINE_IDS.find((id) => CATALOG[id].kind === 'ladder' && !isStubLine(id) && CATALOG[id].appliesTo === undefined)!;
    a.cards.splice(a.cards.lastIndexOf(back), 1);
    bank(w, a, 3); // the front level draws [back]; two more queue behind it
    expect(front(a)).toEqual([back]);
    expect(a.bankedLevels).toBe(3);
    expect(bonusTotal(a)).toBe(0);
    const levelBefore = a.level;
    w.step();
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(eligibleFor(a)).toEqual([]);
    expect(a.bankedLevels).toBe(0);
    expect(bonusTotal(a)).toBe(2); // the two queued levels, one point each (R5)
    expect(a.offer).toBeNull();
    expect(a.level).toBe(levelBefore); // a spend never moves the level
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, CATALOG, a.indexBonus));
    w.step();
    expect(ptsOf(w.tickEvents)).toEqual([]);
    expect(buildFrame(w, 'a').you!.pts).toBe(0);
  });

  it('a hull with cards left to draw NEVER receives a bonus point, however many levels it banks and spends', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    bank(w, a, 6);
    for (let i = 0; i < 6; i += 1) spendPlainCard(w, a);
    expect(a.bankedLevels).toBe(0);
    expect(bonusTotal(a)).toBe(0);
    expect(buildFrame(w, 'a').you!.ib).toEqual({});
  });

  it('the points survive the activation redeploy and a respawn, folded into the rebuilt stats', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    bank(w, a, 4);
    const held = { ...a.indexBonus };
    w.resetForMatchStart();
    expect(a.indexBonus).toEqual(held);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, CATALOG, a.indexBonus));
    w.sinkShip('a');
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.indexBonus).toEqual(held);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards, CATALOG, a.indexBonus));
  });

  it('the countdown grant on an exhausted hull is a bonus point too; the REDRAW has no hand and is a clean no-op', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    w.countdownOpen = true;
    expect(() => w.grantOpening()).not.toThrow();
    expect(a.offer).toBeNull();
    expect(a.bankedLevels).toBe(0);
    expect(bonusTotal(a)).toBe(1);
    // A redraw needs a held hand — there is none, so it is a clean no-op.
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBeNull();
    expect(bonusTotal(a)).toBe(1);
  });

  it('a hand ONE line short of exhaustion is SHORT, never padded and never repeated', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    exhaust(w, a);
    // Give one ladder back: drop its last copy, so exactly ONE line is dealable.
    const back = LINE_IDS.find((id) => CATALOG[id].kind === 'ladder' && !isStubLine(id) && CATALOG[id].appliesTo === undefined)!;
    a.cards.splice(a.cards.lastIndexOf(back), 1);
    expect(eligibleFor(a)).toEqual([back]);
    bank(w, a, 1);
    expect(front(a)).toEqual([back]);
    expect(CONFIG.offer.size).toBeGreaterThan(1);
  });

  it('...and the same refusal holds for a capped LADDER line', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    for (let i = 0; i < CATALOG.armor.cap; i += 1) w.applyCard(a, 'armor');
    a.bankedLevels = 1;
    a.offer = ['armor'];
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(boonStackCount(a.cards, 'armor')).toBe(CATALOG.armor.cap);
    expect(a.bankedLevels).toBe(1);
  });

  it('with FEWER dealable lines than the offer size the hand is SHORT, never padded, never repeated', () => {
    const catalog: Catalog = { a1: ladderLine('a1', 9), a2: ladderLine('a2', 9) };
    const w = bareWorld(1, { catalog });
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    w.grantXp(a, 1);
    w.step();
    expect(front(a).sort()).toEqual(['a1', 'a2']);
    expect(ptsOf(w.tickEvents)).toEqual([{ k: 'pt', id: 'a' }]);
  });
});

// ---------- ONE KIND PER SLOT (Story 10.5) ------------------------------------

describe('one kind per family slot — through the real spend path (Story 10.5)', () => {
  it('a forced HEAVY after a LIGHT is refused: the level stays banked, the offer does not move, the slot keeps the light', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.bankedLevels = 2;
    a.offer = ['lightTorpedo'];
    expect(w.spendPoint('a', 0)).toBe(true);
    const slot = familySlotFor('lightTorpedo')!;
    expect(a.loadout[slot].equipmentId).toBe('lightTorpedo');
    a.offer = ['heavyTorpedo'];
    const offer = a.offer;
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(a.cards).toEqual(['lightTorpedo']);
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBe(offer);
    expect(a.loadout[slot].equipmentId).toBe('lightTorpedo');
    expect(w.takes.has('heavyTorpedo' as LineId)).toBe(false);
  });

  it('the SAME kind again is a tier copy (it stays legal below its cap)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.bankedLevels = 2;
    a.offer = ['lightTorpedo'];
    expect(w.spendPoint('a', 0)).toBe(true);
    a.offer = ['lightTorpedo'];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.stats.equipment.lightTorpedo.tier).toBe(2);
  });

  it('with a torpedo slotted, no other torpedo kind is ever drawn (40 seeds)', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const w = bareWorld(300 + seed);
      const a = place(w, 'a', 0, 0);
      w.applyCard(a, 'lightTorpedo');
      bank(w, a, 1);
      for (const id of front(a)) {
        const eq = tierTargetOf(CATALOG[id]);
        if (CATALOG[id].kind !== 'equipment' || eq === undefined) continue;
        if (familySlotFor(eq) === familySlotFor('lightTorpedo')) expect(id, `${seed}`).toBe('lightTorpedo');
      }
    }
  });

  // --- THE DEV FIT AND THE FAMILY SLOTS (Story 8.14 review F2, re-cut 10.5) --

  it('a dev fitOverride naming two kinds of one family fits the FIRST and drops the second — ledger included', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined, DEFAULT_SHIFT,
      ['heavyTorpedo', 'navalMines', 'starShells', 'lightTorpedo', 'broadside']);
    // broadside has no family slot (R6) and lightTorpedo's slot holds the heavy.
    expect(a.cards).toEqual(['heavyTorpedo', 'navalMines', 'starShells']);
    expect(WEAPON_SLOTS.map((i) => a.loadout[i].equipmentId)).toEqual(['heavyTorpedo', 'navalMines', 'starShells']);
    expect(w.takes.get('lightTorpedo' as LineId)).toBeUndefined();
    expect(w.takes.get('broadside' as LineId)).toBeUndefined();
    expect([...w.takes.keys()].sort()).toEqual(['heavyTorpedo', 'navalMines', 'starShells']);
  });

  it("a full-row hull's opening never offers a weapon it cannot fit", () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined, DEFAULT_SHIFT,
      ['heavyTorpedo', 'navalMines', 'starShells']);
    expect(WEAPON_SLOTS.every((i) => a.loadout[i].equipmentId !== null)).toBe(true);
    w.grantOpening();
    for (const id of a.offer ?? []) {
      const line = CATALOG[id];
      expect(line.kind === 'equipment' && boonStackCount(a.cards, id) === 0, id).toBe(false);
    }
  });

  it('an ALL-STUB catalog is an empty draw too: the level counts, nothing banks, no latch anywhere', () => {
    const catalog: Catalog = { ghost: { ...ladderLine('ghost', 9), stub: true } as CatalogLine };
    const w = bareWorld(1, { catalog });
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    const levelBefore = a.level;
    w.grantXp(a, 1);
    w.step();
    expect(a.level).toBe(levelBefore + 1);
    expect(a.bankedLevels).toBe(0);
    expect(buildFrame(w, 'a').you!.pts).toBe(0);
    expect(a.offer).toBeNull();
    expect(ptsOf(w.tickEvents)).toEqual([]);
    expect(Object.hasOwn(a, 'deckExhausted')).toBe(false);
  });
});

// ---------- the at-cap guard -------------------------------------------------

describe('the at-cap guard — the draw reads the ship\'s OWN cards (Story 8.3)', () => {
  it('a line the ship already holds at its cap is never offered', () => {
    // cap 1, so ONE fitted copy is the whole cap. `spare` (cap 9) is the rest
    // of the hand's only other option, which makes the guard's bite visible:
    // unguarded, this draw would return TWO different lines.
    const catalog: Catalog = { hog: ladderLine('hog', 1), spare: ladderLine('spare', 9) };
    const w = bareWorld(5, { catalog });
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    // Reach the cap through the real grant seam.
    w.applyCard(a, 'hog');
    expect(a.cards).toEqual(['hog']);

    w.grantXp(a, 1);
    w.step();
    expect(front(a)).toEqual(['spare']); // `hog` is gone from the candidate set
  });

  it('a line held BELOW its cap is untouched — the guard excludes only AT the cap', () => {
    const catalog: Catalog = { hog: ladderLine('hog', 2) };
    const w = bareWorld(5, { catalog });
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    w.applyCard(a, 'hog'); // held 1 of 2 — below the cap
    w.grantXp(a, 1);
    w.step();
    expect(front(a)).toEqual(['hog']);
  });

  it('with every family slot FULL, no equipment copy 1 is ever dealt (amendment 89b; Story 10.5)', () => {
    const w = bareWorld(7);
    const a = place(w, 'a', 0, 0);
    for (const id of ['heavyTorpedo', 'navalMines', 'starShells'] as LineId[]) w.applyCard(a, id);
    const held = new Set(a.cards);
    for (const id of eligibleFor(a)) {
      const line = CATALOG[id];
      if (line.kind !== 'equipment') continue;
      // The only equipment lines left eligible are TIER cards of lines aboard.
      expect(held.has(id), id).toBe(true);
    }
    // ...and over many draws not one unheld equipment line ever shows up.
    for (let seed = 0; seed < 40; seed += 1) {
      const t = bareWorld(200 + seed);
      const s = place(t, 'a', 0, 0);
      for (const id of ['heavyTorpedo', 'navalMines', 'starShells'] as LineId[]) t.applyCard(s, id);
      bank(t, s, 1);
      for (const id of front(s)) {
        if (CATALOG[id].kind === 'equipment') expect(s.cards, `${seed}/${id}`).toContain(id);
      }
    }
  });
});

// ---------- lifecycle --------------------------------------------------------

describe('economy lifecycle — respawn preserves, redeploy wipes', () => {
  it('respawn (waiting phase) PRESERVES the build: boons, stats, effective hp + pools, bank, XP', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'armor', 2);
    bank(w, a, 2);
    w.grantXp(a, 0.5); // partial progress toward the next level
    const bankBefore = a.bankedLevels;
    const offerBefore = front(a);
    const xpBefore = a.xpMs;
    w.sinkShip('a');
    // Story 5.2: the revive waits on the founder tick (window > respawn delay).
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.cards).toEqual(['armor', 'armor']);
    // Story 10.3 (Eric 2026-11-04, epic-10 amendment 8): HULL POINTS is gone,
    // so the preserved build is read through ARMOR's folded stat instead.
    expect(a.stats).toEqual(effectiveStats(a.cls, ['armor', 'armor']));
    expect(a.stats.armor).toBeGreaterThan(effectiveStats(a.cls).armor);
    expect(a.hp).toBe(a.stats.maxHp); // full EFFECTIVE hp
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
  it('redeployShip (match start) PRESERVES the build, the bank, the hand and the draw stream', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    a.state.speed = 0;
    // Fit an equipment line so the live FIT diverges hard from a fresh build.
    a.bankedLevels = 1;
    a.offer = ['navalMines', 'deckGun', 'armor', 'intel'];
    w.spendPoint('a', 0);
    bank(w, a, 2);
    const bankBeforeReset = a.bankedLevels;
    const handBeforeReset = a.offer;
    const streamBeforeReset = a.drawRng;
    w.resetForMatchStart();
    expect(a.cards).toEqual(['navalMines']);
    expect(a.bankedLevels).toBe(bankBeforeReset);
    expect(a.offer).toBe(handBeforeReset); // the same array, never redrawn
    // XP is the ONE thing that still dies at the boundary (Story 2.6).
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
    expect(a.stats).toEqual(effectiveStats(a.cls, ['navalMines']));
    expect(a.loadout.map((s) => s.equipmentId)).toEqual([
      'mainBattery', 'boost', null, 'navalMines', ...new Array<null>(SLOT_COUNT - 4).fill(null),
    ]); // the rack in its MINE family slot (Story 10.5)
    // ...on a FRESH clock: the loadout is REBUILT from the kept cards, so no
    // pool is short and nothing is reloading.
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    // The draw stream is never reseeded, and the TAKE stays taken: a match
    // boundary restores nothing (amendment 90 — a take is permanent).
    expect(a.drawRng).toBe(streamBeforeReset);
    expect([...w.takes.get('navalMines' as LineId)!]).toEqual(['a']);
  });
});

// ---------- wire privacy -----------------------------------------------------

describe('wire privacy — banked levels, the ledger and the weights never leak', () => {
  it('own frame: pts counts the BANK, offer is the materialized FRONT hand as resolvable LINE IDS; nothing about the pool rides the wire', () => {
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

  it("another ship's frame carries no pt/bn events, and its contacts carry no pts/offer/rd/deck", () => {
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
    for (const key of ['pts', 'offer', 'rd', 'deck', 'boons', 'lvl', 'xp']) {
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
    stack(w, up, 'intel', 1); // +3 rpm
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
  /** The full RELOAD stack's scale, as the catalog authors it: the RELOAD
   *  index (the hull's own + every rung's step, additive) through Eric's haste
   *  law 1 / (1 + (RELOAD − base) / base) — Story 10.3 ruling 14; never a
   *  compounded product of per-card scales. */
  const reloadLadderScale = (cls: ShipClassId = 'bismarck'): number => {
    const steps = CATALOG.reload.tiers
      .flat()
      .reduce((sum, e) => sum + (e.kind === 'stat' && e.path === 'reload' ? (e.add ?? 0) : 0), 0);
    const reload = CONFIG.shipClasses[cls].index.reload + steps;
    return Math.round((1 / (1 + (reload - CONFIG.index.base) / CONFIG.index.base)) * 1000) / 1000;
  };

  it('RELOAD: ONE stack shortens the turrets AND the Q / E / R weapons — a fired TURRET and a consumed torpedo round both start the SCALED reload (Story 10.5, R11)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // THE TUBES ARE A CARD NOW (Story 8.10): the spawn seed is gone, so this
    // fire-path fixture fits the TB's torpedo explicitly.
    fitClassWeapons(w, a);
    // The torpedo row before the stack, as read through the hull's own scale.
    const torpBefore = a.stats.equipment.heavyTorpedo.reloadMs / a.stats.cooldownScale;
    stack(w, a, 'reload', CATALOG.reload.cap); // the full stack
    const scale = a.stats.cooldownScale;
    expect(scale).toBeLessThan(1); // non-vacuity: the ladder shortens reloads
    expect(scale).toBeCloseTo(reloadLadderScale(), 9); // the haste law over the summed index, never compounded
    // clampStats rounds the accumulated scale to 3 decimals before the
    // multiplies (shared/src/sim/stats.ts), so a full stack carries NO float
    // dust — the regression the exact-tick refill pins below depend on.
    expect(scale).toBe(Math.round(scale * 1000) / 1000);
    const R = a.stats.equipment.mainBattery.reloadMs;
    expect(R).toBeLessThan(effectiveStats(a.cls).equipment.mainBattery.reloadMs); // the card shortened the turrets
    // R11: the slot weapon takes the same scale on top of its own tier step.
    const T = a.stats.equipment.heavyTorpedo.reloadMs;
    expect(T).toBeCloseTo(torpBefore * scale, 6);
    expect(T).toBeLessThan(effectiveStats(a.cls, ['heavyTorpedo']).equipment.heavyTorpedo.reloadMs);

    // The MAIN BATTERY's fire path reads the scaled reload, not raw CONFIG:
    // exactly ONE turret fires and starts exactly R (Story 10.4).
    fire(a, 1, SLOT_GUN, 300);
    w.step();
    expect(a.turrets.filter((t) => t.reloadMsLeft > 0).map((t) => t.reloadMsLeft)).toEqual([R]);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length - 1, reloadMsLeft: R });

    // ...and so does the TORPEDO's — the SAME stack, a different weapon.
    // (A positive aimDist names the area — Story 10.6; the fired TUBE starts T.)
    fireTorpedoAbeam(a, 2, 300);
    w.step();
    expect(a.launchers[0].tubes).toEqual([T]);
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(0);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(T);
  });

  it('RELOAD: the (seated, undealt) BROADSIDE takes the same scale like the slot weapons and returns on exactly the scaled clock (Story 10.5, R11)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 0, 0, 0, 'yamato');
    fitClassWeapons(w, bb); // the class cards, fitted explicitly (Story 8.10)
    const unscaled = bb.stats.equipment.broadside.reloadMs;
    const scaleBefore = bb.stats.cooldownScale;
    stack(w, bb, 'reload', CATALOG.reload.cap);
    expect(bb.stats.cooldownScale).toBeLessThan(scaleBefore);
    const R = bb.stats.equipment.broadside.reloadMs;
    expect(R).toBeCloseTo((unscaled / scaleBefore) * bb.stats.cooldownScale, 6);
    fire(bb, 1, SLOT_BROADSIDE, 300, Math.PI / 2); // abeam — inside the beam sector
    w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.n).toBe(0);
    expect(bb.loadout[SLOT_BROADSIDE].state!.reloadMsLeft).toBe(R);

    // ...and the authoritative tick returns the barrage on the scaled clock:
    // still empty one tick short of it, back on the tick that crosses zero —
    // never one tick of float-dust slop later.
    bb.input = { ...bb.input!, fireSeq: 0, seq: 2 };
    const ticks = Math.ceil(R / DT);
    for (let i = 0; i < ticks - 1; i++) w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.n).toBe(0);
    w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.n).toBe(1);
    expect(ticks * DT).toBeLessThan(unscaled); // the pre-stack clock would still be running
  });

  it('RELOAD: the AUTHORITATIVE turret step restores the fired turret on the SCALED clock, to the tick, not the base clock', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stack(w, a, 'reload', CATALOG.reload.cap);
    const R = a.stats.equipment.mainBattery.reloadMs;
    const full = a.turrets.length;
    fire(a, 1, SLOT_GUN, 300);
    w.step(); // the salvo: one turret's scaled reload starts
    a.input = { ...a.input!, fireSeq: 0, seq: 2 }; // stop clicking — just let the world tick
    expect(a.loadout[SLOT_GUN].state!.n).toBe(full - 1);

    // One tick short of the scaled clock: still reloading.
    const ticks = Math.ceil(R / DT);
    for (let i = 0; i < ticks - 1; i++) w.step();
    expect(a.loadout[SLOT_GUN].state!.n).toBe(full - 1);
    // ONE more and the turret is BACK (the 3-decimal scale pin above keeps the
    // clock free of float dust).
    w.step();
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: full, reloadMsLeft: 0 });
    expect(ticks * DT).toBeLessThan(effectiveStats(a.cls).equipment.mainBattery.reloadMs); // the base clock would still be running
  });

  // ---------- mid-reload renormalization (Eric ruling 2026-08-04) ------------
  // A grant that moves a fitted slot's effective reload rescales that slot's
  // IN-FLIGHT timer by the same ratio, so the progress FRACTION survives the
  // fit. Never a free round: `n` does not move and the scaled timer stays
  // positive. Driven through the real World tick, not effectiveStats.
  // STORY 10.4: slot 0 is the main battery, whose pool is DERIVED from the
  // turrets (contract §8.10: a turret's running reload keeps its countdown),
  // STORY 10.5 (R10 / R11): a RELOAD card moves the turrets' and the slot
  // weapons' clocks (never a Shift's); a slot weapon's OWN tier card moves its
  // clock the same way. The per-round slot these pins measure is the HEAVY
  // TORPEDO in Q, held at TORP_BASE_TIER so the next copies step the reload
  // WITHOUT adding a tube (a tube-up tier raises the cap, and "everything
  // arrives loaded" would fill the pool).

  /** Heavy-torpedo copies held before the measured tier card: the last tier
   *  that adds a tube, so every later copy is a reload-only step. */
  const TORP_BASE_TIER = 3;

  /** Fit the torpedo at TORP_BASE_TIER, fire one tube and let the world tick
   *  until roughly half the reload is spent (whole ticks, so the remainder is
   *  read back, never assumed). */
  function torpAtHalfReload(w: World, a: ShipRecord): void {
    stack(w, a, 'heavyTorpedo', TORP_BASE_TIER);
    fireTorpedoAbeam(a, 1, 300);
    w.step(); // the shot: the pool empties, the full-length reload starts
    a.input = { ...a.input!, fireSeq: 0, seq: 2 }; // stop clicking
    const half = Math.floor(a.stats.equipment.heavyTorpedo.reloadMs / 2 / DT);
    for (let i = 0; i < half; i++) w.step();
  }

  it('a mid-reload RELOAD grant PRESERVES a slot weapon\'s progress fraction on the new clock (Story 10.5, R11)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    torpAtHalfReload(w, a);
    const oldR = a.stats.equipment.heavyTorpedo.reloadMs;
    const left = a.loadout[SLOT_TORPEDO].state!.reloadMsLeft;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(oldR);

    w.applyCard(a, 'reload');
    const newR = a.stats.equipment.heavyTorpedo.reloadMs;
    expect(newR).toBeLessThan(oldR);
    // left × (new / old) — the same fraction remaining, on the new clock.
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBeCloseTo(left * (newR / oldR), 9);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft / newR).toBeCloseTo(left / oldR, 12);
  });

  it('a mid-reload TIER card of the weapon itself PRESERVES the progress fraction on the new clock', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    torpAtHalfReload(w, a);
    const oldR = a.stats.equipment.heavyTorpedo.reloadMs;
    const oldCap = a.stats.equipment.heavyTorpedo.maxAmmo;
    const left = a.loadout[SLOT_TORPEDO].state!.reloadMsLeft;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(oldR);

    w.applyCard(a, 'heavyTorpedo');
    expect(a.stats.equipment.heavyTorpedo.maxAmmo).toBe(oldCap); // premise: a reload-only step
    const newR = a.stats.equipment.heavyTorpedo.reloadMs;
    expect(newR).toBeLessThan(oldR);
    // left × (new / old) — the same fraction remaining, on the new clock.
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBeCloseTo(left * (newR / oldR), 9);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft / newR).toBeCloseTo(left / oldR, 12);
  });

  // The deleted deck-gun case, restored for the MAIN BATTERY (Story 10.4 gate
  // S1): slot 0's {n, reloadMsLeft} is DERIVED from the turrets, so the
  // progress-fraction rule (Eric 2026-08-04) must land on the TURRETS' own
  // clocks — scaling the derived pair is overwritten next tick.
  it('a mid-reload RELOAD grant rescales a fired TURRET\'s clock by new/old; a loaded turret is untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
    expect(a.turrets.length).toBeGreaterThan(1);
    fire(a, 1, SLOT_GUN, 300);
    w.step(); // one turret fires, its full reload starts
    a.input = { ...a.input!, fireSeq: 0, seq: 2 };
    const firedIdx = a.turrets.findIndex((t) => t.reloadMsLeft > 0);
    expect(firedIdx).toBeGreaterThanOrEqual(0);
    expect(a.turrets.filter((t) => t.reloadMsLeft > 0)).toHaveLength(1);
    const oldR = a.stats.equipment.mainBattery.reloadMs;
    const quarter = Math.floor(oldR / 4 / DT);
    for (let i = 0; i < quarter; i++) w.step();
    const left = a.turrets[firedIdx].reloadMsLeft;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(oldR);

    w.applyCard(a, 'reload');
    const newR = a.stats.equipment.mainBattery.reloadMs;
    expect(newR).toBeLessThan(oldR);
    const want = left * (newR / oldR);
    expect(a.turrets[firedIdx].reloadMsLeft).toBeCloseTo(want, 9);
    a.turrets.forEach((t, i) => {
      if (i !== firedIdx) expect(t.reloadMsLeft).toBe(0); // loaded: no clock to move
    });
    // ...and slot 0's pair re-derives from the rescaled turret.
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length - 1, reloadMsLeft: a.turrets[firedIdx].reloadMsLeft });
    // The next tick (syncBatterySlot) keeps the rescaled clock, one DT down.
    w.step();
    expect(a.turrets[firedIdx].reloadMsLeft).toBeCloseTo(want - DT, 9);
    expect(a.loadout[SLOT_GUN].state!.reloadMsLeft).toBeCloseTo(want - DT, 9);
  });

  it('the rescale is NEVER a free round — the pool is untouched and the timer stays positive', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    torpAtHalfReload(w, a);
    const nBefore = a.loadout[SLOT_TORPEDO].state!.n;
    w.applyCard(a, 'reload');
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(nBefore); // no round handed out
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBeGreaterThan(0);
    // ...and the very next tick does not conjure one either.
    w.step();
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(nBefore);
  });

  it('a mid-reload full RELOAD stack lands the round on the RESCALED clock, not the time it had left', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    torpAtHalfReload(w, a);
    const oldR = a.stats.equipment.heavyTorpedo.reloadMs;
    const left = a.loadout[SLOT_TORPEDO].state!.reloadMsLeft;
    const nBefore = a.loadout[SLOT_TORPEDO].state!.n;
    stack(w, a, 'reload', CATALOG.reload.cap);
    const rescaled = left * (a.stats.equipment.heavyTorpedo.reloadMs / oldR);
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBeCloseTo(rescaled, 6);

    // One tick short of the rescaled remainder: not yet. On the un-rescaled
    // clock `left` remained, so nothing but the renormalization can land the
    // round this early.
    const ticks = Math.ceil(rescaled / DT);
    expect(ticks).toBeLessThan(Math.ceil(left / DT)); // non-vacuity
    for (let i = 0; i < ticks - 1; i++) w.step();
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(nBefore);
    w.step();
    expect(a.loadout[SLOT_TORPEDO].state!.n).toBe(nBefore + 1);
  });

  it('a card that does not touch reloads leaves every in-flight timer BYTE-identical', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    torpAtHalfReload(w, a);
    const before = a.loadout[SLOT_TORPEDO].state!.reloadMsLeft;
    w.applyCard(a, 'armor'); // a ladder that moves no reload: ratio 1
    expect(a.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(before);
  });

  it('an IDLE slot (and a slot filled by this very grant) stays at reloadMsLeft 0', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // nothing fired: every fitted slot is full + idle
    w.applyCard(a, 'navalMines'); // fills the first empty weapon slot via freshSlotState
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    stack(w, a, 'reload', CATALOG.reload.cap); // every weapon reload moves; no timer is running
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    expect(a.loadout[SLOT_GUN].state!.n).toBe(a.stats.equipment.mainBattery.maxAmmo);
  });

  // The fire path reads EFFECTIVE stats, never raw CONFIG (Story 10.4: the
  // main battery's row — no ladder writes it today, so the seam is the row
  // itself: every shell of a salvo carries the row's numbers, one shell per
  // gun of the turret that fired).
  it('main-battery shells ride the EFFECTIVE row — damage, contact damage, burst radius, one per gun', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: SLOT_GUN, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
    w.step();
    const shells = [...w.shells.values()];
    const row = a.stats.equipment.mainBattery;
    for (const s of shells) {
      expect(s.damage).toBe(row.damage);
      expect(s.contactDamage).toBe(row.contactDamage);
      expect(s.burstRadius).toBe(row.burstRadius);
      expect(s.family).toBe('cannon');
    }
    const fired = a.turrets.findIndex((t) => t.reloadMsLeft > 0);
    expect(fired).toBeGreaterThanOrEqual(0);
    expect(shells).toHaveLength(CONFIG.shipClasses.bismarck.battery.turrets[fired].guns);
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
    fireTorpedoAbeam(a, 1, 300);
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
    const SLOT_MINE_ML = familySlotFor('navalMines')!; // the rack's family slot (Story 10.5)
    const dropMines = (drops: number): number => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, 'warspite');
      fitClassWeapons(w, a); // the rack is a card (Story 8.10)
      expect('maxLive' in a.stats.equipment.navalMines).toBe(false);
      w.step();
      for (let i = 0; i < drops; i++) {
        Object.assign(a.racks.racks[0], { n: 1, reloadMsLeft: 0 }); // skip the reload wait (the racks are the truth — Story 10.6)
        // Mines are an aimed WEAPON (Story 2.8): each placement is one rear-arc click.
        w.submitInput('a', {
          seq: i + 1, throttle: 0, rudder: 0, aim: Math.PI,
          fireSeq: i + 1, aimDist: 40 + i, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false,
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
    stack(w, up, 'engines', 2);
    for (let tick = 1; tick <= 200; tick++) {
      w.submitInput('up', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
      w.submitInput('base', { seq: tick, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
      w.step();
    }
    expect(up.stats.kinematics.maxSpeed).toBeGreaterThan(effectiveStats(CONFIG.shipClasses.bismarck).kinematics.maxSpeed);
    expect(w.ships.get('up')!.state.speed).toBeCloseTo(up.stats.kinematics.maxSpeed, 6);
    expect(w.ships.get('base')!.state.speed).toBeCloseTo(effectiveStats(CONFIG.shipClasses.bismarck).kinematics.maxSpeed, 6);
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
  /** An authored-but-unbuilt line: full shape, a REAL slotFill on copy 1,
   *  flagged stub — the exact shape the gate exists to refuse. It is the ONLY
   *  line naming its equipment (the shared gate keys on the equipment's owning
   *  line), exactly as a real stub owns its own unbuilt weapon. */
  const STUB_CATALOG: Catalog = {
    ghostRack: { id: 'ghostRack', kind: 'equipment', cap: 1, stub: true, tiers: [[{ kind: 'slotFill', equipmentId: 'navalMines' }]] } as unknown as CatalogLine,
  };

  it('applyCard on a stub id moves nothing: not cards, not the fit, not the stats', () => {
    const w = bareWorld(1, { catalog: STUB_CATALOG });
    const a = place(w, 'a', 0, 0, 0, 'yamato');
    const cardsBefore = [...a.cards];
    const fitBefore = a.loadout.map((s) => s.equipmentId);
    const statsBefore = a.stats;
    w.applyCard(a, 'ghostRack');
    expect(a.cards).toEqual(cardsBefore);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(fitBefore);
    expect(a.stats).toBe(statsBefore);
  });

  it('the respawn replay re-derives the SAME loadout even off a stub id in cards', () => {
    const w = bareWorld(1, { catalog: STUB_CATALOG });
    const a = place(w, 'a', 0, 0, 0, 'yamato');
    a.cards.push('ghostRack'); // however it got there, it fits nothing
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
  // list LESS ITS STUB CARDS is dealt.
  //
  // THE DEPTH IS PER-HULL SINCE STORY 8.13, and that is the point of listing it
  // here: flipping a line's stub flag is what fills a deck out, with NO code
  // change (amendment 11). 8.13 built the LIGHT TORPEDO and the CAPTIVE rack
  // and made SUPERCAV TORPEDO a live consumable, so the Torpedo Boat went
  // 27 -> 30 and the Mine Layer 27 -> 29; the Battleship's three lines are all
  // still Story 8.14's, so it stays at 27 until they land.
  const HULLS: [ShipClassId, string[]][] = [
    ['bismarck', ['heavyTorpedo']],
    ['yamato', ['starShells']], // broadside left the deal (Story 10.5, R6)
    ['warspite', ['navalMines']],
  ];

  for (const [hull, formerSeed] of HULLS) {
    it(`${hull} spawns with NO cards, and ${JSON.stringify(formerSeed)} is just another pool line`, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, hull);
      expect(a.cards).toEqual([]);
      // The line the hull used to hold is an ORDINARY pool line now — eligible
      // for this hull exactly as it is for every other (Story 8.14).
      for (const id of formerSeed) expect(eligibleFor(a), id).toContain(id);
      // ...and the fit is the bare universal loadout, byte for byte: the main
      // battery, the SEAT's Shift (Story 10.4), seven empty slots.
      // `loadoutFor` IS the spawn now.
      expect(a.stats).toEqual(effectiveStats(a.cls));
      expect(a.loadout).toEqual(loadoutFor(a.stats, false, a.shift));
      expect(a.loadout).toEqual(slotsWithCards(a.stats, a.cards, CATALOG, false, a.shift));
      for (const i of WEAPON_SLOTS) expect(a.loadout[i]).toEqual({ equipmentId: null, state: null });
      expect(a.loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe(DEFAULT_SHIFT);
    });
  }

  it('the FIRST copy of a class line is the bare weapon, fitted into its family slot (Q)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'heavyTorpedo');
    expect(a.cards).toEqual(['heavyTorpedo']);
    expect(a.loadout[familySlotFor('heavyTorpedo')!].equipmentId).toBe('heavyTorpedo');
    expect(a.stats.equipment.heavyTorpedo.tier).toBe(1);
    // Tier I is the bare weapon (catalog-v3 §4), so copy 1 moves no number.
    expect(a.stats).toEqual(effectiveStats(a.cls, ['heavyTorpedo']));
  });

  it('the NEXT copy is tier II — a real reload step, not a wasted fit', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'heavyTorpedo');
    const before = a.stats.equipment.heavyTorpedo.reloadMs;
    w.applyCard(a, 'heavyTorpedo');
    expect(a.cards).toEqual(['heavyTorpedo', 'heavyTorpedo']);
    expect(a.stats.equipment.heavyTorpedo.tier).toBe(2);
    expect(a.stats.equipment.heavyTorpedo.reloadMs).toBeLessThan(before);
    expect(a.stats).toEqual(effectiveStats(a.cls, a.cards));
  });

  // THE SPAWN still holds nothing — but a REDEPLOY no longer returns a hull to
  // the spawn state (Story 8.10 review, P1): it keeps the build on every path.
  it('redeployShip (no hold) KEEPS the build; only a fresh ADDSHIP holds nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'yamato');
    w.applyCard(a, 'starShells');
    w.applyCard(a, 'armor');
    w.resetForMatchStart();
    expect(a.cards).toEqual(['starShells', 'armor']);
    expect(a.stats).toEqual(effectiveStats(a.cls, ['starShells', 'armor']));
    expect(a.loadout[familySlotFor('starShells')!].equipmentId).toBe('starShells');
    // A hull that JOINS, by contrast, still comes up with nothing at all.
    const fresh = place(w, 'fresh', 0, 0, 0, 'yamato');
    expect(fresh.cards).toEqual([]);
    expect(fresh.mulliganed).toBe(false);
    expect(fresh.stats).toEqual(effectiveStats(fresh.cls));
    expect(fresh.loadout).toEqual(loadoutFor(fresh.stats, false, fresh.shift)); // the seat's Shift
  });

  it('DRONES still draw nothing, and hold no cards to speak of either', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined);
    expect(d.cards).toEqual([]);
    // A fleet hull fits the GUN ALONE — never the Shift boost (amendment 24).
    expect(d.loadout.map((x) => x.equipmentId)).toEqual(['gun', ...new Array<null>(SLOT_COUNT - 1).fill(null)]);
  });
});
