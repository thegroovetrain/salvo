// THE WEAPON WEIGHTING (Story 8.14, epic-8 amendments 90/91) — the World half
// of the mechanism Eric named: *"Just call it weighting and be done with it."*
//
// The LAW, in one paragraph. Every time a participant takes COPY 1 of an
// EQUIPMENT line — the bare weapon arriving — that line's draw weight for every
// OTHER captain is multiplied by `CONFIG.offer.weighting.factor` (0.75), never
// below `.floor` (0.25). The taker's own weight is untouched. Copies 2+ (tier
// cards) move nobody's weight. A take is PERMANENT for the match: the taker
// sinking, leaving or being removed restores nothing. Bots take like humans;
// fleet drones never pick a card, so they never appear at all.
//
// WHERE EACH HALF LIVES. `World.takes` is the ledger (line -> the ids that took
// copy 1), written ONLY by `recordTake` inside `applyCard`. `World.weightsFor`
// turns it into this ship's (line -> weight) map, excluding the asking ship.
// `sim/draw.ts` consumes that map inside STAGE 2 of the draw and nowhere else,
// so weighting changes WHICH weapon is dealt and never the odds of drawing A
// weapon (amendment 92) — draw.test.ts owns that half.
//
// SERVER-PRIVATE, ABSOLUTELY: neither the ledger nor a derived weight rides any
// frame, the welcome, the schema, `/metrics` or a log line. perception.test.ts
// pins the wire half over random worlds.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_GUN, lineWeight, type LineId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const FACTOR = CONFIG.offer.weighting.factor;
const FLOOR = CONFIG.offer.weighting.floor;

/** A real equipment line every hull can take copy 1 of. */
const WEAPON: LineId = 'heavyTorpedo';

function bareWorld(seed = 9): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

const captain = (w: World, id: string): ShipRecord =>
  w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);

/** This ship's weight for one line — ABSENT means the base 1.0, which is what
 *  `sim/draw.ts` reads an absent id as. */
const weightOf = (w: World, ship: ShipRecord, id: LineId): number => w.weightsFor(ship).get(id) ?? 1;

describe('the take ledger — what goes in, and what never does', () => {
  it('copy 1 of an EQUIPMENT line records the taker, exactly once', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    expect(w.takes.size).toBe(0);
    w.applyCard(a, WEAPON);
    expect([...w.takes.get(WEAPON)!]).toEqual(['a']);
    // A second copy is a TIER card, not a take: the set does not grow and no
    // new line appears.
    w.applyCard(a, WEAPON);
    expect([...w.takes.get(WEAPON)!]).toEqual(['a']);
    expect([...w.takes.keys()]).toEqual([WEAPON]);
  });

  it('LADDERS, ADD-ONS and CONSUMABLES never record a take', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    for (const id of ['armor', 'speed', 'reload', 'deckGun', 'hullRepair'] as LineId[]) w.applyCard(a, id);
    expect(a.cards).toHaveLength(5); // they really were fitted...
    expect(w.takes.size).toBe(0); // ...and not one of them is a take
  });

  it('a FLEET DRONE never appears in the ledger (it never picks a card at all)', () => {
    const w = bareWorld();
    const d = w.addShip('fleet-1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined);
    w.grantXp(d, 5); // a drone banks nothing, so it can never spend
    expect(d.bankedLevels).toBe(0);
    expect(d.offer).toBeNull();
    expect(w.takes.size).toBe(0);
  });

  it('a DEV SPAWN FIT counts as a take — it goes through the same applyCard', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_GUN, [WEAPON]);
    expect(a.cards).toEqual([WEAPON]);
    expect([...w.takes.get(WEAPON)!]).toEqual(['a']);
  });

  it('a SPEND through the wire path records the take like any other fit', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    a.bankedLevels = 1;
    a.offer = [WEAPON];
    expect(w.spendPoint('a', 0)).toBe(true);
    expect([...w.takes.get(WEAPON)!]).toEqual(['a']);
  });
});

