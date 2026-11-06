// THE TWO COOLDOWN ABILITIES on the server (Story 10.5, Eric 2026-11-05,
// epic-10 amendment 11, R1–R3, R5): HULL REPAIR (`C`) and SMOKE (`V`) are
// per-ship cooldowns driven by `InputMsg.act` on an actSeq edge — fixed for
// every hull, never shortened by RELOAD, never touched by INSTANT RELOAD,
// ready at spawn and again at every fresh life. Plus R5: a drone kill pays XP
// only — no drop, no card.
//
// The press / refusal / denial wire matrix lives in denials.test.ts and the
// SMOKE cloud in countermeasure.test.ts; the own-frame privacy of the two
// stamps in frames.test.ts and the perception fuzz. Every number here is a
// relation against CONFIG or the shared law (sim/abilities.ts).

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  abilityCode,
  abilityCooldownMs,
  abilityReadyAt,
  type CooldownAbilityId,
  type GameEvent,
  type InputMsg,
  type ShiftId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;

function bareWorld(seed = 5): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, shift: ShiftId = 'boost'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'warspite', undefined, undefined, shift);
  rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
  return rec;
}

/** One ability press through the real input path, resolved by one step. */
function press(w: World, ship: ShipRecord, act: number): void {
  const input: InputMsg = { ...ship.input, seq: ship.input.seq + 1, actSeq: ship.lastActSeq + 1, act };
  w.submitInput(ship.id, input);
  w.step();
}

/** Press both cooldown abilities on a hurt hull so both stamps are running. */
function coolBoth(w: World, a: ShipRecord): void {
  a.hp = a.stats.maxHp / 2;
  a.lastDamagedAt = w.now;
  press(w, a, abilityCode('repair'));
  press(w, a, abilityCode('smoke'));
  expect(a.repairReadyAt).toBeGreaterThan(w.now);
  expect(a.smokeReadyAt).toBeGreaterThan(w.now);
}

describe('cooldown abilities — ready at spawn, the stamp is the fixed law', () => {
  it('a fresh hull carries both ready (0); a press stamps exactly abilityReadyAt(now, id)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.repairReadyAt).toBe(0);
    expect(a.smokeReadyAt).toBe(0);
    a.hp = a.stats.maxHp / 2;
    a.lastDamagedAt = w.now;
    press(w, a, abilityCode('repair'));
    expect(a.repairReadyAt).toBe(abilityReadyAt(w.now, a.stats, 'repair'));
    press(w, a, abilityCode('smoke'));
    expect(a.smokeReadyAt).toBe(abilityReadyAt(w.now, a.stats, 'smoke'));
  });
});

describe('RELOAD never shortens HULL REPAIR or SMOKE (R3)', () => {
  it('RELOAD cards taken while cooling leave both stamps untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    coolBoth(w, a);
    const repair = a.repairReadyAt;
    const smoke = a.smokeReadyAt;
    for (let i = 0; i < CATALOG.reload.cap; i += 1) w.applyCard(a, 'reload');
    expect(a.repairReadyAt).toBe(repair);
    expect(a.smokeReadyAt).toBe(smoke);
  });

  it('a press on a hull at RELOAD cap still stamps the full fixed cooldown', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < CATALOG.reload.cap; i += 1) w.applyCard(a, 'reload');
    a.hp = a.stats.maxHp / 2;
    a.lastDamagedAt = w.now;
    for (const id of ['repair', 'smoke'] as const satisfies readonly CooldownAbilityId[]) {
      press(w, a, abilityCode(id));
      const readyAt = id === 'repair' ? a.repairReadyAt : a.smokeReadyAt;
      expect(readyAt - w.now).toBe(abilityCooldownMs(a.stats, id));
    }
  });
});

describe('INSTANT RELOAD never touches HULL REPAIR or SMOKE (R3)', () => {
  it('the Shift finishes running weapon reloads and leaves both cooldown stamps exactly where they were', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'instantReload');
    coolBoth(w, a);
    const repair = a.repairReadyAt;
    const smoke = a.smokeReadyAt;
    a.turrets.forEach((t) => (t.reloadMsLeft = 2000)); // something for it to finish
    press(w, a, abilityCode('shift'));
    expect(a.turrets.every((t) => t.reloadMsLeft === 0)).toBe(true); // premise: the Shift fired
    expect(a.repairReadyAt).toBe(repair);
    expect(a.smokeReadyAt).toBe(smoke);
  });
});

describe('both abilities are READY again at every fresh life', () => {
  it('respawn re-readies both', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    coolBoth(w, a);
    w.sinkShip('a');
    // Founder, then the respawn delay (a waiting-phase world respawns).
    const ticks = (CONFIG.ship.sinkingWindowMs + CONFIG.ship.respawnDelay) / DT + 5;
    for (let i = 0; i < ticks && a.lifecycle.kind !== 'alive'; i += 1) w.step();
    expect(a.lifecycle.kind).toBe('alive');
    expect(a.repairReadyAt).toBe(0);
    expect(a.smokeReadyAt).toBe(0);
  });

  it('the match-start redeploy re-readies both', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    coolBoth(w, a);
    w.resetForMatchStart();
    expect(a.repairReadyAt).toBe(0);
    expect(a.smokeReadyAt).toBe(0);
  });
});

describe('a drone kill pays XP only (R5) — no drop, no card', () => {
  it('sinking a PvE drone credits the kill and changes no card; no drop event exists', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined);
    d.state = { x: 300, y: 0, heading: 0, speed: 0 };
    const cards = [...a.cards];
    const gate = w as unknown as { applyDamage(v: ShipRecord, n: number, s: 'shell', by: string): void };
    gate.applyDamage(d, d.stats.maxHp * 10, 'shell', 'a');
    w.step();
    expect(a.pveKills[d.hullId]).toBe(1); // the kill was credited
    expect(a.cards).toEqual(cards);
    const kinds = new Set(w.tickEvents.map((e: GameEvent) => e.k as string));
    expect(kinds.has('dp')).toBe(false);
  });
});
