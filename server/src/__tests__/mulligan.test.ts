// THE OPENING — the level-zero grant and the one free countdown redraw (Story
// 8.10, FR48; Eric rulings, epic-8 amendments 59-64).
//
// Two mechanisms, both server-side, both reachable from the wire:
//
//   grantOpening()  — `Match.startCountdown()` calls it once per match. Every
//                     PARTICIPANT (human captain or AI captain, never a PvE
//                     fleet hull) banks ONE level and draws its hand through
//                     the ordinary four-slot draw (Story 10.7 — the Equipment
//                     slot deals a bare weapon on a bare hull; the level-zero
//                     guarantee is retired). `level` does not move: the HUD
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
// read of the COMMON POOL since Story 8.14), so nothing is given back and the
// bank still reads 1.

import { describe, it, expect, vi } from 'vitest';
import { CONFIG, CATALOG, MULLIGAN_CHOICE, SLOT_COUNT, boonStackCount, isStubLine, type LineId } from '@salvo/shared';
import { DEFAULT_SHIFT, familySlotFor } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';
import { expectLevelZeroPlan } from './offerPlanFixture.js';

/** Islands cleared and the raster flattened — no terrain in an economy test. */
function bareWorld(seed = 4, opts = {}): World {
  // 8.14: there is no deck and no match pool to set up — every captain draws
  // from the whole catalog, bounded by caps and slots.
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A captain drawing from the common pool on the default seat gun. */
function captain(w: World, id: string, hull: 'bismarck' | 'yamato' | 'warspite' = 'bismarck'): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
}

/** An AI captain (a participant, never a human) — the same economy. */
function bot(w: World, id: string): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'bot', 'bismarck', undefined, undefined);
}

/** A PvE fleet hull — world content, never draws, no economy. */
function fleet(w: World, id: string): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'fleet', 'droneSmall', undefined, undefined);
}

const ptIds = (w: World): string[] => w.tickEvents.filter((e) => e.k === 'pt').map((e) => e.id);

/** The countdown, as the sim sees it: Match sets this flag and nothing else
 *  does. Opening it by hand is exactly what `startCountdown()` does. */
function openCountdown(w: World): void {
  w.countdownOpen = true;
}

// ---------- the level-zero grant ---------------------------------------------

