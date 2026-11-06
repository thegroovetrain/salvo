// THE PASSIVE REGEN on the server (Story 10.5, Eric 2026-11-05, epic-10
// amendment 11, R8 — "add back in the 2% missing HP passive healing ...
// Make it 15, 30 was too long."): a hull that has lost no hull hp for
// `CONFIG.regen.outOfCombatMs` heals the shared `regenGain` of its MISSING hp
// every tick (tickRepairs), until the next blow that removes hull hp — from
// ANY source — restarts the wait. It runs BESIDE the HULL REPAIR pool. The law
// itself is unit-tested in shared (sim/regen.ts); this file pins the World's
// wiring. Every number is a relation against CONFIG / the shared law.

import { describe, it, expect } from 'vitest';
import { CONFIG, abilityCode, isSinking, regenGain } from '@salvo/shared';
import { World, type DamageSource, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const WAIT_TICKS = CONFIG.regen.outOfCombatMs / DT;

function bareWorld(seed = 9): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, undefined);
  rec.state = { x, y: 0, heading: 0, speed: 0 };
  return rec;
}

const gate = (w: World) =>
  w as unknown as { applyDamage(v: ShipRecord, n: number, s: DamageSource, by: string | undefined): void };

/** A hurt hull whose last blow landed NOW. */
function hurt(w: World, a: ShipRecord): void {
  a.hp = a.stats.maxHp / 2;
  a.lastDamagedAt = w.now;
}

describe('passive regen — the wait, then 2 % of missing per second', () => {
  it('pays NOTHING while the wait runs, then exactly regenGain(hp, maxHp, dt) per tick once due', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    hurt(w, a);
    const start = a.hp;
    // Every tick strictly inside the wait pays nothing.
    while (w.now + DT - a.lastDamagedAt < CONFIG.regen.outOfCombatMs) w.step();
    expect(a.hp).toBe(start);
    // The first due tick pays the shared law, and so does the next.
    for (let k = 0; k < 3; k += 1) {
      const before = a.hp;
      w.step();
      expect(w.now - a.lastDamagedAt).toBeGreaterThanOrEqual(CONFIG.regen.outOfCombatMs);
      expect(a.hp).toBeCloseTo(before + regenGain(before, a.stats.maxHp, DT / 1000), 9);
      expect(a.hp).toBeGreaterThan(before);
    }
  });

  it('a FULL hull gains nothing; a regenerating hull never exceeds maxHp', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < WAIT_TICKS + 5; i += 1) w.step();
    expect(a.hp).toBe(a.stats.maxHp);
    a.hp = a.stats.maxHp - 0.5; // under one hp missing: the snap to full
    w.step();
    expect(a.hp).toBe(a.stats.maxHp);
  });

  it('PARTICIPANTS only: a due combat bot regenerates, a due PvE fleet drone never does (epic-9 amendment 48)', () => {
    const w = bareWorld();
    const bot = w.addBot('bismarck', 'duelist');
    const drone = w.addShip('d1', 'D1', 'fleet', 'droneLarge', undefined, { x: 2000, y: 0 });
    for (const rec of [bot, drone]) {
      rec.hp = rec.stats.maxHp / 2;
      rec.lastDamagedAt = w.now - CONFIG.regen.outOfCombatMs * 2;
    }
    const botBefore = bot.hp;
    const droneBefore = drone.hp;
    w.step();
    expect(bot.hp).toBeCloseTo(botBefore + regenGain(botBefore, bot.stats.maxHp, DT / 1000), 9);
    expect(drone.hp).toBe(droneBefore);
  });

  it('a SINKING hull never regenerates (no hp comes back in the window)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.respawnEnabled = false;
    a.lastDamagedAt = w.now - CONFIG.regen.outOfCombatMs * 2;
    w.sinkShip('a');
    expect(isSinking(a.lifecycle)).toBe(true);
    const hp = a.hp;
    w.step();
    expect(a.hp).toBe(hp);
  });
});

describe('passive regen — every source that removes hull hp restarts the wait', () => {
  const SOURCES: readonly DamageSource[] = ['shell', 'burst', 'torpedo', 'mine', 'contact', 'grind', 'burn', 'storm'];

  it.each(SOURCES)('a %s blow on a regenerating hull stamps the clock and stops the regen', (src) => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 900);
    hurt(w, a);
    a.lastDamagedAt = w.now - CONFIG.regen.outOfCombatMs * 2; // long out of combat
    const before = a.hp;
    w.step();
    expect(a.hp).toBeGreaterThan(before); // premise: it was regenerating
    gate(w).applyDamage(a, 10, src, src === 'storm' ? undefined : 'b');
    expect(a.lastDamagedAt).toBe(w.now);
    const hit = a.hp;
    expect(hit).toBeLessThan(before + regenGain(before, a.stats.maxHp, DT / 1000));
    w.step();
    expect(a.hp).toBe(hit); // the wait restarted: nothing paid
  });

  it('a blow that removes NOTHING (weapons-safe room) does not restart the wait', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 900);
    hurt(w, a);
    const stamp = w.now - CONFIG.regen.outOfCombatMs * 2;
    a.lastDamagedAt = stamp;
    w.damageEnabled = false;
    gate(w).applyDamage(a, 10, 'shell', 'b');
    expect(a.lastDamagedAt).toBe(stamp);
  });
});

describe('passive regen BESIDE the HULL REPAIR pool (neither resets the other)', () => {
  it('a due hull with an open pool takes the pool drain AND the regen on the same tick', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    hurt(w, a);
    a.lastDamagedAt = w.now - CONFIG.regen.outOfCombatMs * 2;
    // A directed open pool: the amount and the rate a press would stamp from
    // the ship's own `stats.repair` (Story 10.6, R8 / R15).
    a.repairHp = a.stats.repair.regenHp;
    a.repairRate = a.stats.repair.regenHp / a.stats.repair.regenMs;
    const before = a.hp;
    const paid = (a.stats.repair.regenHp / a.stats.repair.regenMs) * DT;
    w.step();
    const afterPool = before + paid;
    expect(a.hp).toBeCloseTo(afterPool + regenGain(afterPool, a.stats.maxHp, DT / 1000), 9);
    expect(a.repairHp).toBeCloseTo(a.stats.repair.regenHp - paid, 9);
  });

  it('a HULL REPAIR press does not reset the regen clock', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    hurt(w, a);
    const stamp = w.now - CONFIG.regen.outOfCombatMs * 2;
    a.lastDamagedAt = stamp;
    a.input = { ...a.input, seq: a.input.seq + 1, actSeq: a.lastActSeq + 1, act: abilityCode('repair') };
    w.step();
    expect(a.repairReadyAt).toBeGreaterThan(w.now); // premise: the press fired
    expect(a.lastDamagedAt).toBe(stamp);
  });
});
