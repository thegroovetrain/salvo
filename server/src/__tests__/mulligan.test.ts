// THE OPENING — the level-zero grant and the one free countdown redraw (Story
// 8.10, FR48; Eric rulings, epic-8 amendments 59-64).
//
// Two mechanisms, both server-side, both reachable from the wire:
//
//   grantOpening()  — `Match.startCountdown()` calls it once per match. Every
//                     PARTICIPANT (human captain or AI captain, never a PvE
//                     fleet hull) banks ONE level and draws a hand with the
//                     usable-card guarantee. `level` does not move: the HUD
//                     reads LV 0, bank chip 1, an empty strip.
//   mulligan()      — `SpendMsg.choice === MULLIGAN_CHOICE` (-2), the ONE legal
//                     negative on a channel Story 8.8 had closed. Honoured iff
//                     the countdown is open, the hull is a human captain, it
//                     has not redrawn yet and it HOLDS a hand. Everything else
//                     is a silent no-op that leaves the offer BYTE-IDENTICAL —
//                     the same array object, not an equal one, which is the
//                     8.7 full-belt refusal pattern.
//
// The redraw spends NOTHING: the old hand was never consumed (a draw is a
// read), so the deck is untouched and the bank still reads 1.

import { describe, it, expect, vi } from 'vitest';
import { CONFIG, CATALOG, DEFAULT_DECKS, MULLIGAN_CHOICE, isStubLine, type LineId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

/** Islands cleared and the raster flattened — no terrain in an economy test. */
function bareWorld(seed = 4, opts = {}): World {
  // 8.11: the MATCH CONSUMABLE POOL is tested in matchPool.test.ts; the offers
  // and deck depths pinned here are about the AUTHORED deck, so this factory
  // deals an EMPTY pool unless a test asks for one.
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, { pool: [], ...opts });
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A captain on the hull's DEFAULT deck — what the door admits. */
function captain(w: World, id: string, hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat'): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, DEFAULT_DECKS[hull]);
}

/** An AI captain (a participant, never a human) on a real deck. */
function bot(w: World, id: string): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'bot', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
}

/** A PvE fleet hull — world content, no deck, no economy. */
function fleet(w: World, id: string): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'fleet', 'droneSmall', undefined, undefined, []);
}

const ptIds = (w: World): string[] => w.tickEvents.filter((e) => e.k === 'pt').map((e) => e.id);

/** The countdown, as the sim sees it: Match sets this flag and nothing else
 *  does. Opening it by hand is exactly what `startCountdown()` does. */
function openCountdown(w: World): void {
  w.countdownOpen = true;
}

// ---------- the level-zero grant ---------------------------------------------

