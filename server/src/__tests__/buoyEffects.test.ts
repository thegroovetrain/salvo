// THE BUOY EFFECTS (Story 10.9, Eric 2026-10-27/28, epic-10 amendments 2 and
// 4) — the HEALING, SHIELD and SPEED buoys' owner-only terms, applied by the
// World's `applyBuoyEffects` row (directly before `tickRepairs`) off ONE scan
// per hull of its OWN live buoys: a KIND COUNTS ONCE (ruling 5).
//   - HEALING: `CONFIG.buoy.heal.missingPctPerS` of MISSING hp per second, with
//     NO out-of-combat gate, ADDITIVE with the passive regen when that is due.
//   - SHIELD: a second pool growing `maxHp × CONFIG.buoy.shield.maxHpPctPerS`
//     per second, NO cap, held `tailHoldMs` after leaving and ramped to zero
//     over `tailRampMs`; eaten AFTER armor and BEFORE the SHIELD BLOCK (ruling 4).
//   - SPEED: `CONFIG.buoy.speed.factor` of the RATED top speed, ADDING on the
//     base with the Shift (ruling 6), tailed by the same shared `buoyTail`.
// Every number is read from CONFIG and every case tests a RELATION.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  boostedKinematics,
  buoyTail,
  type BuoyKind,
  type ShipConfig,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { addDecoy } from '../game/decoys.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const B = CONFIG.buoy;

function bareWorld(seed = 1009): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(2000);
  return w;
}

function place(w: World, id: string, x: number, y: number, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  rec.state = { x, y, heading: 0, speed: 0 };
  return rec;
}

let seq = 0;
/** Mint a buoy of `kind` for `ownerId` at (x, y), live for its full lifetime. */
function buoy(w: World, ownerId: string, x: number, y: number, kind: BuoyKind): string {
  seq += 1;
  const id = `bt${seq}`;
  addDecoy(w.decoys, ownerId, x, y, id, kind, w.now + B.lifetimeMs, 0);
  return id;
}

/** Hold the out-of-combat regen OFF for the next tick (a hit just landed). */
function inCombat(w: World, s: ShipRecord): void {
  s.lastDamagedAt = w.now + DT;
}

const inner = (w: World) =>
  w as unknown as {
    tickKinematics(ship: ShipRecord, ribbons: readonly unknown[]): ShipConfig;
    applyDamage(victim: ShipRecord, amount: number, src: string, byId: string | undefined): void;
  };

describe('HEALING BUOY — 2 % of missing per second, uninterruptible, additive with regen, a kind counts once', () => {
  it('heals missing × pct × dt while a hit has just landed (no out-of-combat gate)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    buoy(w, 'o', 100, 0, 'healing');
    o.hp = o.stats.maxHp / 2;
    inCombat(w, o);
    const missing = o.stats.maxHp - o.hp;
    w.step();
    expect(o.hp - o.stats.maxHp / 2).toBeCloseTo(missing * B.heal.missingPctPerS * (DT / 1000), 9);
  });

  it('ADDS to the passive regen when that is due — both on the same missing hp', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    buoy(w, 'o', 100, 0, 'healing');
    o.hp = o.stats.maxHp / 2;
    o.lastDamagedAt = -1e9; // regen long due
    const missing = o.stats.maxHp - o.hp;
    w.step();
    const both = (o.stats.regen.missingPctPerS + B.heal.missingPctPerS) * (DT / 1000);
    expect(o.hp - o.stats.maxHp / 2).toBeCloseTo(missing * both, 9);
  });

  it('two healing buoys heal exactly as one (ruling 5); an ENEMY\'s, or one out of radius, heals nothing', () => {
    const gain = (layout: (w: World) => void): number => {
      const w = bareWorld();
      const o = place(w, 'o', 0, 0);
      place(w, 'e', 3000, 0);
      layout(w);
      o.hp = o.stats.maxHp / 2;
      inCombat(w, o);
      w.step();
      return o.hp - o.stats.maxHp / 2;
    };
    const one = gain((w) => buoy(w, 'o', 100, 0, 'healing'));
    expect(one).toBeGreaterThan(0);
    expect(gain((w) => { buoy(w, 'o', 100, 0, 'healing'); buoy(w, 'o', -100, 0, 'healing'); })).toBe(one);
    expect(gain((w) => buoy(w, 'e', 100, 0, 'healing'))).toBe(0);
    expect(gain((w) => buoy(w, 'o', B.radiusU + 1, 0, 'healing'))).toBe(0);
    expect(gain((w) => buoy(w, 'o', B.radiusU, 0, 'healing'))).toBe(one); // the edge is inside (inclusive)
  });
});