describe('weightsFor — the numbers Eric ruled (amendment 90)', () => {
  it('one OTHER taker weighs the line 0.75 for everybody else; the taker is untouched', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b');
    w.applyCard(a, WEAPON);
    expect(weightOf(w, b, WEAPON)).toBeCloseTo(0.75, 12);
    expect(FACTOR).toBe(0.75);
    // SELF-EXCLUSION: A's own weight for the line A took never moves.
    expect(weightOf(w, a, WEAPON)).toBe(1);
    expect(w.weightsFor(a).has(WEAPON)).toBe(false); // absent, not 1.0-valued
  });

  it('TWO takers weigh it 0.5625 for a third; each taker sees only the OTHER one', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b');
    const c = captain(w, 'c');
    w.applyCard(a, WEAPON);
    w.applyCard(b, WEAPON);
    expect(weightOf(w, c, WEAPON)).toBeCloseTo(0.5625, 12);
    expect(weightOf(w, a, WEAPON)).toBeCloseTo(0.75, 12); // only B counts for A
    expect(weightOf(w, b, WEAPON)).toBeCloseTo(0.75, 12); // ...and only A for B
  });

  it('FIVE takers hit the floor, and it never goes below it however many follow', () => {
    const w = bareWorld();
    const victim = captain(w, 'victim');
    for (let i = 0; i < 5; i += 1) w.applyCard(captain(w, `t${i}`), WEAPON);
    expect(weightOf(w, victim, WEAPON)).toBeCloseTo(0.25, 12);
    expect(FLOOR).toBe(0.25);
    expect(FACTOR ** 5).toBeLessThan(FLOOR); // 0.2373… — the floor is doing work
    for (let i = 5; i < 12; i += 1) w.applyCard(captain(w, `t${i}`), WEAPON);
    expect(weightOf(w, victim, WEAPON)).toBe(FLOOR); // clamped, never lower
  });

  it('the World agrees with the shared curve, step for step', () => {
    const w = bareWorld();
    const victim = captain(w, 'victim');
    for (let n = 1; n <= 6; n += 1) {
      w.applyCard(captain(w, `t${n}`), WEAPON);
      expect(weightOf(w, victim, WEAPON), `n=${n}`).toBeCloseTo(lineWeight(n), 12);
    }
  });

  it('a TIER-2 take changes NOBODY\'s weight', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b');
    w.applyCard(a, WEAPON);
    const before = weightOf(w, b, WEAPON);
    w.applyCard(a, WEAPON); // copy 2 — a tier bump
    w.applyCard(a, WEAPON); // copy 3
    expect(weightOf(w, b, WEAPON)).toBe(before);
    expect(weightOf(w, a, WEAPON)).toBe(1);
  });

  it('a take is PERMANENT: the taker SINKING restores nothing', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const b = captain(w, 'b');
    w.applyCard(a, WEAPON);
    expect(weightOf(w, b, WEAPON)).toBeCloseTo(0.75, 12);
    w.sinkShip('a');
    expect(weightOf(w, b, WEAPON)).toBeCloseTo(0.75, 12);
    // ...nor does the taker LEAVING the room, which removes the record itself.
    w.removeShip('a');
    expect(w.ships.has('a')).toBe(false);
    expect(weightOf(w, b, WEAPON)).toBeCloseTo(0.75, 12);
    // ...nor does the match boundary.
    w.resetForMatchStart();
    expect(weightOf(w, b, WEAPON)).toBeCloseTo(0.75, 12);
  });

  it('a BOT\'s take weights a HUMAN — a participant is a participant', () => {
    const w = bareWorld();
    const human = captain(w, 'a');
    const bot = w.addBot(undefined, undefined);
    w.applyCard(bot, WEAPON);
    expect(weightOf(w, human, WEAPON)).toBeCloseTo(0.75, 12);
    // ...and the other way round, which is the same rule read backwards.
    w.applyCard(human, 'navalMines');
    expect(weightOf(w, bot, 'navalMines' as LineId)).toBeCloseTo(0.75, 12);
  });

  it('an untouched match costs nothing: weightsFor is EMPTY, so every line weighs 1', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    captain(w, 'b');
    expect(w.weightsFor(a).size).toBe(0);
    // ...and a line only ONE ship has taken stays out of that ship's own map.
    w.applyCard(a, WEAPON);
    expect(w.weightsFor(a).size).toBe(0);
  });
});