describe('grantOpening — one banked level and a guaranteed hand, participants only', () => {
  it('captains and bots bank LV 0 / pts 1 / xp 0 / offer[4]; fleet hulls get NOTHING', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b', 'battleship');
    const ai = bot(w, 'bot-1');
    const drone = fleet(w, 'fleet-1');

    w.grantOpening();

    for (const s of [a, b, ai]) {
      expect(s.bankedLevels, s.id).toBe(1);
      expect(s.level, s.id).toBe(0); // the grant is a BANK, not a level-up
      expect(s.xpMs, s.id).toBe(0);
      expect(s.offer, s.id).not.toBeNull();
      expect(s.offer, s.id).toHaveLength(CONFIG.offer.size);
      expect(new Set(s.offer!).size, s.id).toBe(CONFIG.offer.size); // four distinct lines
      for (const id of s.offer!) expect(isStubLine(id), id).toBe(false);
    }
    // A fleet hull holds the frozen empty deck: granting it a level would draw
    // nothing and latch the exhaustion report for every hull in the wave.
    expect(drone.bankedLevels).toBe(0);
    expect(drone.offer).toBeNull();
    expect(drone.deckExhausted).toBe(false);
  });

  it('the hand carries at least one USABLE card (the level-zero guarantee)', () => {
    // A default deck's first offer must never be four ladders on a hull with
    // no weapon — card 0 is drawn uniformly over the usable lines.
    for (const hull of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const w = bareWorld(seed);
        const a = captain(w, 'a', hull);
        w.grantOpening();
        const first = a.offer![0];
        const line = CATALOG[first];
        const usable = line.kind === 'consumable' || (line.kind === 'equipment' && !a.cards.includes(first));
        expect(usable, `${hull}/${seed}: ${first}`).toBe(true);
      }
    }
  });

  it('queues a self-private `pt` for every participant, one tick later', () => {
    const w = bareWorld();
    captain(w, 'a');
    bot(w, 'bot-1');
    fleet(w, 'fleet-1');
    w.grantOpening();
    w.step(); // the pending -> events swap is step()'s epilogue (amendment 63d)
    expect(ptIds(w).sort()).toEqual(['a', 'bot-1']);
  });

  it('the DRAW takes nothing out of the deck and the bank is the only cost', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const before = a.deck.cards.length;
    w.grantOpening();
    expect(a.deck.cards).toHaveLength(before);
  });

  it('a captain with an EMPTY deck banks the level silently and latches exhaustion once', () => {
    const onDeckExhausted = vi.fn();
    const w = bareWorld(4, { onDeckExhausted });
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, []);
    w.grantOpening();
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBeNull(); // an offer-less level advertises no refit
    expect(a.deckExhausted).toBe(true);
    expect(onDeckExhausted).toHaveBeenCalledTimes(1);
    w.step();
    expect(ptIds(w)).toEqual([]);
  });
});

// ---------- the mulligan: the I/O matrix -------------------------------------