describe('SHIELD BUOY — a ramping second pool, eaten after armor and before the SHIELD BLOCK', () => {
  it('grows maxHp × pct × dt per tick inside (no cap, once per tick for two buoys), holds tailHoldMs outside, then ramps to null over tailRampMs', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const id = buoy(w, 'o', 100, 0, 'shield');
    buoy(w, 'o', -100, 0, 'shield'); // a second shield buoy grows nothing extra
    const perTick = o.stats.maxHp * B.shield.maxHpPctPerS * (DT / 1000);
    const N = 20;
    for (let i = 0; i < N; i++) w.step();
    expect(o.buoyShield!.hpLeft).toBeCloseTo(perTick * N, 9);
    const pool = o.buoyShield!.hpLeft;
    const insideAt = o.buoyShield!.insideAt;
    expect(insideAt).toBe(w.now);
    // Leave: both buoys gone.
    w.decoys.clear();
    void id;
    while (w.now + DT - insideAt <= B.tailHoldMs) {
      w.step();
      expect(o.buoyShield!.hpLeft).toBe(pool); // the HOLD
    }
    // Mid-ramp: the pool tracks rampFrom × tail.
    while (w.now - insideAt < B.tailHoldMs + B.tailRampMs / 2) w.step();
    const tail = buoyTail(w.now, insideAt, B.tailHoldMs, B.tailRampMs);
    expect(tail).toBeGreaterThan(0);
    expect(tail).toBeLessThan(1);
    expect(o.buoyShield!.hpLeft).toBeCloseTo(pool * tail, 9);
    while (w.now - insideAt < B.tailHoldMs + B.tailRampMs) w.step();
    expect(o.buoyShield).toBeNull();
  });

  it('damage order: ARMOR first, then the buoy pool, then the SHIELD BLOCK, then the hull (ruling 4)', () => {
    // The control: a hunkered (armored) Battleship with no pools — what the hull loses is the ARMORED blow.
    const RAW = 60;
    const armoredBlow = (): number => {
      const w = bareWorld();
      const v = place(w, 'v', 0, 0, 'battleship');
      place(w, 'e', 400, 0);
      v.hunkerUntil = w.now + 60_000;
      const before = v.hp;
      inner(w).applyDamage(v, RAW, 'shell', 'e');
      return before - v.hp;
    };
    const D = armoredBlow();
    expect(D).toBeGreaterThan(0);
    expect(D).toBeLessThan(RAW); // armor did bite — so the pools below see D, not RAW
    // A buoy pool BIGGER than the blow eats all of it; the block and the hull are untouched.
    {
      const w = bareWorld();
      const v = place(w, 'v', 0, 0, 'battleship');
      place(w, 'e', 400, 0);
      v.hunkerUntil = w.now + 60_000;
      v.buoyShield = { hpLeft: D + 5, insideAt: w.now };
      v.shield = { hpLeft: CONFIG.shieldBlock.hp, until: w.now + 60_000 };
      const hp = v.hp;
      inner(w).applyDamage(v, RAW, 'shell', 'e');
      expect(v.buoyShield!.hpLeft).toBeCloseTo(5, 9);
      expect(v.shield!.hpLeft).toBe(CONFIG.shieldBlock.hp);
      expect(v.hp).toBe(hp);
    }
    // A SMALLER buoy pool is spent first (null), the block takes the rest, the hull nothing.
    {
      const w = bareWorld();
      const v = place(w, 'v', 0, 0, 'battleship');
      place(w, 'e', 400, 0);
      v.hunkerUntil = w.now + 60_000;
      v.buoyShield = { hpLeft: 3, insideAt: w.now };
      v.shield = { hpLeft: CONFIG.shieldBlock.hp, until: w.now + 60_000 };
      const hp = v.hp;
      inner(w).applyDamage(v, RAW, 'shell', 'e');
      expect(v.buoyShield).toBeNull();
      expect(v.shield!.hpLeft).toBeCloseTo(CONFIG.shieldBlock.hp - (D - 3), 9);
      expect(v.hp).toBe(hp);
    }
  });

  it('an ENEMY\'s shield buoy grows nothing on you', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    place(w, 'e', 3000, 0);
    buoy(w, 'e', 100, 0, 'shield');
    for (let i = 0; i < 5; i++) w.step();
    expect(o.buoyShield).toBeNull();
  });
});

