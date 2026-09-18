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
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
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

  it('the DEV/SANDBOX redeploy still wipes the lot, `mulliganed` included', () => {
    const { w, a } = heldStartLine();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    const deckList = a.deckList;
    w.resetForMatchStart(); // no hold — the ready room's fresh match
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
    expect(a.cards).toEqual([]);
    expect(a.mulliganed).toBe(false);
    expect(a.deckList).toBe(deckList); // the frozen list never moves
    expect(a.deck.cards.length).toBeGreaterThan(0);
  });
});