describe('mulligan — the one free redraw at the start line', () => {
  /** A captain holding a level-zero hand with the countdown open. */
  function atTheStartLine(seed = 4): { w: World; a: ShipRecord } {
    const w = bareWorld(seed);
    const a = captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    w.step(); // flush the grant's pt so the next frame's events are the redraw's
    return { w, a };
  }

  it('happy path: the hand changes, `mulliganed` latches, a pt is queued, the deck is untouched', () => {
    const onMulligan = vi.fn();
    const w = bareWorld(4, { onMulligan });
    const a = captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    w.step();
    const handA = [...a.offer!];
    const deckBefore = a.deck.cards.length;

    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);

    expect(a.offer).toHaveLength(CONFIG.offer.size);
    expect([...a.offer!]).not.toEqual(handA);
    expect(a.mulliganed).toBe(true);
    expect(a.bankedLevels).toBe(1); // a redraw spends NO level
    expect(a.deck.cards).toHaveLength(deckBefore); // ...and consumes no card
    expect(onMulligan).toHaveBeenCalledTimes(1);
    expect(onMulligan).toHaveBeenCalledWith('a');
    w.step();
    expect(ptIds(w)).toEqual(['a']);
  });

  it('the redrawn hand carries the guarantee too', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const { w, a } = atTheStartLine(seed);
      expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
      const first = a.offer![0];
      const line = CATALOG[first];
      expect(line.kind === 'consumable' || (line.kind === 'equipment' && !a.cards.includes(first)), first).toBe(true);
    }
  });

  it('a SECOND mulligan is a no-op: the same array, byte for byte, and no pt', () => {
    const { w, a } = atTheStartLine();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    const handB = a.offer;
    w.step();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBe(handB); // the SAME object — nothing was drawn
    w.step();
    expect(ptIds(w)).toEqual([]);
  });

  it('LIVE WATER refuses it: the countdown flag is the whole gate', () => {
    const { w, a } = atTheStartLine();
    w.countdownOpen = false; // Match.activate() does exactly this, first
    const hand = a.offer;
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBe(hand);
    expect(a.mulliganed).toBe(false);
  });

  it('a BOT is refused even holding a hand at the start line (bots never redraw)', () => {
    const w = bareWorld();
    const ai = bot(w, 'bot-1');
    openCountdown(w);
    w.grantOpening();
    const hand = ai.offer;
    expect(w.spendPoint('bot-1', MULLIGAN_CHOICE)).toBe(false);
    expect(ai.offer).toBe(hand);
    expect(ai.mulliganed).toBe(false);
  });

  it('a FLEET hull is refused — it never had a hand to throw back', () => {
    const w = bareWorld();
    const drone = fleet(w, 'fleet-1');
    openCountdown(w);
    w.grantOpening();
    expect(w.spendPoint('fleet-1', MULLIGAN_CHOICE)).toBe(false);
    expect(drone.offer).toBeNull();
    expect(drone.bankedLevels).toBe(0);
  });

  it('NO OFFER, no redraw: a spent hand cannot be mulliganed back', () => {
    const { w, a } = atTheStartLine();
    expect(w.spendPoint('a', 0)).toBe(true); // take a card — the bank empties
    expect(a.offer).toBeNull();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.mulliganed).toBe(false);
  });

  it('a SINKING captain is refused before the sentinel is ever read', () => {
    const { w, a } = atTheStartLine();
    const hand = a.offer;
    w.sinkShip('a');
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBe(hand);
    expect(a.mulliganed).toBe(false);
  });

  // THE SINKING GUARD IS INSIDE `mulligan()`, NOT ONLY AT THE WIRE (Story 8.10
  // review, P6). `spendPoint` refuses a sinking hull before it ever reads the
  // sentinel, so the wire was covered — but `Match`'s dev `autoMulligan` arm
  // calls `world.mulligan(ship)` DIRECTLY, and a countdown can hold a sinking
  // hull (a dev room's waiting phase is live water and Story 5.2's five-second
  // window straddles the arming). Guarding the shared function is the fix.
  it('a SINKING captain is refused by `mulligan()` itself — the direct (dev-arm) path', () => {
    const onMulligan = vi.fn();
    const w = bareWorld(4, { onMulligan });
    const a = captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    w.step();
    const hand = a.offer;
    w.sinkShip('a');

    expect(w.mulligan(a)).toBe(false);

    expect(a.offer).toBe(hand); // the SAME array object — byte for byte
    expect(a.mulliganed).toBe(false); // ...and the free redraw is NOT burned
    expect(onMulligan).not.toHaveBeenCalled();
    w.step();
    expect(ptIds(w)).toEqual([]);
  });

  it('EVERY OTHER malformed choice is still refused, and still mutates nothing', () => {
    const { w, a } = atTheStartLine();
    const hand = a.offer;
    for (const bad of [-1, -3, -100, NaN, 1.5, Infinity, '0', null, undefined, {}]) {
      expect(w.spendPoint('a', bad), String(bad)).toBe(false);
      expect(a.offer, String(bad)).toBe(hand);
    }
    expect(a.mulliganed).toBe(false);
    expect(a.bankedLevels).toBe(1);
  });

  it('an unknown ship id is refused without touching anybody', () => {
    const { w, a } = atTheStartLine();
    const hand = a.offer;
    expect(w.spendPoint('nobody', MULLIGAN_CHOICE)).toBe(false);
    expect(a.offer).toBe(hand);
  });

  it('a throwing onMulligan reporter never aborts the redraw (the ops-seam rule)', () => {
    const w = bareWorld(4, { onMulligan: () => { throw new Error('ops'); } });
    const a = captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    const hand = a.offer;
    expect(() => w.spendPoint('a', MULLIGAN_CHOICE)).not.toThrow();
    expect(a.offer).not.toBe(hand);
    expect(a.mulliganed).toBe(true);
  });
});

// ---------- the ops seams ----------------------------------------------------