describe('SPEED BUOY — +factor of the RATED top speed, adding on the base with the Shift, tailed', () => {
  const capOf = (w: World, s: ShipRecord): number => inner(w).tickKinematics(s, []).maxSpeed;

  it('inside: rated + rated × factor; with the Shift: rated + rated × (boost + buoy) — one call on the base (ruling 6)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const k = o.stats.kinematics;
    expect(capOf(w, o)).toBe(k.maxSpeed);
    buoy(w, 'o', 100, 0, 'speed');
    w.step();
    expect(o.speedBuoyAt).toBe(w.now);
    expect(capOf(w, o)).toBe(boostedKinematics(k, B.speed.factor, true).maxSpeed);
    expect(capOf(w, o)).toBe(k.maxSpeed + k.maxSpeed * B.speed.factor);
    o.boostUntil = w.now + 5000;
    expect(capOf(w, o)).toBe(k.maxSpeed + k.maxSpeed * (CONFIG.boost.factor + B.speed.factor));
    // The Shift alone is byte-identical to the pre-10.9 boost.
    o.speedBuoyAt = 0;
    expect(capOf(w, o)).toBe(boostedKinematics(k, CONFIG.boost.factor, true).maxSpeed);
  });

  it('the tail: full through tailHoldMs after the last tick inside, linear to 0 over tailRampMs (the shared buoyTail)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    const k = o.stats.kinematics;
    w.now = 10 * (B.tailHoldMs + B.tailRampMs); // a clock past the tail, so every stamp below is > 0
    const at = (since: number): number => {
      o.speedBuoyAt = w.now - since;
      return capOf(w, o);
    };
    expect(at(B.tailHoldMs)).toBe(k.maxSpeed + k.maxSpeed * B.speed.factor);
    const mid = at(B.tailHoldMs + B.tailRampMs / 2);
    expect(mid).toBeCloseTo(k.maxSpeed + k.maxSpeed * B.speed.factor * 0.5, 9);
    expect(at(B.tailHoldMs + B.tailRampMs)).toBe(k.maxSpeed);
  });

  it('an ENEMY\'s speed buoy stamps nothing on you', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    place(w, 'e', 3000, 0);
    buoy(w, 'e', 100, 0, 'speed');
    w.step();
    expect(o.speedBuoyAt).toBe(0);
  });
});

describe('THE WIRE — buoyShield and speedBuoyAt ride ONLY `you`, and vanish when spent', () => {
  it('present on the owner\'s `you` while live, absent from a watcher\'s contact and own `you`; omitted once the tail / pool is gone', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    place(w, 'watcher', 200, 0);
    buoy(w, 'o', 50, 0, 'shield');
    buoy(w, 'o', 50, 0, 'speed');
    w.step();
    const you = buildFrame(w, 'o').you!;
    expect(you.speedBuoyAt).toBe(o.speedBuoyAt);
    expect(you.buoyShield).toEqual({ hp: Math.ceil(o.buoyShield!.hpLeft) });
    const seen = buildFrame(w, 'watcher');
    const contact = seen.contacts.find((c) => c.id === 'o')!;
    expect(contact).toBeDefined();
    for (const k of ['speedBuoyAt', 'buoyShield', 'dazzledUntil']) {
      expect(k in contact, k).toBe(false);
      expect(k in seen.you!, k).toBe(false);
    }
    // Spent: past the whole tail both keys leave the owner's frame.
    w.decoys.clear();
    const last = o.speedBuoyAt;
    while (w.now - last < B.tailHoldMs + B.tailRampMs) w.step();
    const after = buildFrame(w, 'o').you!;
    expect('speedBuoyAt' in after).toBe(false);
    expect('buoyShield' in after).toBe(false);
  });
});