describe('grantOpening — one banked level and a hand, participants only', () => {
  it('captains and bots bank LV 0 / pts 1 / xp 0 / offer[4]; fleet hulls get NOTHING', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b', 'yamato');
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
    // A fleet hull never draws: it has no refit surface to spend a level on.
    expect(drone.bankedLevels).toBe(0);
    expect(drone.offer).toBeNull();
  });

  it('the hand is the four-slot plan: a ship line, then a bare weapon the hull can take', () => {
    // The first offer must never be four ladders on a hull with no weapon —
    // the Equipment slot (card 1, Story 10.7) is that promise now: on a bare
    // hull every eligible equipment line is a bare weapon.
    for (const hull of ['bismarck', 'yamato', 'warspite'] as const) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const w = bareWorld(seed);
        const a = captain(w, 'a', hull);
        w.grantOpening();
        expectLevelZeroPlan(a, `${hull}/${seed}`);
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

  it('the DRAW consumes nothing — the bank is the only cost (a draw is a read)', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    w.grantOpening();
    // Nothing left the ship and nothing left the world: the pool is the
    // catalog, so a draw cannot thin anything (Story 8.14).
    expect(a.cards).toEqual([]);
    expect(w.takes.size).toBe(0);
    expect(a.bankedLevels).toBe(1);
  });

  // AN EMPTY DRAW BANKS NOTHING (Story 10.7, R3): an all-stub catalog has no
  // dealable line, so the opening grant draws empty and the bank drops to 0.
  it('an all-stub catalog draws empty at the opening: nothing banked, no offer, no pt', () => {
    const w = bareWorld(4, { catalog: { ghost: { id: 'ghost', kind: 'consumable', cap: 5, stub: true, tiers: [] } } });
    const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
    w.grantOpening();
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull(); // an offer-less level advertises no refit
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

  it('happy path: the hand changes, `mulliganed` latches, a pt is queued, nothing is consumed', () => {
    const w = bareWorld(4);
    const a = captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    w.step();
    const handA = [...a.offer!];

    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);

    expect(a.offer).toHaveLength(CONFIG.offer.size);
    expect([...a.offer!]).not.toEqual(handA);
    expect(a.mulliganed).toBe(true);
    expect(a.bankedLevels).toBe(1); // a redraw spends NO level
    expect(a.cards).toEqual([]); // ...and fits no card
    expect(w.takes.size).toBe(0); // ...and records no take
    w.step();
    expect(ptIds(w)).toEqual(['a']);
  });

  it('the redrawn hand is the same plan: a ship line, then a bare weapon the hull can take', () => {
    // A redraw is the draw run again (R2), so the plan holds for it too.
    for (let seed = 1; seed <= 12; seed += 1) {
      const { w, a } = atTheStartLine(seed);
      expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
      expectLevelZeroPlan(a, `redraw/${seed}`);
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

  // THE OPS SEAMS ARE GONE (Story 8.14, epic-8 amendment 94). `onDeckPick`,
  // `onMulligan` and `onDeckExhausted` were three WorldOptions callbacks feeding
  // the `/metrics` `deck.*` counters; Eric deleted the counters and the World no
  // longer offers anywhere to hang them. The tests that pinned the callbacks,
  // their once-only firing and their throw-swallowing are deleted with them —
  // what SURVIVES is the behaviour underneath, which is pinned here: a refused
  // pick changes nothing, a refused redraw changes nothing, and neither of them
  // needs a diagnostic to be correct.
  it('a REFUSED pick and a REFUSED redraw both leave the economy byte-identical', () => {
    const w = bareWorld(4);
    const a = captain(w, 'a');
    w.grantOpening(); // countdown NOT open, so the redraw is refused too
    const hand = a.offer;

    expect(w.spendPoint('a', 99)).toBe(false); // out of bounds
    expect(w.spendPoint('a', -1)).toBe(false); // the retired heal sentinel
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false); // the countdown is shut

    expect(a.offer).toBe(hand); // the SAME array, not an equal one
    expect(a.bankedLevels).toBe(1);
    expect(a.mulliganed).toBe(false);
    expect(a.cards).toEqual([]);
    expect(w.takes.size).toBe(0);
  });

  it('a SUCCESSFUL pick fits the card, spends the level and draws the next hand', () => {
    const w = bareWorld(4);
    const a = captain(w, 'a');
    w.grantOpening();
    const picked = a.offer![1];

    expect(w.spendPoint('a', 1)).toBe(true);

    expect(a.cards).toEqual([picked]);
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull(); // nothing banked behind it, so nothing materializes
  });
});

// ---------- the REDRAW flag on the own frame (Story 10.7, R4) -----------------
//
// `you.rd` is server truth for the REDRAW pip. A reconnecting client is the
// SAME session on the SAME ship record (ArenaRoom's reconnection branch never
// re-runs onJoin) and simply receives the next `buildFrame` — so "the pip reads
// used after a reconnect" is "every later frame built for that ship says true".

describe('the own frame says whether the REDRAW is used (`rd`)', () => {
  it('false before the redraw, true after it, and still true in every later frame', () => {
    const w = bareWorld();
    captain(w, 'a');
    captain(w, 'b');
    openCountdown(w);
    w.grantOpening();
    w.step();
    expect(buildFrame(w, 'a').you!.rd).toBe(false);
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    expect(buildFrame(w, 'a').you!.rd).toBe(true);
    w.step();
    w.step();
    expect(buildFrame(w, 'a').you!.rd).toBe(true); // the frame a reconnect gets
    expect(buildFrame(w, 'b').you!.rd).toBe(false); // per ship, not per room
  });

  it('a refused redraw leaves it false', () => {
    const w = bareWorld();
    captain(w, 'a');
    w.grantOpening(); // the countdown is NOT open: the press is refused
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(false);
    expect(buildFrame(w, 'a').you!.rd).toBe(false);
  });

  it('it survives the activation redeploy along with `mulliganed`', () => {
    const w = bareWorld();
    captain(w, 'a');
    openCountdown(w);
    w.grantOpening();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    w.resetForMatchStart(true);
    w.countdownOpen = false;
    expect(buildFrame(w, 'a').you!.rd).toBe(true);
  });

  it('no contact row ever carries `rd` — it is self-private', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b');
    a.state.x = 0;
    a.state.y = 0;
    b.state.x = 0;
    b.state.y = -150; // inside mutual sight, clear of a's hull
    openCountdown(w);
    w.grantOpening();
    expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
    w.step();
    const fb = buildFrame(w, 'b');
    const contact = fb.contacts.find((c) => c.id === 'a');
    expect(contact).toBeDefined();
    expect('rd' in contact!).toBe(false);
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
    // Take the Equipment card (slot 1, Story 10.7) — at level zero a bare
    // weapon, i.e. something that actually occupies a slot.
    const picked = a.offer![1] as LineId;
    expect(w.spendPoint('a', 1)).toBe(true);
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
    const hand = a.offer;
    const stream = a.drawRng;
    a.hp = 3;
    w.resetForMatchStart(); // no hold — the ready room's fresh match
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).toBe(hand); // the same array, not a redraw
    expect(a.mulliganed).toBe(true); // the redraw stays spent
    expect(a.drawRng).toBe(stream); // ...and the draw stream is never reseeded
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
  hull: 'bismarck' | 'yamato' | 'warspite' = 'bismarck',
): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, DEFAULT_SHIFT, fit);
}

const slotIds = (rec: ShipRecord): (string | null)[] => rec.loadout.map((s) => s.equipmentId);
describe('the dev spawn fit — fitOverride, captains only, bounded by the cap', () => {
  it('a captain comes up holding the line in slot 2, and the take is recorded', () => {
    const w = bareWorld();
    const a = fitted(w, 'a', ['heavyTorpedo']);
    expect(a.cards).toEqual(['heavyTorpedo']);
    expect(slotIds(a)).toEqual(['mainBattery', 'boost', 'heavyTorpedo', ...new Array<null>(SLOT_COUNT - 3).fill(null)]); // the torpedo family slot
    // A fit is a real fit: the slot arrives LOADED, like any pick (amendment 41).
    expect(a.loadout[2].state).toEqual({ n: a.stats.equipment.heavyTorpedo.maxAmmo, reloadMsLeft: 0 });
    // ...and it goes through applyCard, so it COUNTS AS A TAKE (Story 8.14):
    // every other captain's weight for the line steps down.
    expect([...w.takes.get('heavyTorpedo' as LineId)!]).toEqual(['a']);
    // No `bn` on the wire: a spawn is not a spend.
    w.step();
    expect(w.tickEvents.filter((e) => e.k === 'bn')).toEqual([]);
  });

  it('fits SEVERAL lines, in the order given', () => {
    const w = bareWorld();
    const bare = captain(w, 'bare');
    // A weapon and a LADDER: the weapon takes slot 2, the ladder only moves
    // stats — both are ordinary card fits. Only the WEAPON is a take.
    // (HULL POINTS was the ladder here until Story 10.3 deleted it, Eric
    // 2026-11-04, epic-10 amendment 8; ARMOR stands in.)
    const a = fitted(w, 'a', ['heavyTorpedo', 'armor']);
    expect(a.cards).toEqual(['heavyTorpedo', 'armor']);
    expect(slotIds(a)[2]).toBe('heavyTorpedo');
    expect(a.stats.armor).toBeGreaterThan(bare.stats.armor);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(w.takes.has('armor' as LineId)).toBe(false); // a ladder is never a take
  });

  it('ANY non-stub line is fittable now — the hull no longer bounds it, the CAP does', () => {
    const w = bareWorld();
    // Story 8.14: with the decks retired there is no per-hull list to pay a
    // copy out of, so a Battleship can be handed the Torpedo Boat's fish.
    // (BROADSIDE left the deal, Story 10.5 R6 — it has no family slot, so a
    // fit naming it is refused.)
    const b = fitted(w, 'b', ['broadside', 'heavyTorpedo', 'starShells'], 'yamato');
    expect(b.cards).toEqual(['heavyTorpedo', 'starShells']);
    // ...but the line's own cap still bounds it, and an unknown/stub id drops.
    const cap = CATALOG.armor.cap;
    const c = fitted(w, 'c', [...new Array<string>(cap + 3).fill('armor'), 'nope', 'depthCharge']);
    expect(boonStackCount(c.cards, 'armor')).toBe(cap);
    expect(c.cards.filter((id) => id === 'nope' || id === 'depthCharge')).toEqual([]);
  });

  it('NEVER a bot and NEVER a fleet hull — the same option buys them nothing', () => {
    const w = bareWorld();
    const ai = w.addShip('bot-1', 'BOT-1', 'bot', 'bismarck', undefined, undefined, DEFAULT_SHIFT, ['heavyTorpedo']);
    const drone = w.addShip('fleet-1', 'FLEET-1', 'fleet', 'droneSmall', undefined, undefined, DEFAULT_SHIFT, ['heavyTorpedo']);
    for (const s of [ai, drone]) {
      expect(s.devFit, s.id).toEqual([]);
      expect(s.cards, s.id).toEqual([]);
    }
    expect(slotIds(ai)).toEqual(['mainBattery', 'boost', ...new Array<null>(SLOT_COUNT - 2).fill(null)]);
    expect(slotIds(drone)[1]).toBeNull(); // a drone never even grows a boost
  });

  it('DROPS an unknown id and a STUB line — the two the catalog refuses', () => {
    const w = bareWorld();
    // 'nope' is not in the catalog at all; 'depthCharge' is a STUB (authored
    // but unbuilt, amendment 11). 'navalMines' used to be refused here as
    // "not in this hull's deck" and is now perfectly fittable: Story 8.14
    // retired the decks, so a hull is no longer a bound on what it can hold.
    // Each lands in its FAMILY slot (Story 10.5), whatever the fit order.
    const a = fitted(w, 'a', ['nope', 'depthCharge', 'navalMines', 'heavyTorpedo']);
    expect(a.cards).toEqual(['navalMines', 'heavyTorpedo']);
    expect(slotIds(a)[familySlotFor('heavyTorpedo')!]).toBe('heavyTorpedo');
    expect(slotIds(a)[familySlotFor('navalMines')!]).toBe('navalMines');
  });

  it('cannot fit PAST a line\'s CAP — the cap is the whole bound now (Story 8.14)', () => {
    // There is no deck left to run out of copies, so the CAP is the only thing
    // standing between a dev fit and a build no pick, draw or offer could ever
    // produce.
    const w = bareWorld();
    const a = fitted(w, 'a', new Array<string>(CATALOG.heavyTorpedo.cap + 3).fill('heavyTorpedo'));
    expect(boonStackCount(a.cards, 'heavyTorpedo')).toBe(CATALOG.heavyTorpedo.cap);
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
    w.resetForMatchStart(hold);
    expect(a.cards).toEqual(['heavyTorpedo']); // exactly one copy — never doubled
    expect([...w.takes.get('heavyTorpedo' as LineId)!]).toEqual(['a']); // ...and one take
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
    expect(w.takes.size).toBe(0);
  });
});

// ---------- a refused dev-fit line is logged (Story 10.1 F4; Story 10.5) ------
//
// A dev fit line that `refusesCard` drops (a SECOND KIND of a filled family —
// Story 10.5, one kind per slot — a stub, a capped line) is never dropped
// silently: one `devFit.refused` warning per dropped line, with
// `pickRefusal`'s reason. (The kit, and its addShip guard, left with Story 10.5.)

describe('the dev spawn fit — a refused line is logged, not silently dropped', () => {
  it('a SECOND torpedo kind after the first logs devFit.refused (noWeaponSlot) and is not fitted', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const w = bareWorld();
      const a = fitted(w, 'a', ['lightTorpedo', 'heavyTorpedo']);
      expect(a.cards).toEqual(['lightTorpedo']);
      expect(slotIds(a)[familySlotFor('lightTorpedo')!]).toBe('lightTorpedo');
      expect(w.takes.has('heavyTorpedo' as LineId)).toBe(false); // a refused fit is no take
      const prefix = 'warn devFit.refused ';
      const warns = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(prefix));
      expect(warns).toHaveLength(1);
      expect(JSON.parse(warns[0].slice(prefix.length))).toEqual({ id: 'a', line: 'heavyTorpedo', reason: 'noWeaponSlot' });
    } finally {
      log.mockRestore();
    }
  });
});