describe('onDeckPick / onMulligan — the two /metrics seams (Story 8.10)', () => {
  it('a SUCCESSFUL pick reports once; a refused one reports nothing', () => {
    const onDeckPick = vi.fn();
    const w = bareWorld(4, { onDeckPick });
    const a = captain(w, 'a');
    w.grantOpening();
    expect(w.spendPoint('a', 99)).toBe(false); // out of bounds
    expect(w.spendPoint('a', -1)).toBe(false); // the retired heal sentinel
    expect(onDeckPick).not.toHaveBeenCalled();
    expect(w.spendPoint('a', 1)).toBe(true);
    expect(onDeckPick).toHaveBeenCalledTimes(1);
    expect(onDeckPick).toHaveBeenCalledWith('a');
    // ...and the ship id is ALL it ever carries — never the line.
    expect(onDeckPick.mock.calls[0]).toHaveLength(1);
  });

  it('a REFUSED mulligan reports nothing', () => {
    const onMulligan = vi.fn();
    const w = bareWorld(4, { onMulligan });
    const a = captain(w, 'a');
    w.grantOpening(); // countdown NOT open
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(onMulligan).not.toHaveBeenCalled();
    expect(a.mulliganed).toBe(false);
  });

  it('a throwing onDeckPick reporter never un-does the pick', () => {
    const w = bareWorld(4, { onDeckPick: () => { throw new Error('ops'); } });
    const a = captain(w, 'a');
    w.grantOpening();
    const picked = a.offer![0];
    expect(() => w.spendPoint('a', 0)).not.toThrow();
    expect(a.cards).toContain(picked);
  });
});

// ---------- the economy survives the start line ------------------------------

describe('the countdown economy through the activation redeploy (amendment 63b)', () => {
  /** The queue-formed / Solo vs AI shape: the hold is on. */
  function heldStartLine(): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    return { w, a };
  }

  it('a card taken during the countdown is ABOARD when the water goes live', () => {
    const { w, a } = heldStartLine();
    // Take the guaranteed first card — on a default deck that is a weapon or a
    // consumable, i.e. something that actually occupies a slot.
    const picked = a.offer![0] as LineId;
    expect(w.spendPoint('a', 0)).toBe(true);
    const fittedSlots = a.loadout.filter((s) => s.equipmentId !== null).length;
    a.hp = 3;
    a.state.x = 123;

    w.resetForMatchStart(true); // holdStartLine — the boarding room's activation

    expect(a.cards).toContain(picked);
    expect(a.loadout.filter((s) => s.equipmentId !== null)).toHaveLength(fittedSlots);
    // ...on a FRESH clock: full pool, nothing in flight.
    for (const slot of a.loadout) {
      if (slot.state === null) continue;
      expect(slot.state.reloadMsLeft).toBe(0);
    }
    expect(a.hp).toBe(a.stats.maxHp); // hp still resets
    expect(a.state.x).toBe(123); // ...and the held hull does not move
  });

  it('a HELD hand survives activation — same array, same bank, redraw now refused', () => {
    const { w, a } = heldStartLine();
    const hand = a.offer;
    w.resetForMatchStart(true);
    expect(a.offer).toBe(hand);
    expect(a.bankedLevels).toBe(1);
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
    // The water is live the instant Match clears the flag; the redraw is gone.
    w.countdownOpen = false;
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
  });

  it('a SPENT redraw stays spent across the activation', () => {
    const { w, a } = heldStartLine();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    w.resetForMatchStart(true);
    expect(a.mulliganed).toBe(true);
  });

  // THE TRUTH FLIPPED (Story 8.10 review, P1). This case used to pin the
  // opposite — that a redeploy WITHOUT the start-line hold wiped bank, hand,
  // cards, deck and `mulliganed`. The split is retired: `hold` governs
  // placement only, and the countdown economy is preserved in EVERY room.
  // It has to be. The batch-sim runner and the RL env both build a `Match`
  // with no `expectedCaptains`, so they took the wipe path and measured an
  // opening production never plays; and with pre-active xp and damage
  // disabled by `applyPolicy`, the opening grant is the only pre-active
  // economy there is — wiping it wipes the feature.
  it('the DEV/SANDBOX (non-hold) redeploy preserves the SAME economy, `mulliganed` included', () => {
    const { w, a } = heldStartLine();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    const deckList = a.deckList;
    const hand = a.offer;
    const pool = [...a.deck.cards];
    a.hp = 3;
    w.resetForMatchStart(); // no hold — the ready room's fresh match
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBe(hand); // the same array, not a redraw
    expect(a.mulliganed).toBe(true); // the redraw stays spent
    expect(a.deckList).toBe(deckList); // the frozen list never moves
    expect(a.deck.cards).toEqual(pool); // ...and the pool is not rebuilt under it
    // ...while the HULL is still reset exactly as before.
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
  });
});

// ---------- the DEV spawn fit (amendment 65) ---------------------------------
//
// FR48 deleted the interim spawn seed, which left the two WEAPON smokes
// (matchSmoke, weaponsSmoke) clicking an empty Q slot. Eric's fix is a
// DEV-ONLY `fitOverride` room option: the door hands the World a list of line
// ids and the CAPTAIN comes up holding them, each paid for out of its own deck
// exactly as a pick would pay. Production never sees it — the dev gate strips
// the option and the queue never forwards it — so every assertion below is
// about a list the World was explicitly handed.

/** A captain handed a dev spawn fit at `addShip` (what the dev door does). */
function fitted(
  w: World,
  id: string,
  fit: readonly string[],
  hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat',
): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, DEFAULT_DECKS[hull], fit);
}

const slotIds = (rec: ShipRecord): (string | null)[] => rec.loadout.map((s) => s.equipmentId);
const copies = (rec: ShipRecord, id: string): number => rec.deck.cards.filter((c) => c === id).length;

describe('the dev spawn fit — fitOverride, captains only, paid out of the deck', () => {
  it('a captain comes up holding the line in slot 2, with the deck one copy shorter', () => {
    const w = bareWorld();
    const bare = captain(w, 'bare');
    const a = fitted(w, 'a', ['heavyTorpedo']);
    expect(a.cards).toEqual(['heavyTorpedo']);
    expect(slotIds(a)).toEqual(['gun', 'boost', 'heavyTorpedo', null, null, null, null, null, null]);
    // A fit is a real fit: the slot arrives LOADED, like any pick (amendment 41).
    expect(a.loadout[2].state).toEqual({ n: a.stats.equipment.heavyTorpedo.maxAmmo, reloadMsLeft: 0 });
    // ...and it was PAID FOR out of this hull's own pool, not conjured.
    expect(copies(a, 'heavyTorpedo')).toBe(copies(bare, 'heavyTorpedo') - 1);
    expect(a.deck.cards).toHaveLength(bare.deck.cards.length - 1);
    // No `bn` on the wire: a spawn is not a spend.
    w.step();
    expect(w.tickEvents.filter((e) => e.k === 'bn')).toEqual([]);
  });

  it('fits SEVERAL lines, in the order given, each paying its own copy', () => {
    const w = bareWorld();
    const bare = captain(w, 'bare');
    // A weapon and a LADDER: the weapon takes slot 2, the ladder only moves
    // stats — both are ordinary card fits, and both cost the deck a copy.
    const a = fitted(w, 'a', ['heavyTorpedo', 'armor']);
    expect(a.cards).toEqual(['heavyTorpedo', 'armor']);
    expect(slotIds(a)[2]).toBe('heavyTorpedo');
    expect(a.stats.maxHp).toBeGreaterThan(bare.stats.maxHp);
    expect(a.hp).toBe(a.stats.maxHp); // ARMOR heals its own maxHp delta (healOnGrant)
    expect(a.deck.cards).toHaveLength(bare.deck.cards.length - 2);
  });

  it('a hull\'s OWN deck is the bound: the Battleship never gets the Torpedo Boat\'s fish', () => {
    const w = bareWorld();
    // `broadside` and `heavyTorpedo` are real, built lines — neither is in the
    // Battleship's default deck, so neither can be paid for. `starShells` is.
    const b = fitted(w, 'b', ['broadside', 'heavyTorpedo', 'starShells'], 'battleship');
    expect(b.cards).toEqual(['starShells']);
    expect(slotIds(b)[2]).toBe('starShells');
  });

  it('NEVER a bot and NEVER a fleet hull — the same option buys them nothing', () => {
    const w = bareWorld();
    const ai = w.addShip('bot-1', 'BOT-1', 'bot', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat, ['heavyTorpedo']);
    const drone = w.addShip('fleet-1', 'FLEET-1', 'fleet', 'droneSmall', undefined, undefined, [], ['heavyTorpedo']);
    for (const s of [ai, drone]) {
      expect(s.devFit, s.id).toEqual([]);
      expect(s.cards, s.id).toEqual([]);
    }
    expect(slotIds(ai)).toEqual(['gun', 'boost', null, null, null, null, null, null, null]);
    expect(slotIds(drone)[1]).toBeNull(); // a drone never even grows a boost
  });

  it('DROPS an unknown id, a STUB line and a line this hull\'s deck does not carry', () => {
    const w = bareWorld();
    // 'nope' is not in the catalog; 'lightTorpedo' is a STUB in the TB list (so
    // it was never dealt into the pool); 'navalMines' is a real, built line the
    // Torpedo Boat's deck simply does not hold.
    const a = fitted(w, 'a', ['nope', 'lightTorpedo', 'navalMines', 'heavyTorpedo']);
    expect(a.cards).toEqual(['heavyTorpedo']); // only the one the deck could pay for
    expect(slotIds(a)[2]).toBe('heavyTorpedo');
  });

  it('cannot fit more copies than the deck holds — the pool is the bound', () => {
    const w = bareWorld();
    const held = copies(captain(w, 'bare'), 'heavyTorpedo'); // 3 in the shipped TB deck
    const a = fitted(w, 'a', new Array<string>(held + 2).fill('heavyTorpedo'));
    expect(a.cards).toHaveLength(held);
    expect(copies(a, 'heavyTorpedo')).toBe(0);
  });

  // THE FIT IS APPLIED AT SPAWN AND NEVER AGAIN (Story 8.10 review, P1). It
  // used to be RE-APPLIED by the non-hold redeploy, because that path wiped
  // the build and matchSmoke / weaponsSmoke would have lost their torpedo at
  // the countdown->active boundary. Now every redeploy preserves `cards`, so
  // the fit rides along by itself and a second application would DOUBLE it.
  // Both paths are pinned, because both are a smoke's real boundary.
  it.each([
    ['held (boarding) activation', true],
    ['dev/sandbox (non-hold) activation', false],
  ])('is KEPT, not re-applied, across the %s', (_label, hold) => {
    const w = bareWorld();
    const a = fitted(w, 'a', ['heavyTorpedo']);
    w.grantOpening();
    const left = copies(a, 'heavyTorpedo');
    w.resetForMatchStart(hold);
    expect(a.cards).toEqual(['heavyTorpedo']); // exactly one copy — never doubled
    expect(copies(a, 'heavyTorpedo')).toBe(left); // ...and it is not paid for twice
    expect(slotIds(a)[2]).toBe('heavyTorpedo');
    expect(a.hp).toBe(a.stats.maxHp);
  });

  it('an EMPTY fit is the shipped spawn, byte for byte — production is untouched', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = fitted(w, 'b', []);
    expect(a.devFit).toEqual([]);
    expect(b.devFit).toEqual([]);
    expect(b.cards).toEqual([]);
    expect(slotIds(b)).toEqual(slotIds(a));
    expect(b.deck.cards).toEqual(a.deck.cards);
  });
});
